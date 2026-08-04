"use strict";

/**
 * ActiveClinic reception/queue services (AC-V6-C05).
 * HCO + facility scoped, no clinical encounters.
 */

const repo = require("../repositories/receptionRepository");
const apptRepo = require("../repositories/appointmentRepository");
const accessRepo = require("../repositories/staffAccessRepository");
const {
  getHealthcareOrganizationById,
} = require("./healthcareOrganizationService");
const {
  requireActiveFacility,
} = require("./facilityService");
const {
  getPatientByOrgAndId,
} = require("./activeClinicPatientService");
const {
  authorizeStaffPermission,
  NETWORK_ADMIN,
  RESULT: AUTHZ_RESULT,
} = require("./activeClinicAuthorizationService");
const {
  organizationHasActiveProduct,
} = require("../../platform/services/organizationProductService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_STATUS: "invalid_status",
  PRODUCT_NOT_ENABLED: "activeclinic_product_not_enabled",
  HCO_NOT_FOUND: "healthcare_organization_not_found",
  FACILITY_NOT_FOUND: "facility_not_found",
  PATIENT_NOT_FOUND: "patient_not_found",
  APPOINTMENT_NOT_FOUND: "appointment_not_found",
  SERVICE_POINT_NOT_FOUND: "service_point_not_found",
  ARRIVAL_NOT_FOUND: "arrival_not_found",
  QUEUE_ENTRY_NOT_FOUND: "queue_entry_not_found",
  NOT_FOUND: "not_found",
  ACCESS_DENIED: "access_denied",
  DUPLICATE_ACTIVE_ENTRY: "duplicate_active_queue_entry",
  INVALID_TRANSITION: "invalid_status_transition",
  STALE_VERSION: "stale_version",
  CAPACITY_EXCEEDED: "queue_capacity_exceeded",
});

const PERM = Object.freeze({
  VIEW: "activeclinic.reception.view",
  CHECK_IN: "activeclinic.reception.check_in",
  MANAGE_QUEUE: "activeclinic.reception.manage_queue",
  CALL_NEXT: "activeclinic.reception.call_next",
  TRANSFER: "activeclinic.reception.transfer",
  CANCEL: "activeclinic.reception.cancel",
});

const ACTIVE_QUEUE = Object.freeze(["waiting", "called", "serving", "paused"]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapServicePoint(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    servicePointKey: row.service_point_key,
    displayName: row.display_name,
    description: row.description || null,
    serviceType: row.service_type,
    status: row.status,
    acceptsWalkIn: row.accepts_walk_in,
    acceptsScheduled: row.accepts_scheduled,
    maxQueueCapacity: row.max_queue_capacity || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQueueEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    servicePointId: row.service_point_id,
    patientId: row.patient_id,
    arrivalId: row.arrival_id,
    appointmentId: row.appointment_id || null,
    priorityId: row.priority_id || null,
    queueNumber: row.queue_number,
    queuePosition: row.queue_position,
    status: row.status,
    calledAt: row.called_at || null,
    servingStartedAt: row.serving_started_at || null,
    servingStaffId: row.serving_staff_id || null,
    completedAt: row.completed_at || null,
    completionOutcome: row.completion_outcome || null,
    assignedRoom: row.assigned_room || null,
    estimatedWaitMinutes: row.estimated_wait_minutes || null,
    patientNote: row.patient_note || null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReceptionArrival(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    patientId: row.patient_id,
    appointmentId: row.appointment_id || null,
    arrivalSource: row.arrival_source,
    arrivedAt: row.arrived_at,
    checkedInByStaffId: row.checked_in_by_staff_id || null,
    checkInNote: row.check_in_note || null,
    createdAt: row.created_at,
  };
}

async function withClient(db, fn) {
  if (db && typeof db.query === "function" && typeof db.release === "function") {
    return fn(db);
  }
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

async function authorize(db, input) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey: input.permissionKey,
    facilityId: input.facilityId || null,
  });
  if (!authz.ok) {
    return {
      ok: false,
      code:
        authz.code === AUTHZ_RESULT.DENIED
          ? RESULT.ACCESS_DENIED
          : authz.code || RESULT.ACCESS_DENIED,
    };
  }
  return { ok: true, staffMember: authz.staffMember };
}

