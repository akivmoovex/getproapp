"use strict";

/**
 * ActiveClinic appointment scheduling services (AC-V6-C03).
 * Administrative only — never creates clinical encounters.
 */

const repo = require("../repositories/appointmentRepository");
const registrationRepo = require("../repositories/patientRegistrationRepository");
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
const {
  normalizeTimezone,
} = require("./normalizeActiveClinicContact");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_STATUS: "invalid_status",
  PRODUCT_NOT_ENABLED: "activeclinic_product_not_enabled",
  HCO_NOT_FOUND: "healthcare_organization_not_found",
  FACILITY_NOT_FOUND: "facility_not_found",
  PATIENT_NOT_FOUND: "patient_not_found",
  SERVICE_NOT_FOUND: "service_type_not_found",
  NOT_FOUND: "appointment_not_found",
  ACCESS_DENIED: "access_denied",
  COLLISION: "appointment_collision",
  STAFF_REQUIRED: "assigned_staff_required",
  STALE_VERSION: "stale_version",
  INVALID_TRANSITION: "invalid_status_transition",
});

const PERM = Object.freeze({
  VIEW: "activeclinic.appointment.view",
  CREATE: "activeclinic.appointment.create",
  UPDATE: "activeclinic.appointment.update",
  CANCEL: "activeclinic.appointment.cancel",
  CHECK_IN: "activeclinic.appointment.check_in",
  MANAGE_SCHEDULE: "activeclinic.appointment.manage_schedule",
});

const ACTIVE_BOOKING = Object.freeze([
  "scheduled",
  "confirmed",
  "checked_in",
  "in_progress",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    facilityId: row.facility_id,
    patientId: row.patient_id,
    serviceTypeId: row.service_type_id,
    assignedStaffId: row.assigned_staff_id || null,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    status: row.status,
    schedulingNote: row.scheduling_note || null,
    cancellationReason: row.cancellation_reason || null,
    rescheduledFromAppointmentId: row.rescheduled_from_appointment_id || null,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapServiceType(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    healthcareOrganizationId: row.healthcare_organization_id,
    serviceKey: row.service_key,
    displayName: row.display_name,
    description: row.description || null,
    defaultDurationMinutes: row.default_duration_minutes,
    requiresAssignedStaff: row.requires_assigned_staff === true,
    status: row.status,
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

async function createAppointmentServiceType(db, input) {
  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: null,
    permissionKey: PERM.MANAGE_SCHEDULE,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, serviceType: null };

  const key = String(input.serviceKey || "")
    .trim()
    .toLowerCase();
  const displayName = String(input.displayName || "").trim();
  if (!key || !displayName) {
    return { ok: false, code: RESULT.INVALID_INPUT, serviceType: null };
  }

  const row = await repo.insertServiceType(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    serviceKey: key,
    displayName,
    description: input.description || null,
    defaultDurationMinutes: input.defaultDurationMinutes || 30,
    requiresAssignedStaff: input.requiresAssignedStaff === true,
    status: "active",
  });
  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.appointment.service_type_create",
    entityType: "appointment_service_type",
    entityId: row.id,
    outcome: "success",
    metadata: { entity_key: key },
  });
  return { ok: true, code: RESULT.OK, serviceType: mapServiceType(row) };
}

async function listAppointmentServiceTypes(db, input) {
  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.VIEW,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, serviceTypes: [] };
  const rows = await repo.listServiceTypesByOrg(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    includeInactive: input.includeInactive === true,
  });
  return { ok: true, code: RESULT.OK, serviceTypes: rows.map(mapServiceType) };
}

