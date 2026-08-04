"use strict";

/**
 * ActiveClinic reception/queue loaders (AC-V6-C05).
 * P03 Stitch screens: queue list, check-in, walk-in, call-board, detail.
 */

const {
  listFacilityQueue,
  getQueueEntryDetail,
  RESULT: QUEUE_RESULT,
  PERM,
  mapServicePoint,
} = require("./activeClinicReceptionService");
const receptionRepo = require("../repositories/receptionRepository");
const {
  getPatientByOrgAndId,
} = require("./activeClinicPatientService");
const {
  formatPatientDisplayName,
} = require("./patientPrivacyHelpers");
const {
  listFacilitiesByOrganization,
} = require("./facilityService");
const {
  getAppointmentDetail,
  RESULT: APPT_RESULT,
} = require("./activeClinicAppointmentService");

const QUEUE_STATUS_LABELS = Object.freeze({
  waiting: "Waiting",
  called: "Called",
  serving: "Serving",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
  left_before_service: "Left before service",
  transferred: "Transferred",
});

const STITCH = Object.freeze({
  queueDesktop: "8b7173ba4ff94eb2a7d7e548b5f7253d",
  queueMobile: "73499b0dfef446c99a908b1cc56252a5",
  checkInDesktop: "9284064428f443b1a3a1504054827d91",
  walkInDesktop: "305d90143b0e4381b112bf6eb113f1c2",
  calledDesktop: "8dca6dbd36b840928e73d6674bbcb3ea",
  didNotRespondDesktop: "f7841548662446cfa8d70d0772d3fa9f",
  assignmentDesktop: "1fa99f4a358c47ffb858addae7095fe8",
  transferDesktop: "e807a1354fdd418391496e69e5ac5f3e",
  staleWarningDesktop: "bf9b846da6174bf995793b09e869cd30",
});

function hasPerm(perms, key) {
  return Array.isArray(perms) ? perms.includes(key) : false;
}

function actorFromAuth(auth) {
  return {
    staffMemberId: auth.staffMember.id,
    platformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
    organizationId: auth.organization.id,
  };
}

function formatPatientInitials(patient) {
  if (!patient) return "—";
  const firstName = (patient.firstName || patient.first_name || "").trim();
  const lastName = (patient.lastName || patient.last_name || "").trim();
  if (!firstName && !lastName) return "—";
  const first = firstName.charAt(0).toUpperCase();
  const last = lastName.charAt(0).toUpperCase();
  return `${first}${last}`;
}

async function loadFacilityOptions(db, auth) {
  const listed = await listFacilitiesByOrganization(db, {
    organizationId: auth.organization.id,
  });
  const facilities = (listed.facilities || []).filter((f) =>
    ["active", "planned"].includes(f.status)
  );
  return facilities.map((f) => ({
    id: f.id,
    key: f.facilityKey,
    displayName: f.displayName,
    status: f.status,
    timezone: f.timezone,
  }));
}

async function enrichQueueEntries(db, auth, entries) {
  if (!entries.length) return [];
  const orgId = auth.organization.id;
  const hcoId = auth.healthcareOrganization.id;
  const patientIds = [...new Set(entries.map((e) => e.patientId))];
  const servicePointIds = [...new Set(entries.map((e) => e.servicePointId))];

  const patients = {};
  for (const id of patientIds) {
    const p = await getPatientByOrgAndId(db, {
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
      patientId: id,
    });
    if (p.ok) {
      patients[id] = {
        id: p.patient.id,
        patientNumber: p.patient.patientNumber,
        displayName: formatPatientDisplayName(p.patient),
        initials: formatPatientInitials(p.patient),
      };
    }
  }

  const servicePoints = {};
  for (const spId of servicePointIds) {
    const sp = await receptionRepo.findServicePointByOrgAndId(db, {
      id: spId,
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
    });
    if (sp) servicePoints[spId] = mapServicePoint(sp);
  }

  return entries.map((e) => ({
    ...e,
    statusLabel: QUEUE_STATUS_LABELS[e.status] || e.status,
    patient: patients[e.patientId] || null,
    servicePoint: servicePoints[e.servicePointId] || null,
  }));
}