async function resolveOrgWide(db, actor) {
  const roles = await accessRepo.listRoleAssignmentsForStaff(db, {
    staffMemberId: actor.staffMemberId,
    organizationId: actor.organizationId,
  });
  return roles.some(
    (r) =>
      r.status === "active" &&
      (r.scope_type === "organisation" || r.role_key === NETWORK_ADMIN)
  );
}

async function resolveFacilityScope(db, actor) {
  if (await resolveOrgWide(db, actor)) return { orgWide: true, facilityIds: null };
  const assignments = await accessRepo.listFacilitiesForStaff(db, {
    staffMemberId: actor.staffMemberId,
    organizationId: actor.organizationId,
  });
  return {
    orgWide: false,
    facilityIds: assignments.filter((a) => a.status === "active").map((a) => a.facility_id),
  };
}

async function checkInScheduledPatient(db, input) {
  const organizationId = String(input.organizationId || "").trim();
  const healthcareOrganizationId = String(input.healthcareOrganizationId || "").trim();
  const facilityId = String(input.facilityId || "").trim();
  const appointmentId = String(input.appointmentId || "").trim();
  const actor = input.actor;

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId) ||
    !UUID_RE.test(facilityId) ||
    !UUID_RE.test(appointmentId) ||
    !actor ||
    !UUID_RE.test(String(actor.staffMemberId || ""))
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, arrival: null };
  }

  const enabled = await organizationHasActiveProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, arrival: null };

  const authz = await authorize(db, {
    organizationId,
    facilityId,
    permissionKey: PERM.CHECK_IN,
    actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, arrival: null };

  const scope = await resolveFacilityScope(db, {
    organizationId,
    staffMemberId: actor.staffMemberId,
  });
  if (!scope.orgWide && !(scope.facilityIds || []).includes(facilityId)) {
    return { ok: false, code: RESULT.ACCESS_DENIED, arrival: null };
  }

  const appointment = await apptRepo.findAppointmentByOrgAndId(db, {
    id: appointmentId,
    organizationId,
    healthcareOrganizationId,
  });
  if (!appointment || appointment.facility_id !== facilityId) {
    return { ok: false, code: RESULT.APPOINTMENT_NOT_FOUND, arrival: null };
  }

  if (!["scheduled", "confirmed"].includes(appointment.status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, arrival: null };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const arrival = await repo.insertReceptionArrival(client, {
        organizationId,
        healthcareOrganizationId,
        facilityId,
        patientId: appointment.patient_id,
        appointmentId: appointment.id,
        arrivalSource: "scheduled_appointment",
        arrivedAt: new Date(),
        checkedInByStaffId: actor.staffMemberId,
        checkInNote: input.checkInNote || null,
      });
      await apptRepo.updateAppointmentByOrgAndId(client, {
        id: appointment.id,
        organizationId,
        healthcareOrganizationId,
        expectedVersion: appointment.version,
        patch: {
          status: "checked_in",
          updatedByStaffId: actor.staffMemberId,
          version: appointment.version + 1,
        },
      });
      await apptRepo.insertStatusEvent(client, {
        organizationId,
        healthcareOrganizationId,
        appointmentId: appointment.id,
        fromStatus: appointment.status,
        toStatus: "checked_in",
        reasonCode: "reception_check_in",
        actorStaffId: actor.staffMemberId,
      });
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId,
        actorUserId: null,
        actionKey: "activeclinic.reception.check_in_scheduled",
        entityType: "reception_arrival",
        entityId: arrival.id,
        outcome: "success",
        metadata: { appointment_id: appointment.id },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, arrival: mapReceptionArrival(arrival) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function checkInWalkInPatient(db, input) {
  const organizationId = String(input.organizationId || "").trim();
  const healthcareOrganizationId = String(input.healthcareOrganizationId || "").trim();
  const facilityId = String(input.facilityId || "").trim();
  const patientId = String(input.patientId || "").trim();
  const actor = input.actor;

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId) ||
    !UUID_RE.test(facilityId) ||
    !UUID_RE.test(patientId) ||
    !actor ||
    !UUID_RE.test(String(actor.staffMemberId || ""))
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, arrival: null };
  }

  const enabled = await organizationHasActiveProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, arrival: null };

  const authz = await authorize(db, {
    organizationId,
    facilityId,
    permissionKey: PERM.CHECK_IN,
    actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, arrival: null };

  const scope = await resolveFacilityScope(db, {
    organizationId,
    staffMemberId: actor.staffMemberId,
  });
  if (!scope.orgWide && !(scope.facilityIds || []).includes(facilityId)) {
    return { ok: false, code: RESULT.ACCESS_DENIED, arrival: null };
  }

  const patient = await getPatientByOrgAndId(db, {
    organizationId,
    healthcareOrganizationId,
    patientId,
  });
  if (!patient.ok) return { ok: false, code: RESULT.PATIENT_NOT_FOUND, arrival: null };
  if (["archived", "deceased"].includes(patient.patient.status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, arrival: null };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const arrival = await repo.insertReceptionArrival(client, {
        organizationId,
        healthcareOrganizationId,
        facilityId,
        patientId,
        appointmentId: null,
        arrivalSource: input.arrivalSource || "walk_in",
        arrivedAt: new Date(),
        checkedInByStaffId: actor.staffMemberId,
        checkInNote: input.checkInNote || null,
      });
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId,
        actorUserId: null,
        actionKey: "activeclinic.reception.check_in_walk_in",
        entityType: "reception_arrival",
        entityId: arrival.id,
        outcome: "success",
        metadata: { patient_id: patientId },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, arrival: mapReceptionArrival(arrival) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function createQueueEntry(db, input) {
  const organizationId = String(input.organizationId || "").trim();
  const healthcareOrganizationId = String(input.healthcareOrganizationId || "").trim();
  const facilityId = String(input.facilityId || "").trim();
  const servicePointId = String(input.servicePointId || "").trim();
  const arrivalId = String(input.arrivalId || "").trim();
  const actor = input.actor;

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId) ||
    !UUID_RE.test(facilityId) ||
    !UUID_RE.test(servicePointId) ||
    !UUID_RE.test(arrivalId) ||
    !actor ||
    !UUID_RE.test(String(actor.staffMemberId || ""))
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, queueEntry: null };
  }

  const enabled = await organizationHasActiveProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, queueEntry: null };

  const authz = await authorize(db, {
    organizationId,
    facilityId,
    permissionKey: PERM.MANAGE_QUEUE,
    actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, queueEntry: null };

  const scope = await resolveFacilityScope(db, {
    organizationId,
    staffMemberId: actor.staffMemberId,
  });
  if (!scope.orgWide && !(scope.facilityIds || []).includes(facilityId)) {
    return { ok: false, code: RESULT.ACCESS_DENIED, queueEntry: null };
  }

  const servicePoint = await repo.findServicePointByOrgAndId(db, {
    id: servicePointId,
    organizationId,
    healthcareOrganizationId,
  });
  if (!servicePoint || servicePoint.facility_id !== facilityId) {
    return { ok: false, code: RESULT.SERVICE_POINT_NOT_FOUND, queueEntry: null };
  }
  if (servicePoint.status !== "active") {
    return { ok: false, code: RESULT.INVALID_STATUS, queueEntry: null };
  }

  const arrival = await repo.findReceptionArrivalById(db, {
    id: arrivalId,
    organizationId,
    healthcareOrganizationId,
  });
  if (!arrival || arrival.facility_id !== facilityId) {
    return { ok: false, code: RESULT.ARRIVAL_NOT_FOUND, queueEntry: null };
  }

  const existing = await repo.findActiveQueueEntryForPatient(db, {
    organizationId,
    healthcareOrganizationId,
    patientId: arrival.patient_id,
    servicePointId,
  });
  if (existing) {
    return { ok: false, code: RESULT.DUPLICATE_ACTIVE_ENTRY, queueEntry: null };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const queueNumber = await repo.allocateQueueNumber(client, { servicePointId });
      const activeCount = await client.query(
        `SELECT COUNT(*)::int AS c FROM activeclinic.queue_entries
          WHERE service_point_id = $1
            AND status IN ('waiting', 'called', 'serving', 'paused')`,
        [servicePointId]
      );
      const currentActive = activeCount.rows[0].c;
      if (
        servicePoint.max_queue_capacity &&
        currentActive >= servicePoint.max_queue_capacity
      ) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.CAPACITY_EXCEEDED, queueEntry: null };
      }

      const queuePosition = currentActive + 1;
      const entry = await repo.insertQueueEntry(client, {
        organizationId,
        healthcareOrganizationId,
        facilityId,
        servicePointId,
        patientId: arrival.patient_id,
        arrivalId: arrival.id,
        appointmentId: arrival.appointment_id || null,
        priorityId: input.priorityId || null,
        queueNumber,
        queuePosition,
        status: "waiting",
        estimatedWaitMinutes: input.estimatedWaitMinutes || null,
        patientNote: input.patientNote || null,
        createdByStaffId: actor.staffMemberId,
        updatedByStaffId: actor.staffMemberId,
      });
      await repo.insertQueueStatusEvent(client, {
        organizationId,
        healthcareOrganizationId,
        queueEntryId: entry.id,
        fromStatus: null,
        toStatus: "waiting",
        reasonCode: "queue_entry_created",
        actorStaffId: actor.staffMemberId,
      });
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId,
        actorUserId: null,
        actionKey: "activeclinic.reception.queue_entry_create",
        entityType: "queue_entry",
        entityId: entry.id,
        outcome: "success",
        metadata: { service_point_key: servicePoint.service_point_key },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, queueEntry: mapQueueEntry(entry) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function listFacilityQueue(db, input) {
  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId,
    permissionKey: PERM.VIEW,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, queueEntries: [] };

  const scope = await resolveFacilityScope(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
  });
  if (!scope.orgWide && !(scope.facilityIds || []).includes(input.facilityId)) {
    return { ok: false, code: RESULT.ACCESS_DENIED, queueEntries: [] };
  }

  const rows = await repo.listQueueEntriesByFacility(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    facilityId: input.facilityId,
    status: input.status || null,
    statuses: input.statuses || null,
    servicePointIds: input.servicePointIds || null,
    from: input.from || null,
    to: input.to || null,
    limit: input.limit,
    offset: input.offset,
  });
  return { ok: true, code: RESULT.OK, queueEntries: rows.map(mapQueueEntry) };
}