async function createAppointment(db, input) {
  const organizationId = String(input.organizationId || "").trim();
  const healthcareOrganizationId = String(input.healthcareOrganizationId || "").trim();
  const facilityId = String(input.facilityId || "").trim();
  const patientId = String(input.patientId || "").trim();
  const serviceTypeId = String(input.serviceTypeId || "").trim();
  const actor = input.actor;

  if (
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId) ||
    !UUID_RE.test(facilityId) ||
    !UUID_RE.test(patientId) ||
    !UUID_RE.test(serviceTypeId) ||
    !actor ||
    !UUID_RE.test(String(actor.staffMemberId || ""))
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, appointment: null };
  }

  const enabled = await organizationHasActiveProduct(db, {
    organizationId,
    applicationCode: "activeclinic",
  });
  if (!enabled) return { ok: false, code: RESULT.PRODUCT_NOT_ENABLED, appointment: null };

  const authz = await authorize(db, {
    organizationId,
    facilityId,
    permissionKey: PERM.CREATE,
    actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, appointment: null };

  const scope = await resolveFacilityScope(db, {
    organizationId,
    staffMemberId: actor.staffMemberId,
  });
  if (!scope.orgWide && !(scope.facilityIds || []).includes(facilityId)) {
    return { ok: false, code: RESULT.ACCESS_DENIED, appointment: null };
  }

  const hco = await getHealthcareOrganizationById(db, {
    id: healthcareOrganizationId,
    organizationId,
  });
  if (!hco.ok) return { ok: false, code: RESULT.HCO_NOT_FOUND, appointment: null };

  const facility = await requireActiveFacility(db, { facilityId, organizationId });
  if (!facility.ok) return { ok: false, code: RESULT.FACILITY_NOT_FOUND, appointment: null };
  if (facility.facility.healthcareOrganizationId !== healthcareOrganizationId) {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, appointment: null };
  }

  const patient = await getPatientByOrgAndId(db, {
    organizationId,
    healthcareOrganizationId,
    patientId,
  });
  if (!patient.ok) return { ok: false, code: RESULT.PATIENT_NOT_FOUND, appointment: null };
  if (["archived", "deceased"].includes(patient.patient.status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, appointment: null };
  }

  // Ensure facility link or allow org-wide booking then create link.
  const visible = await registrationRepo.patientVisibleInFacilities(db, {
    organizationId,
    healthcareOrganizationId,
    patientId,
    facilityIds: [facilityId],
  });
  if (!visible) {
    await registrationRepo.insertFacilityLink(db, {
      organizationId,
      healthcareOrganizationId,
      patientId,
      facilityId,
      relationshipType: "administrative_link",
      status: "active",
    });
  }

  const service = await repo.findServiceTypeByOrgAndId(db, {
    id: serviceTypeId,
    organizationId,
    healthcareOrganizationId,
  });
  if (!service || service.status !== "active") {
    return { ok: false, code: RESULT.SERVICE_NOT_FOUND, appointment: null };
  }

  const startsAt = new Date(input.startsAt);
  let endsAt = input.endsAt ? new Date(input.endsAt) : null;
  if (!endsAt || Number.isNaN(endsAt.getTime())) {
    endsAt = new Date(startsAt.getTime() + service.default_duration_minutes * 60000);
  }
  if (Number.isNaN(startsAt.getTime()) || !(startsAt < endsAt)) {
    return { ok: false, code: RESULT.INVALID_INPUT, appointment: null };
  }

  const tz = normalizeTimezone(input.timezone || facility.facility.timezone || hco.healthcareOrganization.timezone);
  if (!tz.ok) return { ok: false, code: RESULT.INVALID_INPUT, appointment: null };

  const assignedStaffId = input.assignedStaffId
    ? String(input.assignedStaffId).trim()
    : null;
  if (service.requires_assigned_staff && !assignedStaffId) {
    return { ok: false, code: RESULT.STAFF_REQUIRED, appointment: null };
  }

  if (assignedStaffId) {
    const collision = await repo.findStaffCollision(db, {
      organizationId,
      healthcareOrganizationId,
      assignedStaffId,
      startsAt,
      endsAt,
    });
    if (collision) return { ok: false, code: RESULT.COLLISION, appointment: null };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const row = await repo.insertAppointment(client, {
        organizationId,
        healthcareOrganizationId,
        facilityId,
        patientId,
        serviceTypeId,
        assignedStaffId,
        startsAt,
        endsAt,
        timezone: tz.value,
        status: "scheduled",
        schedulingNote: input.schedulingNote || null,
        createdByStaffId: actor.staffMemberId,
        updatedByStaffId: actor.staffMemberId,
      });
      await repo.insertStatusEvent(client, {
        organizationId,
        healthcareOrganizationId,
        appointmentId: row.id,
        fromStatus: null,
        toStatus: "scheduled",
        reasonCode: "created",
        actorStaffId: actor.staffMemberId,
      });
      if (input.reminderChannel && input.reminderChannel !== "none") {
        await repo.insertReminderRequest(client, {
          organizationId,
          healthcareOrganizationId,
          appointmentId: row.id,
          preferredChannel: input.reminderChannel,
          scheduledFor: new Date(startsAt.getTime() - 24 * 60 * 60 * 1000),
          deliveryState: "unavailable",
        });
      }
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId,
        actorUserId: null,
        actionKey: "activeclinic.appointment.create",
        entityType: "appointment",
        entityId: row.id,
        outcome: "success",
        metadata: {
          facility_key: facility.facility.facilityKey,
          status: "scheduled",
        },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, appointment: mapAppointment(row) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function listAppointments(db, input) {
  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.VIEW,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, appointments: [] };

  const scope = await resolveFacilityScope(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
  });
  let facilityIds = null;
  if (!scope.orgWide) {
    facilityIds = scope.facilityIds || [];
    if (input.facilityId) {
      if (!facilityIds.includes(input.facilityId)) {
        return { ok: false, code: RESULT.ACCESS_DENIED, appointments: [] };
      }
      facilityIds = [input.facilityId];
    }
    if (!facilityIds.length) return { ok: true, code: RESULT.OK, appointments: [] };
  } else if (input.facilityId) {
    facilityIds = [input.facilityId];
  }

  const rows = await repo.listAppointmentsByOrg(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    facilityIds,
    patientId: input.patientId || null,
    assignedStaffId: input.assignedStaffId || null,
    serviceTypeId: input.serviceTypeId || null,
    status: input.status || null,
    startsFrom: input.startsFrom || null,
    startsTo: input.startsTo || null,
    limit: input.limit,
    offset: input.offset,
  });
  return { ok: true, code: RESULT.OK, appointments: rows.map(mapAppointment) };
}