async function loadActiveClinicReceptionQueueScreen(db, input) {
  const { auth, query } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", queue: null };
  }

  const statuses = (query && query.status) ? [String(query.status)] : ["waiting", "called", "serving", "paused"];
  const listed = await listFacilityQueue(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    facilityId: selectedFacility.id,
    statuses,
    limit: 200,
    offset: 0,
    actor: actorFromAuth(auth),
  });
  if (!listed.ok) {
    return { ok: false, code: listed.code, queue: null };
  }

  const entries = await enrichQueueEntries(db, auth, listed.queueEntries);
  const servicePoints = await receptionRepo.listServicePointsByFacility(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    facilityId: selectedFacility.id,
    includeInactive: false,
  });

  return {
    ok: true,
    code: QUEUE_RESULT.OK,
    queue: {
      entries,
      servicePoints: servicePoints.map(mapServicePoint),
      facility: selectedFacility,
      actions: {
        canCheckIn: hasPerm(perms, PERM.CHECK_IN),
        canCallNext: hasPerm(perms, PERM.CALL_NEXT),
        canManageQueue: hasPerm(perms, PERM.MANAGE_QUEUE),
      },
      stitch: {
        desktop: STITCH.queueDesktop,
        mobile: STITCH.queueMobile,
      },
    },
  };
}

async function loadActiveClinicReceptionCheckInScreen(db, input) {
  const { auth, appointmentId, error } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", checkIn: null };
  }

  let appointment = null;
  if (appointmentId) {
    const detail = await getAppointmentDetail(db, {
      organizationId: auth.organization.id,
      healthcareOrganizationId: auth.healthcareOrganization.id,
      appointmentId,
      actor: actorFromAuth(auth),
    });
    if (detail.ok) {
      // Enrich appointment with patient data
      const patient = await getPatientByOrgAndId(db, {
        organizationId: auth.organization.id,
        healthcareOrganizationId: auth.healthcareOrganization.id,
        patientId: detail.appointment.patientId,
      });
      appointment = {
        ...detail.appointment,
        patient: patient.ok && patient.patient ? {
          id: patient.patient.id,
          patientNumber: patient.patient.patientNumber,
          displayName: formatPatientDisplayName(patient.patient),
        } : null,
        statusLabel: detail.appointment.status,
      };
    }
  }

  const servicePoints = await receptionRepo.listServicePointsByFacility(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    facilityId: selectedFacility.id,
    includeInactive: false,
  });

  return {
    ok: true,
    checkIn: {
      appointment,
      facility: selectedFacility,
      servicePoints: servicePoints.map(mapServicePoint),
      error: error || null,
      actions: {
        canCheckIn: hasPerm(perms, PERM.CHECK_IN),
      },
      stitch: {
        desktop: STITCH.checkInDesktop,
      },
    },
  };
}

async function loadActiveClinicReceptionWalkInScreen(db, input) {
  const { auth, values, error } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", walkIn: null };
  }

  const servicePoints = await receptionRepo.listServicePointsByFacility(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    facilityId: selectedFacility.id,
    includeInactive: false,
  });

  return {
    ok: true,
    walkIn: {
      values: values || { patientNumber: "", servicePointId: "", checkInNote: "" },
      facility: selectedFacility,
      servicePoints: servicePoints.map(mapServicePoint),
      error: error || null,
      actions: {
        canCheckIn: hasPerm(perms, PERM.CHECK_IN),
        canManageQueue: hasPerm(perms, PERM.MANAGE_QUEUE),
      },
      stitch: {
        desktop: STITCH.walkInDesktop,
      },
    },
  };
}