async function getQueueEntryDetail(db, input) {
  const row = await repo.findQueueEntryByOrgAndId(db, {
    id: input.queueEntryId,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
  });
  if (!row) return { ok: false, code: RESULT.QUEUE_ENTRY_NOT_FOUND, queueEntry: null };

  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: row.facility_id,
    permissionKey: PERM.VIEW,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, queueEntry: null };

  const scope = await resolveFacilityScope(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
  });
  if (!scope.orgWide && !(scope.facilityIds || []).includes(row.facility_id)) {
    return { ok: false, code: RESULT.QUEUE_ENTRY_NOT_FOUND, queueEntry: null };
  }

  const events = await repo.listQueueStatusEvents(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    queueEntryId: row.id,
  });
  return {
    ok: true,
    code: RESULT.OK,
    queueEntry: mapQueueEntry(row),
    statusEvents: events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      reasonCode: e.reason_code,
      createdAt: e.created_at,
    })),
  };
}

async function appendQueueStatusEvent(db, input) {
  const detail = await getQueueEntryDetail(db, input);
  if (!detail.ok) return detail;

  const toStatus = String(input.toStatus || "").trim();
  const fromStatus = detail.queueEntry.status;
  if (toStatus === fromStatus) {
    return { ok: false, code: RESULT.INVALID_TRANSITION, queueEntry: detail.queueEntry };
  }

  let permissionKey = PERM.MANAGE_QUEUE;
  if (toStatus === "called") permissionKey = PERM.CALL_NEXT;
  if (toStatus === "cancelled" || toStatus === "left_before_service") {
    permissionKey = PERM.CANCEL;
  }
  if (toStatus === "transferred") permissionKey = PERM.TRANSFER;

  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: detail.queueEntry.facilityId,
    permissionKey,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, queueEntry: null };

  const allowed = {
    waiting: ["called", "cancelled", "left_before_service", "transferred"],
    called: ["serving", "waiting", "cancelled", "left_before_service", "transferred"],
    serving: ["paused", "completed", "transferred", "cancelled"],
    paused: ["serving", "completed", "transferred", "cancelled"],
    completed: [],
    cancelled: [],
    left_before_service: [],
    transferred: [],
  };
  if (!(allowed[fromStatus] || []).includes(toStatus)) {
    return { ok: false, code: RESULT.INVALID_TRANSITION, queueEntry: detail.queueEntry };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const patch = {
        status: toStatus,
        updatedByStaffId: input.actor.staffMemberId,
        version: detail.queueEntry.version + 1,
      };
      if (toStatus === "called") patch.calledAt = new Date();
      if (toStatus === "serving") {
        patch.servingStartedAt = new Date();
        patch.servingStaffId = input.actor.staffMemberId;
      }
      if (toStatus === "completed") {
        patch.completedAt = new Date();
        patch.completionOutcome = input.completionOutcome || "service_completed";
      }
      if (input.assignedRoom !== undefined) patch.assignedRoom = input.assignedRoom;

      const updated = await repo.updateQueueEntryByOrgAndId(client, {
        id: detail.queueEntry.id,
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        expectedVersion: detail.queueEntry.version,
        patch,
      });
      if (!updated) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.STALE_VERSION, queueEntry: null };
      }
      await repo.insertQueueStatusEvent(client, {
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        queueEntryId: detail.queueEntry.id,
        fromStatus,
        toStatus,
        reasonCode: input.reason || toStatus,
        note: input.note || null,
        actorStaffId: input.actor.staffMemberId,
      });
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId: input.organizationId,
        actorUserId: null,
        actionKey: "activeclinic.reception.queue_status_change",
        entityType: "queue_entry",
        entityId: detail.queueEntry.id,
        outcome: "success",
        metadata: { from_status: fromStatus, to_status: toStatus, reason_code: input.reason || toStatus },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, queueEntry: mapQueueEntry(updated) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function callNextQueueEntry(db, input) {
  return appendQueueStatusEvent(db, { ...input, toStatus: "called" });
}