async function getAppointmentDetail(db, input) {
  const row = await repo.findAppointmentByOrgAndId(db, {
    id: input.appointmentId,
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
  });
  if (!row) return { ok: false, code: RESULT.NOT_FOUND, appointment: null };

  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: row.facility_id,
    permissionKey: PERM.VIEW,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, appointment: null };

  const scope = await resolveFacilityScope(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
  });
  if (!scope.orgWide && !(scope.facilityIds || []).includes(row.facility_id)) {
    return { ok: false, code: RESULT.NOT_FOUND, appointment: null };
  }

  const events = await repo.listStatusEvents(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    appointmentId: row.id,
  });
  return {
    ok: true,
    code: RESULT.OK,
    appointment: mapAppointment(row),
    statusEvents: events.map((e) => ({
      id: e.id,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      reasonCode: e.reason_code,
      createdAt: e.created_at,
    })),
  };
}

async function appendAppointmentStatusEvent(db, input) {
  const detail = await getAppointmentDetail(db, input);
  if (!detail.ok) return detail;

  const toStatus = String(input.toStatus || "").trim();
  const fromStatus = detail.appointment.status;
  if (toStatus === fromStatus) {
    return { ok: false, code: RESULT.INVALID_TRANSITION, appointment: detail.appointment };
  }

  let permissionKey = PERM.UPDATE;
  if (toStatus === "cancelled") permissionKey = PERM.CANCEL;
  if (toStatus === "checked_in") permissionKey = PERM.CHECK_IN;

  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: detail.appointment.facilityId,
    permissionKey,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, appointment: null };

  const allowed = {
    requested: [],
    scheduled: ["confirmed", "checked_in", "cancelled", "no_show", "rescheduled"],
    confirmed: ["checked_in", "cancelled", "no_show", "rescheduled"],
    checked_in: ["in_progress", "completed", "cancelled", "no_show"],
    in_progress: ["completed", "cancelled"],
    completed: [],
    cancelled: [],
    no_show: [],
    rescheduled: [],
  };
  if (!(allowed[fromStatus] || []).includes(toStatus)) {
    return { ok: false, code: RESULT.INVALID_TRANSITION, appointment: detail.appointment };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const patch = {
        status: toStatus,
        updatedByStaffId: input.actor.staffMemberId,
        version: detail.appointment.version + 1,
      };
      if (toStatus === "cancelled") {
        patch.cancellationReason = String(input.reason || "cancelled").slice(0, 200);
      }
      const updated = await repo.updateAppointmentByOrgAndId(client, {
        id: detail.appointment.id,
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        expectedVersion: detail.appointment.version,
        patch,
      });
      if (!updated) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.STALE_VERSION, appointment: null };
      }
      await repo.insertStatusEvent(client, {
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        appointmentId: detail.appointment.id,
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
        actionKey: "activeclinic.appointment.status_change",
        entityType: "appointment",
        entityId: detail.appointment.id,
        outcome: "success",
        metadata: { from_status: fromStatus, to_status: toStatus, reason_code: input.reason || toStatus },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, appointment: mapAppointment(updated) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

async function cancelAppointment(db, input) {
  return appendAppointmentStatusEvent(db, { ...input, toStatus: "cancelled" });
}

async function checkInAppointment(db, input) {
  return appendAppointmentStatusEvent(db, { ...input, toStatus: "checked_in" });
}

async function markNoShowAppointment(db, input) {
  return appendAppointmentStatusEvent(db, {
    ...input,
    toStatus: "no_show",
    reason: input.reason || "no_show",
  });
}

async function updateAppointment(db, input) {
  const detail = await getAppointmentDetail(db, input);
  if (!detail.ok) return detail;
  if (!ACTIVE_BOOKING.includes(detail.appointment.status)) {
    return { ok: false, code: RESULT.INVALID_STATUS, appointment: detail.appointment };
  }

  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: detail.appointment.facilityId,
    permissionKey: PERM.UPDATE,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, appointment: null };

  const startsAt =
    input.startsAt != null ? new Date(input.startsAt) : new Date(detail.appointment.startsAt);
  const endsAt =
    input.endsAt != null ? new Date(input.endsAt) : new Date(detail.appointment.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || !(startsAt < endsAt)) {
    return { ok: false, code: RESULT.INVALID_INPUT, appointment: null };
  }

  let timezone = detail.appointment.timezone;
  if (input.timezone) {
    const tz = normalizeTimezone(input.timezone);
    if (!tz.ok) return { ok: false, code: RESULT.INVALID_INPUT, appointment: null };
    timezone = tz.value;
  }

  const assignedStaffId =
    input.assignedStaffId !== undefined
      ? input.assignedStaffId
        ? String(input.assignedStaffId).trim()
        : null
      : detail.appointment.assignedStaffId;

  if (assignedStaffId) {
    const collision = await repo.findStaffCollision(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
      assignedStaffId,
      startsAt,
      endsAt,
      excludeAppointmentId: detail.appointment.id,
    });
    if (collision) return { ok: false, code: RESULT.COLLISION, appointment: null };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const updated = await repo.updateAppointmentByOrgAndId(client, {
        id: detail.appointment.id,
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        expectedVersion: input.expectedVersion ?? detail.appointment.version,
        patch: {
          startsAt,
          endsAt,
          timezone,
          assignedStaffId,
          schedulingNote:
            input.schedulingNote !== undefined
              ? input.schedulingNote
              : detail.appointment.schedulingNote,
          updatedByStaffId: input.actor.staffMemberId,
          version: (input.expectedVersion ?? detail.appointment.version) + 1,
        },
      });
      if (!updated) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.STALE_VERSION, appointment: null };
      }
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId: input.organizationId,
        actorUserId: null,
        actionKey: "activeclinic.appointment.update",
        entityType: "appointment",
        entityId: detail.appointment.id,
        outcome: "success",
        metadata: { status: updated.status },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, appointment: mapAppointment(updated) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

