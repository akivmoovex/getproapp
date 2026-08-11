"use strict";

/**
 * ActiveClinic patient portal booking service (AC-V6-P27).
 * List/detail bookings for linked patient only. Cancel/reschedule requests.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  BOOKING_NOT_FOUND: "booking_not_found",
  ACCESS_DENIED: "access_denied",
  ALREADY_REQUESTED: "change_already_requested",
  NOT_ALLOWED: "operation_not_allowed",
});

/**
 * List bookings for portal identity and/or linked clinic patient.
 */
async function listPatientBookings(db, input) {
  const patientId = input && input.patientId ? String(input.patientId).trim() : null;
  const platformIdentityId =
    input && input.platformIdentityId ? String(input.platformIdentityId).trim() : null;
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();

  if (
    (!patientId || !UUID_RE.test(patientId)) &&
    (!platformIdentityId || !UUID_RE.test(platformIdentityId))
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, bookings: [] };
  }
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, bookings: [] };
  }

  const params = [organizationId, healthcareOrganizationId];
  const ownership = [];
  if (patientId && UUID_RE.test(patientId)) {
    params.push(patientId);
    ownership.push(`b.patient_id = $${params.length}`);
  }
  if (platformIdentityId && UUID_RE.test(platformIdentityId)) {
    params.push(platformIdentityId);
    ownership.push(`b.portal_platform_identity_id = $${params.length}`);
  }

  const rows = await db.query(
    `SELECT b.id, b.request_number, b.booking_kind, b.status,
            b.service_type_id, b.procedure_id, b.preferred_staff_id,
            b.patient_first_name, b.patient_last_name,
            b.patient_phone_display, b.patient_email_display,
            b.visit_reason, b.preferred_starts_at, b.preferred_ends_at,
            b.timezone, b.referral_status, b.referral_notes,
            b.preparation_acknowledged, b.appointment_id,
            b.patient_link_status, b.patient_id,
            b.created_at, b.updated_at,
            ast.display_name AS service_display_name,
            pp.display_name AS procedure_display_name,
            s.public_display_name AS staff_display_name,
            f.display_name AS facility_display_name
     FROM activeclinic.public_booking_requests b
     LEFT JOIN activeclinic.appointment_service_types ast
       ON ast.id = b.service_type_id
     LEFT JOIN activeclinic.public_procedures pp
       ON pp.id = b.procedure_id
     LEFT JOIN activeclinic.staff_members s
       ON s.id = b.preferred_staff_id
     INNER JOIN activeclinic.facilities f
       ON f.id = b.facility_id
     WHERE b.organization_id = $1
       AND b.healthcare_organization_id = $2
       AND (${ownership.join(" OR ")})
     ORDER BY b.created_at DESC`,
    params
  );

  const bookings = rows.rows.map((r) => ({
    id: r.id,
    requestNumber: r.request_number,
    bookingKind: r.booking_kind,
    status: r.status,
    serviceDisplayName: r.service_display_name || null,
    procedureDisplayName: r.procedure_display_name || null,
    staffDisplayName: r.staff_display_name || null,
    facilityDisplayName: r.facility_display_name,
    patientFirstName: r.patient_first_name,
    patientLastName: r.patient_last_name,
    patientPhoneDisplay: r.patient_phone_display,
    patientEmailDisplay: r.patient_email_display,
    visitReason: r.visit_reason,
    preferredStartsAt: r.preferred_starts_at,
    preferredEndsAt: r.preferred_ends_at,
    timezone: r.timezone,
    referralStatus: r.referral_status,
    referralNotes: r.referral_notes,
    preparationAcknowledged: r.preparation_acknowledged === true,
    appointmentId: r.appointment_id,
    patientLinkStatus: r.patient_link_status || null,
    patientId: r.patient_id || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return { ok: true, code: RESULT.OK, bookings };
}

/**
 * Get booking detail for portal owner (patient and/or portal identity).
 * Accepts booking UUID or public request_number as bookingId.
 */
async function getPatientBooking(db, input) {
  const bookingRef = String((input && input.bookingId) || "").trim();
  const patientId = input && input.patientId ? String(input.patientId).trim() : null;
  const platformIdentityId =
    input && input.platformIdentityId ? String(input.platformIdentityId).trim() : null;
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();

  if (
    !bookingRef ||
    ((!patientId || !UUID_RE.test(patientId)) &&
      (!platformIdentityId || !UUID_RE.test(platformIdentityId))) ||
    !UUID_RE.test(organizationId) ||
    !UUID_RE.test(healthcareOrganizationId)
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  const byId = UUID_RE.test(bookingRef);
  const params = [bookingRef, organizationId, healthcareOrganizationId];
  const ownership = [];
  if (patientId && UUID_RE.test(patientId)) {
    params.push(patientId);
    ownership.push(`b.patient_id = $${params.length}`);
  }
  if (platformIdentityId && UUID_RE.test(platformIdentityId)) {
    params.push(platformIdentityId);
    ownership.push(`b.portal_platform_identity_id = $${params.length}`);
  }

  const row = await db.query(
    `SELECT b.id, b.request_number, b.booking_kind, b.status,
            b.service_type_id, b.procedure_id, b.preferred_staff_id,
            b.patient_first_name, b.patient_last_name,
            b.patient_phone_display, b.patient_email_display,
            b.visit_reason, b.preferred_starts_at, b.preferred_ends_at,
            b.timezone, b.referral_status, b.referral_notes,
            b.preparation_acknowledged, b.appointment_id,
            b.patient_link_status, b.patient_id,
            b.created_at, b.updated_at,
            ast.display_name AS service_display_name,
            pp.display_name AS procedure_display_name,
            s.public_display_name AS staff_display_name,
            f.display_name AS facility_display_name
     FROM activeclinic.public_booking_requests b
     LEFT JOIN activeclinic.appointment_service_types ast
       ON ast.id = b.service_type_id
     LEFT JOIN activeclinic.public_procedures pp
       ON pp.id = b.procedure_id
     LEFT JOIN activeclinic.staff_members s
       ON s.id = b.preferred_staff_id
     INNER JOIN activeclinic.facilities f
       ON f.id = b.facility_id
     WHERE ${byId ? "b.id = $1" : "b.request_number = $1"}
       AND b.organization_id = $2
       AND b.healthcare_organization_id = $3
       AND (${ownership.join(" OR ")})
     LIMIT 1`,
    params
  );

  if (!row.rows[0]) {
    return { ok: false, code: RESULT.BOOKING_NOT_FOUND, booking: null };
  }

  const r = row.rows[0];
  const booking = {
    id: r.id,
    requestNumber: r.request_number,
    bookingKind: r.booking_kind,
    status: r.status,
    serviceDisplayName: r.service_display_name || null,
    procedureDisplayName: r.procedure_display_name || null,
    staffDisplayName: r.staff_display_name || null,
    facilityDisplayName: r.facility_display_name,
    patientFirstName: r.patient_first_name,
    patientLastName: r.patient_last_name,
    patientPhoneDisplay: r.patient_phone_display,
    patientEmailDisplay: r.patient_email_display,
    visitReason: r.visit_reason,
    preferredStartsAt: r.preferred_starts_at,
    preferredEndsAt: r.preferred_ends_at,
    timezone: r.timezone,
    referralStatus: r.referral_status,
    referralNotes: r.referral_notes,
    preparationAcknowledged: r.preparation_acknowledged === true,
    appointmentId: r.appointment_id,
    patientLinkStatus: r.patient_link_status || null,
    patientId: r.patient_id || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };

  return { ok: true, code: RESULT.OK, booking };
}

/**
 * Request cancellation (patient ownership check).
 * Accepts booking UUID or public request_number.
 */
async function requestPatientBookingCancellation(db, input) {
  const resolved = await getPatientBooking(db, input);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code };
  }

  const bookingId = resolved.booking.id;
  const reason = input && input.reason ? String(input.reason).trim().slice(0, 500) : null;

  if (resolved.booking.status === "cancellation_requested") {
    return { ok: false, code: RESULT.ALREADY_REQUESTED };
  }

  if (!["submitted_pending_confirmation", "confirmed"].includes(resolved.booking.status)) {
    return { ok: false, code: RESULT.NOT_ALLOWED };
  }

  await db.query(
    `UPDATE activeclinic.public_booking_requests
     SET status = 'cancellation_requested', updated_at = now()
     WHERE id = $1`,
    [bookingId]
  );

  void reason;
  return { ok: true, code: RESULT.OK, booking: resolved.booking };
}

/**
 * Request reschedule (patient ownership check).
 * Accepts booking UUID or public request_number.
 */
async function requestPatientBookingReschedule(db, input) {
  const resolved = await getPatientBooking(db, input);
  if (!resolved.ok) {
    return { ok: false, code: resolved.code };
  }

  const bookingId = resolved.booking.id;
  const preferredStartsAt = input && input.preferredStartsAt ? new Date(input.preferredStartsAt) : null;
  const reason = input && input.reason ? String(input.reason).trim().slice(0, 500) : null;

  if (resolved.booking.status === "reschedule_requested") {
    return { ok: false, code: RESULT.ALREADY_REQUESTED };
  }

  if (!["submitted_pending_confirmation", "confirmed"].includes(resolved.booking.status)) {
    return { ok: false, code: RESULT.NOT_ALLOWED };
  }

  const nextStart =
    preferredStartsAt && !Number.isNaN(preferredStartsAt.getTime())
      ? preferredStartsAt.toISOString()
      : null;

  await db.query(
    `UPDATE activeclinic.public_booking_requests
     SET status = 'reschedule_requested',
         preferred_starts_at = COALESCE($2, preferred_starts_at),
         updated_at = now()
     WHERE id = $1`,
    [bookingId, nextStart]
  );

  void reason;
  return { ok: true, code: RESULT.OK, booking: resolved.booking };
}

module.exports = {
  RESULT,
  listPatientBookings,
  getPatientBooking,
  requestPatientBookingCancellation,
  requestPatientBookingReschedule,
};