async function startServingQueueEntry(db, input) {
  return appendQueueStatusEvent(db, { ...input, toStatus: "serving" });
}

async function completeQueueEntry(db, input) {
  return appendQueueStatusEvent(db, {
    ...input,
    toStatus: "completed",
    completionOutcome: input.completionOutcome || "service_completed",
  });
}

async function pauseQueueEntry(db, input) {
  return appendQueueStatusEvent(db, { ...input, toStatus: "paused" });
}

async function transferQueueEntry(db, input) {
  return appendQueueStatusEvent(db, {
    ...input,
    toStatus: "transferred",
    reason: input.reason || "department_transfer",
  });
}

async function cancelQueueEntry(db, input) {
  return appendQueueStatusEvent(db, { ...input, toStatus: "cancelled" });
}

async function markLeftBeforeService(db, input) {
  return appendQueueStatusEvent(db, { ...input, toStatus: "left_before_service" });
}

/**
 * Assign room / desk without changing queue status (Queue Assignment Stitch).
 * Records an audit + status-event with same from/to status for history.
 */
async function assignQueueEntryRoom(db, input) {
  const detail = await getQueueEntryDetail(db, input);
  if (!detail.ok) return detail;

  const status = detail.queueEntry.status;
  if (["completed", "cancelled", "left_before_service", "transferred"].includes(status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, queueEntry: detail.queueEntry };
  }

  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: detail.queueEntry.facilityId,
    permissionKey: PERM.MANAGE_QUEUE,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, queueEntry: null };

  const assignedRoom = String(input.assignedRoom || "").trim() || null;
  if (assignedRoom && assignedRoom.length > 64) {
    return { ok: false, code: RESULT.INVALID_INPUT, queueEntry: null };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const updated = await repo.updateQueueEntryByOrgAndId(client, {
        id: detail.queueEntry.id,
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        expectedVersion: detail.queueEntry.version,
        patch: {
          assignedRoom,
          updatedByStaffId: input.actor.staffMemberId,
          version: detail.queueEntry.version + 1,
        },
      });
      if (!updated) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.STALE_VERSION, queueEntry: null };
      }
      await repo.insertQueueStatusEvent(client, {
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        queueEntryId: detail.queueEntry.id,
        fromStatus: status,
        toStatus: status,
        reasonCode: "room_assignment",
        note: assignedRoom ? `Assigned room: ${assignedRoom}` : "Cleared room assignment",
        actorStaffId: input.actor.staffMemberId,
      });
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId: input.organizationId,
        actorUserId: null,
        actionKey: "activeclinic.reception.queue_assignment",
        entityType: "queue_entry",
        entityId: detail.queueEntry.id,
        outcome: "success",
        metadata: { assigned_room: assignedRoom, status },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, queueEntry: mapQueueEntry(updated) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

module.exports = {
  RESULT,
  PERM,
  checkInScheduledPatient,
  checkInWalkInPatient,
  createQueueEntry,
  listFacilityQueue,
  getQueueEntryDetail,
  appendQueueStatusEvent,
  callNextQueueEntry,
  startServingQueueEntry,
  completeQueueEntry,
  pauseQueueEntry,
  transferQueueEntry,
  cancelQueueEntry,
  markLeftBeforeService,
  assignQueueEntryRoom,
  mapServicePoint,
  mapQueueEntry,
  mapReceptionArrival,
};
