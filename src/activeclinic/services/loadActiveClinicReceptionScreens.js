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
  PERM: PATIENT_PERM,
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
  queueDesktop: "4bdf5a39d81043e1bd9488caa0833048",
  queueMobile: "a21f9b37a2ca4939948bf39a86a5df90",
  checkInDesktop: "ed27c2dfb6474a139b126c5bd57e0869",
  checkInMobile: "a2900a9ef33247d8817fe801f4a06fd5",
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
  const appointmentIds = [
    ...new Set(entries.map((e) => e.appointmentId).filter(Boolean)),
  ];
  const arrivalIds = [...new Set(entries.map((e) => e.arrivalId).filter(Boolean))];
  const staffIds = [
    ...new Set(entries.map((e) => e.servingStaffId).filter(Boolean)),
  ];

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

  const arrivals = {};
  for (const arrivalId of arrivalIds) {
    const row = await receptionRepo.findReceptionArrivalById(db, {
      id: arrivalId,
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
    });
    if (row) {
      arrivals[arrivalId] = {
        id: row.id,
        arrivedAt: row.arrived_at,
        arrivalSource: row.arrival_source,
        // Administrative check-in note only — never clinical encounter notes.
        checkInNote: row.check_in_note || null,
      };
    }
  }

  const appointments = {};
  for (const appointmentId of appointmentIds) {
    const detail = await getAppointmentDetail(db, {
      organizationId: orgId,
      healthcareOrganizationId: hcoId,
      appointmentId,
      actor: actorFromAuth(auth),
    });
    if (detail.ok) {
      appointments[appointmentId] = {
        id: detail.appointment.id,
        status: detail.appointment.status,
        serviceTypeId: detail.appointment.serviceTypeId,
        assignedStaffId: detail.appointment.assignedStaffId,
      };
    }
  }

  const serviceNames = {};
  const staffNames = {};
  for (const appt of Object.values(appointments)) {
    if (appt.serviceTypeId && !serviceNames[appt.serviceTypeId]) {
      const svc = await db.query(
        `SELECT display_name FROM activeclinic.appointment_service_types
          WHERE id = $1 AND organization_id = $2 AND healthcare_organization_id = $3
          LIMIT 1`,
        [appt.serviceTypeId, orgId, hcoId]
      );
      serviceNames[appt.serviceTypeId] = svc.rows[0]
        ? svc.rows[0].display_name
        : null;
    }
    if (appt.assignedStaffId) staffIds.push(appt.assignedStaffId);
  }
  for (const staffId of [...new Set(staffIds)]) {
    const staff = await db.query(
      `SELECT first_name, last_name, display_name FROM activeclinic.staff_members
        WHERE id = $1 AND organization_id = $2 LIMIT 1`,
      [staffId, orgId]
    );
    if (staff.rows[0]) {
      const s = staff.rows[0];
      staffNames[staffId] =
        s.display_name ||
        [s.first_name, s.last_name].filter(Boolean).join(" ") ||
        "Practitioner";
    }
  }

  const now = Date.now();
  return entries.map((e) => {
    const arrival = arrivals[e.arrivalId] || null;
    const appointment = e.appointmentId ? appointments[e.appointmentId] || null : null;
    const arrivedAt = arrival && arrival.arrivedAt ? new Date(arrival.arrivedAt) : null;
    const waitingMinutes =
      arrivedAt && !Number.isNaN(arrivedAt.getTime())
        ? Math.max(0, Math.floor((now - arrivedAt.getTime()) / 60000))
        : null;
    const practitionerId =
      e.servingStaffId || (appointment && appointment.assignedStaffId) || null;
    // Explicitly omit clinical notes / encounter content from reception payloads.
    const { patientNote: _omitClinicalNote, ...safeEntry } = e;
    return {
      ...safeEntry,
      statusLabel: QUEUE_STATUS_LABELS[e.status] || e.status,
      patient: patients[e.patientId] || null,
      servicePoint: servicePoints[e.servicePointId] || null,
      destination: servicePoints[e.servicePointId]
        ? servicePoints[e.servicePointId].displayName
        : null,
      arrival,
      arrivedAtLabel: arrivedAt
        ? arrivedAt.toISOString().replace("T", " ").slice(0, 16)
        : "—",
      waitingMinutes,
      waitingDurationLabel:
        waitingMinutes == null ? "—" : `${waitingMinutes} min`,
      serviceName:
        appointment && appointment.serviceTypeId
          ? serviceNames[appointment.serviceTypeId] || "—"
          : "—",
      practitionerName: practitionerId ? staffNames[practitionerId] || "—" : "—",
      patientNote: null,
    };
  });
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
  const { auth, appointmentId, error, query } = input;
  const perms = auth.permissions || [];
  const selectedFacility = auth.selectedFacility;
  if (!selectedFacility || !selectedFacility.id) {
    return { ok: false, code: "facility_required", checkIn: null };
  }

  let appointment = null;
  let lookupCandidates = [];
  const lookupQ = String((query && (query.q || query.patient_number || query.appointment_id)) || "").trim();

  if (appointmentId || (query && query.appointment_id)) {
    const id = appointmentId || String(query.appointment_id).trim();
    const detail = await getAppointmentDetail(db, {
      organizationId: auth.organization.id,
      healthcareOrganizationId: auth.healthcareOrganization.id,
      appointmentId: id,
      actor: actorFromAuth(auth),
    });
    if (detail.ok && detail.appointment.facilityId === selectedFacility.id) {
      const patient = await getPatientByOrgAndId(db, {
        organizationId: auth.organization.id,
        healthcareOrganizationId: auth.healthcareOrganization.id,
        patientId: detail.appointment.patientId,
      });
      let practitionerName = null;
      if (detail.appointment.assignedStaffId) {
        const staff = await db.query(
          `SELECT first_name, last_name, display_name FROM activeclinic.staff_members
            WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [detail.appointment.assignedStaffId, auth.organization.id]
        );
        if (staff.rows[0]) {
          practitionerName =
            staff.rows[0].display_name ||
            [staff.rows[0].first_name, staff.rows[0].last_name]
              .filter(Boolean)
              .join(" ");
        }
      }
      let serviceName = null;
      if (detail.appointment.serviceTypeId) {
        const svc = await db.query(
          `SELECT display_name FROM activeclinic.appointment_service_types
            WHERE id = $1 AND organization_id = $2 LIMIT 1`,
          [detail.appointment.serviceTypeId, auth.organization.id]
        );
        serviceName = svc.rows[0] ? svc.rows[0].display_name : null;
      }
      appointment = {
        ...detail.appointment,
        patient: patient.ok && patient.patient
          ? {
              id: patient.patient.id,
              patientNumber: patient.patient.patientNumber,
              displayName: formatPatientDisplayName(patient.patient),
            }
          : null,
        statusLabel: detail.appointment.status,
        practitionerName,
        serviceName,
      };
    }
  } else if (lookupQ) {
    const listed = await db.query(
      `SELECT a.id, a.status, a.starts_at, a.assigned_staff_id, a.service_type_id,
              p.patient_number, p.first_name, p.last_name, p.preferred_name,
              st.display_name AS service_name
         FROM activeclinic.appointments a
         INNER JOIN activeclinic.patients p
           ON p.id = a.patient_id
          AND p.organization_id = a.organization_id
         LEFT JOIN activeclinic.appointment_service_types st
           ON st.id = a.service_type_id
        WHERE a.organization_id = $1
          AND a.healthcare_organization_id = $2
          AND a.facility_id = $3
          AND a.status IN ('requested', 'confirmed')
          AND (
            a.id::text = $4
            OR p.patient_number ILIKE $5
            OR p.phone_normalized ILIKE $5
            OR (p.first_name || ' ' || p.last_name) ILIKE $5
          )
        ORDER BY a.starts_at ASC
        LIMIT 15`,
      [
        auth.organization.id,
        auth.healthcareOrganization.id,
        selectedFacility.id,
        lookupQ,
        `%${lookupQ.replace(/%/g, "")}%`,
      ]
    );
    lookupCandidates = listed.rows.map((row) => ({
      id: row.id,
      status: row.status,
      startsAt: row.starts_at,
      serviceName: row.service_name || "—",
      patient: {
        patientNumber: row.patient_number,
        displayName: formatPatientDisplayName({
          firstName: row.first_name,
          lastName: row.last_name,
          preferredName: row.preferred_name,
        }),
      },
      selectHref: `/app/reception/check-in?appointment_id=${encodeURIComponent(row.id)}`,
    }));
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
      lookupQ,
      lookupCandidates,
      facility: selectedFacility,
      servicePoints: servicePoints.map(mapServicePoint),
      error: error || null,
      actions: {
        canCheckIn: hasPerm(perms, PERM.CHECK_IN),
      },
      stitch: {
        desktop: STITCH.checkInDesktop,
        mobile: STITCH.checkInMobile,
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

  let bookingLinkage = null;
  const bookingRequestId = input.bookingRequestId
    ? String(input.bookingRequestId).trim()
    : null;
  const formValues = {
    patientNumber: "",
    servicePointId: "",
    checkInNote: "",
    ...(values || {}),
  };
  if (bookingRequestId) {
    const {
      getBookingRequestById,
      LINK_STATUS,
    } = require("./activeClinicBookingPatientLinkageService");
    const {
      LINK_STATUS_LABELS,
    } = require("./loadActiveClinicBookingLinkageScreens");
    const loaded = await getBookingRequestById(db, {
      organizationId: auth.organization.id,
      bookingId: bookingRequestId,
    });
    if (loaded.ok) {
      const b = loaded.booking;
      bookingLinkage = {
        bookingId: b.id,
        requestNumber: b.requestNumber,
        patientLinkStatus: b.patientLinkStatus,
        linkStatusLabel: LINK_STATUS_LABELS[b.patientLinkStatus] || b.patientLinkStatus,
        linked: b.patientLinkStatus === LINK_STATUS.LINKED && Boolean(b.patientId),
        reviewHref: `/app/booking-requests/${encodeURIComponent(b.id)}`,
      };
      if (bookingLinkage.linked && b.patientId) {
        const patient = await getPatientByOrgAndId(db, {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientId: b.patientId,
        });
        if (patient.ok && patient.patient) {
          formValues.patientNumber =
            formValues.patientNumber || patient.patient.patientNumber;
        }
      }
    }
  }

  return {
    ok: true,
    walkIn: {
      values: formValues,
      facility: selectedFacility,
      servicePoints: servicePoints.map(mapServicePoint),
      error: error || null,
      bookingLinkage,
      actions: {
        canCheckIn: hasPerm(perms, PERM.CHECK_IN),
        canManageQueue: hasPerm(perms, PERM.MANAGE_QUEUE),
        canRegisterPatient: hasPerm(perms, PATIENT_PERM.CREATE),
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

async function loadReceptionActionScreen(db, input, mode) {
  const loaded = await loadActiveClinicReceptionQueueDetailScreen(db, input);
  if (!loaded.ok) return loaded;
  let servicePoints = [];
  if (mode === "transfer") {
    servicePoints = await listServicePointsForFacility(db, {
      organizationId: input.auth.organization.id,
      healthcareOrganizationId: input.auth.healthcareOrganization.id,
      facilityId: loaded.detail.queueEntry.facilityId,
    });
    servicePoints = servicePoints.filter(
      (point) => point.id !== loaded.detail.queueEntry.servicePointId
    );
  }
  return {
    ok: true,
    action: {
      mode,
      detail: loaded.detail,
      queueEntry: loaded.detail.queueEntry,
      servicePoints,
      error: input.error || null,
      stitch:
        mode === "called"
          ? STITCH.calledDesktop
          : mode === "did-not-respond"
            ? STITCH.didNotRespondDesktop
            : mode === "assign"
              ? STITCH.assignmentDesktop
              : STITCH.transferDesktop,
    },
  };
}

async function loadActiveClinicReceptionCalledScreen(db, input) {
  return loadReceptionActionScreen(db, input, "called");
}

async function loadActiveClinicReceptionDidNotRespondScreen(db, input) {
  return loadReceptionActionScreen(db, input, "did-not-respond");
}

async function loadActiveClinicReceptionAssignScreen(db, input) {
  return loadReceptionActionScreen(db, input, "assign");
}

async function loadActiveClinicReceptionTransferScreen(db, input) {
  return loadReceptionActionScreen(db, input, "transfer");
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
  loadActiveClinicReceptionCalledScreen,
  loadActiveClinicReceptionDidNotRespondScreen,
  loadActiveClinicReceptionAssignScreen,
  loadActiveClinicReceptionTransferScreen,
  listServicePointsForFacility,
};