/**
 * Creates a replacement appointment and marks the prior row rescheduled
 * in one transaction (no orphan bookings).
 */
async function rescheduleAppointment(db, input) {
  const detail = await getAppointmentDetail(db, input);
  if (!detail.ok) return detail;
  if (!["scheduled", "confirmed"].includes(detail.appointment.status)) {
    return { ok: false, code: RESULT.INVALID_TRANSITION, appointment: detail.appointment };
  }

  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: detail.appointment.facilityId,
    permissionKey: PERM.UPDATE,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, appointment: null };

  const facilityId = input.facilityId || detail.appointment.facilityId;
  const assignedStaffId =
    input.assignedStaffId !== undefined
      ? input.assignedStaffId
        ? String(input.assignedStaffId).trim()
        : null
      : detail.appointment.assignedStaffId;

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || !(startsAt < endsAt)) {
    return { ok: false, code: RESULT.INVALID_INPUT, appointment: null };
  }

  const tz = normalizeTimezone(input.timezone || detail.appointment.timezone);
  if (!tz.ok) return { ok: false, code: RESULT.INVALID_INPUT, appointment: null };

  if (assignedStaffId) {
    const collision = await repo.findStaffCollision(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
      assignedStaffId,
      startsAt,
      endsAt,
      excludeAppointmentId: detail.appointment.id,
    });
    if (collision) return { ok: false, code: RESULT.COLLISION, appointment: null };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const prior = await repo.updateAppointmentByOrgAndId(client, {
        id: detail.appointment.id,
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        expectedVersion: detail.appointment.version,
        patch: {
          status: "rescheduled",
          updatedByStaffId: input.actor.staffMemberId,
          version: detail.appointment.version + 1,
        },
      });
      if (!prior) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.STALE_VERSION, appointment: null };
      }
      await repo.insertStatusEvent(client, {
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        appointmentId: detail.appointment.id,
        fromStatus: detail.appointment.status,
        toStatus: "rescheduled",
        reasonCode: "rescheduled",
        actorStaffId: input.actor.staffMemberId,
      });

      const row = await repo.insertAppointment(client, {
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        facilityId,
        patientId: detail.appointment.patientId,
        serviceTypeId: detail.appointment.serviceTypeId,
        assignedStaffId,
        startsAt,
        endsAt,
        timezone: tz.value,
        status: "scheduled",
        schedulingNote:
          input.schedulingNote !== undefined
            ? input.schedulingNote
            : detail.appointment.schedulingNote,
        rescheduledFromAppointmentId: detail.appointment.id,
        createdByStaffId: input.actor.staffMemberId,
        updatedByStaffId: input.actor.staffMemberId,
      });
      await repo.insertStatusEvent(client, {
        organizationId: input.organizationId,
        healthcareOrganizationId: input.healthcareOrganizationId,
        appointmentId: row.id,
        fromStatus: null,
        toStatus: "scheduled",
        reasonCode: "rescheduled_from",
        note: `from:${detail.appointment.id}`,
        actorStaffId: input.actor.staffMemberId,
      });
      await recordAuditEventSafe(client, {
        deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
        organizationId: input.organizationId,
        actorUserId: null,
        actionKey: "activeclinic.appointment.reschedule",
        entityType: "appointment",
        entityId: row.id,
        outcome: "success",
        metadata: { reason_code: "rescheduled" },
      });
      await client.query("COMMIT");
      return { ok: true, code: RESULT.OK, appointment: mapAppointment(row) };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  });
}

