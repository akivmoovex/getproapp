"use strict";

/**
 * ActiveClinic public booking lookup service (P26).
 * Privacy-safe token-based lookup; cancel/reschedule REQUEST only.
 */

const { hashToken } = require("./activeClinicPublicBookingService");
const {
  canModifyBookingStatus,
} = require("./activeClinicPublicBookingDraft");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  TOKEN_INVALID: "token_invalid",
  TOKEN_EXPIRED: "token_expired",
  TOKEN_REVOKED: "token_revoked",
  BOOKING_NOT_FOUND: "booking_not_found",
  ALREADY_REQUESTED: "change_already_requested",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Verify token and retrieve booking request.
 */
async function verifyBookingAccessToken(db, input) {
  const token = String((input && input.token) || "").trim();
  if (!token) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  const tokenHash = hashToken(token);

  const tokenRow = await db.query(
    `SELECT t.id, t.booking_request_id, t.organization_id, t.healthcare_organization_id,
            t.expires_at, t.revoked_at, t.created_at
     FROM activeclinic.public_booking_access_tokens t
     WHERE t.token_hash = $1`,
    [tokenHash]
  );

  if (!tokenRow.rows.length) {
    return { ok: false, code: RESULT.TOKEN_INVALID, booking: null };
  }

  const tokenRecord = tokenRow.rows[0];

  if (tokenRecord.revoked_at) {
    return { ok: false, code: RESULT.TOKEN_REVOKED, booking: null };
  }

  if (new Date(tokenRecord.expires_at) < new Date()) {
    return { ok: false, code: RESULT.TOKEN_EXPIRED, booking: null };
  }

  // Update last_used_at
  await db.query(
    `UPDATE activeclinic.public_booking_access_tokens
     SET last_used_at = now()
     WHERE id = $1`,
    [tokenRecord.id]
  );

  const bookingRow = await db.query(
    `SELECT b.id, b.request_number, b.booking_kind, b.status,
            b.service_type_id, b.procedure_id, b.preferred_staff_id,
            b.patient_first_name, b.patient_last_name,
            b.patient_phone_display, b.patient_email_display,
            b.visit_reason, b.preferred_starts_at, b.preferred_ends_at,
            b.timezone, b.referral_status, b.referral_notes,
            b.preparation_acknowledged, b.appointment_id,
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
     WHERE b.id = $1
       AND b.organization_id = $2
       AND b.healthcare_organization_id = $3`,
    [tokenRecord.booking_request_id, tokenRecord.organization_id, tokenRecord.healthcare_organization_id]
  );

  if (!bookingRow.rows.length) {
    return { ok: false, code: RESULT.BOOKING_NOT_FOUND, booking: null };
  }

  const booking = bookingRow.rows[0];

  return {
    ok: true,
    code: RESULT.OK,
    booking: {
      id: booking.id,
      requestNumber: booking.request_number,
      bookingKind: booking.booking_kind,
      status: booking.status,
      serviceDisplayName: booking.service_display_name || null,
      procedureDisplayName: booking.procedure_display_name || null,
      staffDisplayName: booking.staff_display_name || null,
      facilityDisplayName: booking.facility_display_name,
      patientFirstName: booking.patient_first_name,
      patientLastName: booking.patient_last_name,
      patientPhoneDisplay: booking.patient_phone_display,
      patientEmailDisplay: booking.patient_email_display,
      visitReason: booking.visit_reason,
      preferredStartsAt: booking.preferred_starts_at,
      preferredEndsAt: booking.preferred_ends_at,
      timezone: booking.timezone,
      referralStatus: booking.referral_status,
      referralNotes: booking.referral_notes,
      preparationAcknowledged: booking.preparation_acknowledged === true,
      appointmentId: booking.appointment_id,
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    },
  };
}

/**
 * Request cancellation (not immediate cancel).
 */
async function requestBookingCancellation(db, input) {
  const token = String((input && input.token) || "").trim();
  const reason = input && input.reason ? String(input.reason).trim().slice(0, 500) : null;

  if (!token) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const verified = await verifyBookingAccessToken(db, { token });
  if (!verified.ok) {
    return { ok: false, code: verified.code };
  }

  const booking = verified.booking;

  if (booking.status === "cancellation_requested") {
    return { ok: false, code: RESULT.ALREADY_REQUESTED };
  }

  if (!canModifyBookingStatus(booking.status)) {
    return { ok: false, code: "cancellation_not_allowed" };
  }

  const updated = await db.query(
    `UPDATE activeclinic.public_booking_requests
     SET status = 'cancellation_requested',
         updated_at = now()
     WHERE id = $1
       AND status IN ('submitted_pending_confirmation', 'confirmed')
     RETURNING id, status`,
    [booking.id]
  );
  if (!updated.rows.length) {
    return { ok: false, code: "cancellation_not_allowed" };
  }

  return { ok: true, code: RESULT.OK };
}

/**
 * Request reschedule (not immediate reschedule).
 */
async function requestBookingReschedule(db, input) {
  const token = String((input && input.token) || "").trim();
  const preferredStartsAt = input && input.preferredStartsAt ? new Date(input.preferredStartsAt) : null;
  const reason = input && input.reason ? String(input.reason).trim().slice(0, 500) : null;

  if (!token) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const verified = await verifyBookingAccessToken(db, { token });
  if (!verified.ok) {
    return { ok: false, code: verified.code };
  }

  const booking = verified.booking;

  if (booking.status === "reschedule_requested") {
    return { ok: false, code: RESULT.ALREADY_REQUESTED };
  }

  if (!canModifyBookingStatus(booking.status)) {
    return { ok: false, code: "reschedule_not_allowed" };
  }

  const updated = await db.query(
    `UPDATE activeclinic.public_booking_requests
     SET status = 'reschedule_requested',
         updated_at = now()
     WHERE id = $1
       AND status IN ('submitted_pending_confirmation', 'confirmed')
     RETURNING id, status`,
    [booking.id]
  );
  if (!updated.rows.length) {
    return { ok: false, code: "reschedule_not_allowed" };
  }

  return { ok: true, code: RESULT.OK };
}

module.exports = {
  RESULT,
  verifyBookingAccessToken,
  requestBookingCancellation,
  requestBookingReschedule,
};
