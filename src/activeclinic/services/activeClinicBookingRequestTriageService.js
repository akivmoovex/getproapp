"use strict";

/**
 * ACN09 booking request triage: confirm / decline / propose reschedule.
 * Extends public_booking_requests — does not create a second appointment engine.
 */

const {
  getBookingRequestById,
  LINK_STATUS,
  RESULT: LINK_RESULT,
} = require("./activeClinicBookingPatientLinkageService");
const {
  createAppointment,
  RESULT: APPT_RESULT,
  PERM: APPT_PERM,
} = require("./activeClinicAppointmentService");
const {
  authorizeStaffPermission,
  RESULT: AUTHZ_RESULT,
} = require("./activeClinicAuthorizationService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { rejectForgedTenantIdentifiers } = require("../../platform/rbac/sharedTenantScope");

const RESULT = Object.freeze({
  OK: "ok",
  ...LINK_RESULT,
  INVALID_STATUS: "invalid_booking_status",
  PATIENT_REQUIRED: "patient_link_required",
  COLLISION: APPT_RESULT.COLLISION,
  SERVICE_REQUIRED: "service_required",
  DECLINE_REASON_REQUIRED: "decline_reason_required",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorize(db, input, permissionKey) {
  const authz = await authorizeStaffPermission(db, {
    organizationId: input.organizationId,
    staffMemberId: input.actor.staffMemberId,
    platformIdentityId: input.actor.platformIdentityId,
    permissionKey,
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
  return { ok: true };
}

function assertTrusted(input) {
  const forged = rejectForgedTenantIdentifiers({
    body: input.body,
    query: input.query,
    trusted: {
      organizationId: input.organizationId,
      facilityId: input.facilityId || null,
    },
    allowMatchingTrusted: true,
  });
  if (!forged.ok) return { ok: false, code: "forged_tenant" };
  return { ok: true };
}

async function listBookingRequestQueue(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, APPT_PERM.VIEW);
  if (!authz.ok) {
    const fallback = await authorize(db, input, "activeclinic.reception.view");
    if (!fallback.ok) return authz;
  }

  const params = [input.organizationId];
  let facilitySql = "";
  if (input.facilityId && UUID_RE.test(input.facilityId)) {
    params.push(input.facilityId);
    facilitySql = ` AND facility_id = $${params.length}`;
  }
  let statusSql = ` AND status IN ('submitted_pending_confirmation', 'reschedule_requested')`;
  if (input.status) {
    params.push(String(input.status));
    statusSql = ` AND status = $${params.length}`;
  }
  if (input.staffId) {
    params.push(String(input.staffId));
    statusSql += ` AND preferred_staff_id = $${params.length}`;
  }

  const r = await db.query(
    `SELECT *
       FROM activeclinic.public_booking_requests
      WHERE organization_id = $1
        ${facilitySql}
        ${statusSql}
      ORDER BY created_at ASC
      LIMIT 100`,
    params
  );

  return {
    ok: true,
    code: RESULT.OK,
    bookings: r.rows.map((row) => ({
      id: row.id,
      requestNumber: row.request_number,
      bookingKind: row.booking_kind,
      status: row.status,
      statusLabel:
        row.status === "submitted_pending_confirmation"
          ? "Requested"
          : row.status === "reschedule_requested"
            ? "Reschedule requested"
            : row.status,
      patientFirstName: row.patient_first_name,
      patientLastName: row.patient_last_name,
      patientId: row.patient_id,
      patientLinkStatus: row.patient_link_status,
      preferredStartsAt: row.preferred_starts_at,
      preferredEndsAt: row.preferred_ends_at,
      preferredStaffId: row.preferred_staff_id,
      serviceTypeId: row.service_type_id,
      facilityId: row.facility_id,
      appointmentId: row.appointment_id,
      createdAt: row.created_at,
      ageHours: Math.max(
        0,
        Math.round((Date.now() - new Date(row.created_at).getTime()) / 3600000)
      ),
      reviewHref: `/app/booking-requests/${encodeURIComponent(row.id)}`,
    })),
  };
}

/**
 * Confirm a pending public booking into a real clinic appointment.
 */
async function confirmBookingRequest(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, APPT_PERM.CREATE);
  if (!authz.ok) return authz;

  const loaded = await getBookingRequestById(db, {
    organizationId: input.organizationId,
    bookingId: input.bookingId,
  });
  if (!loaded.ok) return loaded;
  const booking = loaded.booking;
  const row = loaded.row;

  if (
    !["submitted_pending_confirmation", "reschedule_requested"].includes(
      booking.status
    )
  ) {
    return { ok: false, code: RESULT.INVALID_STATUS };
  }
  if (!booking.patientId || booking.patientLinkStatus !== LINK_STATUS.LINKED) {
    return { ok: false, code: RESULT.PATIENT_REQUIRED };
  }
  if (!booking.serviceTypeId && !row.service_type_id) {
    return { ok: false, code: RESULT.SERVICE_REQUIRED };
  }

  const startsAt = input.startsAt
    ? new Date(input.startsAt)
    : booking.preferredStartsAt
      ? new Date(booking.preferredStartsAt)
      : null;
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const endsAt = input.endsAt
    ? new Date(input.endsAt)
    : booking.preferredEndsAt
      ? new Date(booking.preferredEndsAt)
      : new Date(startsAt.getTime() + 30 * 60000);

  const created = await createAppointment(db, {
    organizationId: input.organizationId,
    healthcareOrganizationId: booking.healthcareOrganizationId,
    facilityId: booking.facilityId,
    patientId: booking.patientId,
    serviceTypeId: booking.serviceTypeId || row.service_type_id,
    assignedStaffId: input.assignedStaffId || booking.preferredStaffId || null,
    startsAt,
    endsAt,
    timezone: row.timezone || "Africa/Lusaka",
    schedulingNote: input.schedulingNote || `Confirmed from ${booking.requestNumber}`,
    initialStatus: "confirmed",
    actor: input.actor,
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
  });
  if (!created.ok) {
    return {
      ok: false,
      code: created.code === APPT_RESULT.COLLISION ? RESULT.COLLISION : created.code,
    };
  }

  await db.query(
    `UPDATE activeclinic.public_booking_requests
        SET status = 'confirmed',
            appointment_id = $3,
            preferred_starts_at = COALESCE($4, preferred_starts_at),
            preferred_ends_at = COALESCE($5, preferred_ends_at),
            updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [
      booking.id,
      input.organizationId,
      created.appointment.id,
      startsAt.toISOString(),
      endsAt.toISOString(),
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.booking_request.confirm",
    entityType: "public_booking_request",
    entityId: booking.id,
    outcome: "success",
    metadata: { appointment_id: created.appointment.id },
  });

  return {
    ok: true,
    code: RESULT.OK,
    bookingId: booking.id,
    appointment: created.appointment,
  };
}

async function declineBookingRequest(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, APPT_PERM.UPDATE);
  if (!authz.ok) return authz;

  const reason = String(input.declineReason || input.reason || "").trim();
  if (reason.length < 3) {
    return { ok: false, code: RESULT.DECLINE_REASON_REQUIRED };
  }

  const loaded = await getBookingRequestById(db, {
    organizationId: input.organizationId,
    bookingId: input.bookingId,
  });
  if (!loaded.ok) return loaded;
  if (
    !["submitted_pending_confirmation", "reschedule_requested"].includes(
      loaded.booking.status
    )
  ) {
    return { ok: false, code: RESULT.INVALID_STATUS };
  }

  await db.query(
    `UPDATE activeclinic.public_booking_requests
        SET status = 'declined',
            decline_reason = $3,
            updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [loaded.booking.id, input.organizationId, reason.slice(0, 500)]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.booking_request.decline",
    entityType: "public_booking_request",
    entityId: loaded.booking.id,
    outcome: "success",
    metadata: { reason },
  });

  return { ok: true, code: RESULT.OK, bookingId: loaded.booking.id };
}

async function proposeBookingReschedule(db, input) {
  const scope = assertTrusted(input);
  if (!scope.ok) return scope;
  const authz = await authorize(db, input, APPT_PERM.UPDATE);
  if (!authz.ok) return authz;

  const startsAt = new Date(input.startsAt);
  const endsAt = input.endsAt
    ? new Date(input.endsAt)
    : new Date(startsAt.getTime() + 30 * 60000);
  if (Number.isNaN(startsAt.getTime()) || !(startsAt < endsAt)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const loaded = await getBookingRequestById(db, {
    organizationId: input.organizationId,
    bookingId: input.bookingId,
  });
  if (!loaded.ok) return loaded;
  if (
    !["submitted_pending_confirmation", "reschedule_requested"].includes(
      loaded.booking.status
    )
  ) {
    return { ok: false, code: RESULT.INVALID_STATUS };
  }

  await db.query(
    `UPDATE activeclinic.public_booking_requests
        SET status = 'reschedule_requested',
            preferred_starts_at = $3,
            preferred_ends_at = $4,
            decline_reason = COALESCE($5, decline_reason),
            updated_at = now()
      WHERE id = $1 AND organization_id = $2`,
    [
      loaded.booking.id,
      input.organizationId,
      startsAt.toISOString(),
      endsAt.toISOString(),
      input.note ? String(input.note).trim().slice(0, 500) : null,
    ]
  );

  await recordAuditEventSafe(db, {
    deploymentCode: input.deploymentCode || CODE_ACTIVECLINIC_ORG_V6,
    organizationId: input.organizationId,
    actorUserId: null,
    actionKey: "activeclinic.booking_request.reschedule_proposed",
    entityType: "public_booking_request",
    entityId: loaded.booking.id,
    outcome: "success",
    metadata: {
      preferred_starts_at: startsAt.toISOString(),
      preferred_ends_at: endsAt.toISOString(),
    },
  });

  return { ok: true, code: RESULT.OK, bookingId: loaded.booking.id };
}

module.exports = {
  RESULT,
  listBookingRequestQueue,
  confirmBookingRequest,
  declineBookingRequest,
  proposeBookingReschedule,
};