/**
 * Slot listing is rule-light in C03: returns requested window metadata only
 * when no staff collision for optional assigned staff. Full calendar grids deferred.
 */
async function listAvailableAppointmentSlots(db, input) {
  const authz = await authorize(db, {
    organizationId: input.organizationId,
    facilityId: input.facilityId || null,
    permissionKey: PERM.VIEW,
    actor: input.actor,
  });
  if (!authz.ok) return { ok: false, code: authz.code, slots: [] };

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (!(startsAt < endsAt)) return { ok: false, code: RESULT.INVALID_INPUT, slots: [] };

  if (input.assignedStaffId) {
    const collision = await repo.findStaffCollision(db, {
      organizationId: input.organizationId,
      healthcareOrganizationId: input.healthcareOrganizationId,
      assignedStaffId: input.assignedStaffId,
      startsAt,
      endsAt,
    });
    if (collision) return { ok: true, code: RESULT.OK, slots: [] };
  }

  return {
    ok: true,
    code: RESULT.OK,
    slots: [
      {
        startsAt,
        endsAt,
        facilityId: input.facilityId || null,
        assignedStaffId: input.assignedStaffId || null,
        available: true,
      },
    ],
  };
}

module.exports = {
  RESULT,
  PERM,
  createAppointmentServiceType,
  listAppointmentServiceTypes,
  createAppointment,
  updateAppointment,
  listAppointments,
  getAppointmentDetail,
  appendAppointmentStatusEvent,
  cancelAppointment,
  checkInAppointment,
  markNoShowAppointment,
  rescheduleAppointment,
  listAvailableAppointmentSlots,
  mapAppointment,
  mapServiceType,
};