async function loadActiveClinicReceptionQueueDetailScreen(db, input) {
  const { auth, queueEntryId } = input;
  const detail = await getQueueEntryDetail(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    queueEntryId,
    actor: actorFromAuth(auth),
  });
  if (!detail.ok) return { ok: false, code: detail.code, detail: null };

  const enriched = (await enrichQueueEntries(db, auth, [detail.queueEntry]))[0];
  const perms = auth.permissions || [];
  const status = detail.queueEntry.status;

  const canCall = hasPerm(perms, PERM.CALL_NEXT) && status === "waiting";
  const canStartServing = hasPerm(perms, PERM.MANAGE_QUEUE) && status === "called";
  const canComplete = hasPerm(perms, PERM.MANAGE_QUEUE) && ["serving", "paused"].includes(status);
  const canPause = hasPerm(perms, PERM.MANAGE_QUEUE) && status === "serving";
  const canRequeue = hasPerm(perms, PERM.MANAGE_QUEUE) && status === "called";
  const canCancel = hasPerm(perms, PERM.CANCEL) && ["waiting", "called", "serving", "paused"].includes(status);
  const canTransfer = hasPerm(perms, PERM.TRANSFER) && ["waiting", "called", "serving", "paused"].includes(status);
  const canMarkLeft = hasPerm(perms, PERM.CANCEL) && ["waiting", "called"].includes(status);
  const canAssign =
    hasPerm(perms, PERM.MANAGE_QUEUE) &&
    ["waiting", "called", "serving", "paused"].includes(status);

  return {
    ok: true,
    detail: {
      queueEntry: enriched,
      statusEvents: detail.statusEvents || [],
      actions: {
        canCall,
        canStartServing,
        canComplete,
        canPause,
        canRequeue,
        canCancel,
        canTransfer,
        canMarkLeft,
        canAssign,
      },
      stitch: {
        called: STITCH.calledDesktop,
        didNotRespond: STITCH.didNotRespondDesktop,
        transfer: STITCH.transferDesktop,
        assignment: STITCH.assignmentDesktop,
      },
    },
  };
}

async function loadActiveClinicReceptionCallBoardScreen(db, input) {
  const { auth } = input;
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", callBoard: null };
  }

  const listed = await listFacilityQueue(db, {
    organizationId: auth.organization.id,
    healthcareOrganizationId: auth.healthcareOrganization.id,
    facilityId: selectedFacility.id,
    statuses: ["called", "serving"],
    limit: 50,
    offset: 0,
    actor: actorFromAuth(auth),
  });
  if (!listed.ok) {
    return { ok: false, code: listed.code, callBoard: null };
  }

  const enriched = await enrichQueueEntries(db, auth, listed.queueEntries);

  const callBoardEntries = enriched.map((e) => ({
    queueNumber: e.queueNumber,
    patientInitials: e.patient ? e.patient.initials : "—",
    status: e.status,
    statusLabel: e.statusLabel,
    servicePointName: e.servicePoint ? e.servicePoint.displayName : "—",
    assignedRoom: e.assignedRoom || null,
  }));

  return {
    ok: true,
    code: QUEUE_RESULT.OK,
    callBoard: {
      entries: callBoardEntries,
      facility: selectedFacility,
      stitch: {
        desktop: STITCH.calledDesktop,
      },
    },
  };
}

async function listServicePointsForFacility(db, input) {
  const points = await receptionRepo.listServicePointsByFacility(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: input.healthcareOrganizationId,
    facilityId: input.facilityId,
    includeInactive: input.includeInactive || false,
  });
  return points.map(mapServicePoint);
}

module.exports = {
  STITCH,
  QUEUE_STATUS_LABELS,
  actorFromAuth,
  loadActiveClinicReceptionQueueScreen,
  loadActiveClinicReceptionCheckInScreen,
  loadActiveClinicReceptionWalkInScreen,
  loadActiveClinicReceptionQueueDetailScreen,
  loadActiveClinicReceptionCallBoardScreen,
  listServicePointsForFacility,
};
