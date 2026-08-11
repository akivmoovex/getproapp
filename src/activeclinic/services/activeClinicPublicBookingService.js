"use strict";

/**
 * ActiveClinic public booking requests (P24–P25).
 * Creates submitted_pending_confirmation requests; never confirms automatically.
 * Handles consultation and procedure bookings with proper patient matching.
 */

const crypto = require("crypto");
const { normalizeActiveClinicPhone, normalizeActiveClinicEmail } = require("./normalizeActiveClinicContact");
const { normalizeZambiaPhone } = require("./activeClinicPublicOnboardingService");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FACILITY_NOT_FOUND: "facility_not_found",
  SERVICE_NOT_FOUND: "service_not_found",
  PROCEDURE_NOT_FOUND: "procedure_not_found",
  BOOKING_NOT_ENABLED: "booking_not_enabled",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimName(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) return null;
  return text.slice(0, max);
}

function generateRequestNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `BK-${timestamp}-${random}`;
}

function generateIdempotencyKey() {
  return crypto.randomBytes(16).toString("hex");
}

function generateOpaqueToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Attempt to match guest patient by phone within org.
 * Returns existing patient if strong match found, null otherwise.
 * Never creates patient silently.
 */
async function matchGuestPatient(db, input) {
  const phoneRows = await db.query(
    `SELECT id, patient_number, first_name, last_name, phone_normalized, status
     FROM activeclinic.patients
     WHERE organization_id = $1
       AND healthcare_organization_id = $2
       AND phone_normalized = $3
       AND status IN ('active', 'inactive')
     ORDER BY created_at DESC
     LIMIT 1`,
    [input.organizationId, input.healthcareOrganizationId, input.phoneNormalized]
  );

  if (!phoneRows.rows.length) {
    return { matched: false, patientId: null };
  }

  const patient = phoneRows.rows[0];
  // Fuzzy name match optional — for now, trust phone match
  return { matched: true, patientId: patient.id, patientNumber: patient.patient_number };
}

/**
 * Create a consultation booking request (P24).
 */
async function createConsultationBookingRequest(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  const facilityId = String((input && input.facilityId) || "").trim();
  const serviceTypeId = input && input.serviceTypeId ? String(input.serviceTypeId).trim() : null;
  const preferredStaffId = input && input.preferredStaffId ? String(input.preferredStaffId).trim() : null;

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId) || !UUID_RE.test(facilityId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  // Verify facility active and booking enabled
  const facilityCheck = await db.query(
    `SELECT f.id, f.status, h.public_booking_enabled
     FROM activeclinic.facilities f
     INNER JOIN activeclinic.healthcare_organizations h
       ON h.id = f.healthcare_organization_id
     WHERE f.id = $1
       AND f.organization_id = $2
       AND f.healthcare_organization_id = $3`,
    [facilityId, organizationId, healthcareOrganizationId]
  );

  if (!facilityCheck.rows.length || facilityCheck.rows[0].status !== "active") {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, booking: null };
  }

  if (facilityCheck.rows[0].public_booking_enabled !== true) {
    return { ok: false, code: RESULT.BOOKING_NOT_ENABLED, booking: null };
  }

  if (serviceTypeId && !UUID_RE.test(serviceTypeId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  if (preferredStaffId && !UUID_RE.test(preferredStaffId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  const firstName = trimName(input.patientFirstName, 80);
  const lastName = trimName(input.patientLastName, 80);
  const visitReason = input.visitReason ? String(input.visitReason).trim().slice(0, 500) : null;

  if (!firstName || !lastName) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  const phone = normalizeZambiaPhone(input.patientPhone, {
    phoneCountry: input.phoneCountry || null,
    phoneNational: input.phoneNational || null,
    defaultCountry: input.defaultCountry || "ZM",
  });
  if (!phone.ok) {
    return { ok: false, code: phone.code, booking: null };
  }

  let emailNormalized = null;
  let emailDisplay = null;
  if (input.patientEmail) {
    const email = normalizeActiveClinicEmail(input.patientEmail);
    if (!email.ok) {
      return { ok: false, code: email.code, booking: null };
    }
    emailNormalized = email.normalized;
    emailDisplay = email.display;
  }

  // Attempt patient match
  const match = await matchGuestPatient(db, {
    organizationId,
    healthcareOrganizationId,
    phoneNormalized: phone.normalized,
  });

  const preferredStartsAt = input.preferredStartsAt ? new Date(input.preferredStartsAt) : null;
  const preferredEndsAt = input.preferredEndsAt ? new Date(input.preferredEndsAt) : null;
  const timezone = input.timezone || "Africa/Lusaka";

  const idempotencyKey = input.idempotencyKey || generateIdempotencyKey();

  const existingRow = await db.query(
    `SELECT b.id, b.request_number, b.status, b.created_at,
            (SELECT t.token_hash FROM activeclinic.public_booking_access_tokens t
             WHERE t.booking_request_id = b.id AND t.revoked_at IS NULL
             ORDER BY t.created_at DESC LIMIT 1) AS token_hash
     FROM activeclinic.public_booking_requests b
     WHERE b.organization_id = $1 AND b.idempotency_key = $2
     LIMIT 1`,
    [organizationId, idempotencyKey]
  );
  if (existingRow.rows.length) {
    const existing = existingRow.rows[0];
    return {
      ok: true,
      code: RESULT.OK,
      duplicate: true,
      booking: {
        id: existing.id,
        requestNumber: existing.request_number,
        status: existing.status,
        createdAt: existing.created_at,
        accessToken: null,
      },
    };
  }

  const requestNumber = generateRequestNumber();

  const bookingRow = await db.query(
    `INSERT INTO activeclinic.public_booking_requests (
      organization_id, healthcare_organization_id, facility_id,
      request_number, booking_kind, status,
      service_type_id, preferred_staff_id, patient_id,
      patient_first_name, patient_last_name,
      patient_phone_normalized, patient_phone_display,
      patient_email_normalized, patient_email_display,
      visit_reason, preferred_starts_at, preferred_ends_at, timezone,
      referral_status, idempotency_key
    ) VALUES ($1, $2, $3, $4, 'consultation', 'submitted_pending_confirmation',
              $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'not_required', $18)
    RETURNING id, request_number, status, created_at`,
    [
      organizationId,
      healthcareOrganizationId,
      facilityId,
      requestNumber,
      serviceTypeId,
      preferredStaffId,
      match.patientId,
      firstName,
      lastName,
      phone.normalized,
      phone.display,
      emailNormalized,
      emailDisplay,
      visitReason,
      preferredStartsAt,
      preferredEndsAt,
      timezone,
      idempotencyKey,
    ]
  );

  const booking = bookingRow.rows[0];
  
  // Issue opaque access token
  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

  await db.query(
    `INSERT INTO activeclinic.public_booking_access_tokens (
      organization_id, healthcare_organization_id, booking_request_id,
      token_hash, expires_at
    ) VALUES ($1, $2, $3, $4, $5)`,
    [organizationId, healthcareOrganizationId, booking.id, tokenHash, expiresAt]
  );

  return {
    ok: true,
    code: RESULT.OK,
    booking: {
      id: booking.id,
      requestNumber: booking.request_number,
      status: booking.status,
      createdAt: booking.created_at,
      accessToken: token,
    },
  };
}

/**
 * Create a procedure booking request (P25).
 */
async function createProcedureBookingRequest(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  const facilityId = String((input && input.facilityId) || "").trim();
  const procedureId = input && input.procedureId ? String(input.procedureId).trim() : null;

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId) || !UUID_RE.test(facilityId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  if (procedureId && !UUID_RE.test(procedureId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  const facilityCheck = await db.query(
    `SELECT f.id, f.status, h.public_booking_enabled
     FROM activeclinic.facilities f
     INNER JOIN activeclinic.healthcare_organizations h
       ON h.id = f.healthcare_organization_id
     WHERE f.id = $1
       AND f.organization_id = $2
       AND f.healthcare_organization_id = $3`,
    [facilityId, organizationId, healthcareOrganizationId]
  );

  if (!facilityCheck.rows.length || facilityCheck.rows[0].status !== "active") {
    return { ok: false, code: RESULT.FACILITY_NOT_FOUND, booking: null };
  }

  if (facilityCheck.rows[0].public_booking_enabled !== true) {
    return { ok: false, code: RESULT.BOOKING_NOT_ENABLED, booking: null };
  }

  const firstName = trimName(input.patientFirstName, 80);
  const lastName = trimName(input.patientLastName, 80);
  const visitReason = input.visitReason ? String(input.visitReason).trim().slice(0, 500) : null;

  if (!firstName || !lastName) {
    return { ok: false, code: RESULT.INVALID_INPUT, booking: null };
  }

  const phone = normalizeZambiaPhone(input.patientPhone, {
    phoneCountry: input.phoneCountry || null,
    phoneNational: input.phoneNational || null,
    defaultCountry: input.defaultCountry || "ZM",
  });
  if (!phone.ok) {
    return { ok: false, code: phone.code, booking: null };
  }

  let emailNormalized = null;
  let emailDisplay = null;
  if (input.patientEmail) {
    const email = normalizeActiveClinicEmail(input.patientEmail);
    if (!email.ok) {
      return { ok: false, code: email.code, booking: null };
    }
    emailNormalized = email.normalized;
    emailDisplay = email.display;
  }

  const match = await matchGuestPatient(db, {
    organizationId,
    healthcareOrganizationId,
    phoneNormalized: phone.normalized,
  });

  const referralStatus = input.referralRequired === true
    ? (input.referralNotes ? "submitted_pending_review" : "required_missing")
    : "not_required";

  const referralNotes = input.referralNotes ? String(input.referralNotes).trim().slice(0, 2000) : null;
  const preparationAcknowledged = input.preparationAcknowledged === true;
  const preferredStartsAt = input.preferredStartsAt ? new Date(input.preferredStartsAt) : null;
  const timezone = input.timezone || "Africa/Lusaka";
  const idempotencyKey = input.idempotencyKey || generateIdempotencyKey();

  const existingRow = await db.query(
    `SELECT b.id, b.request_number, b.status, b.created_at
     FROM activeclinic.public_booking_requests b
     WHERE b.organization_id = $1 AND b.idempotency_key = $2
     LIMIT 1`,
    [organizationId, idempotencyKey]
  );
  if (existingRow.rows.length) {
    const existing = existingRow.rows[0];
    return {
      ok: true,
      code: RESULT.OK,
      duplicate: true,
      booking: {
        id: existing.id,
        requestNumber: existing.request_number,
        status: existing.status,
        createdAt: existing.created_at,
        accessToken: null,
      },
    };
  }

  const requestNumber = generateRequestNumber();

  // If no upload infra, use clinic_follow_up for referral_required cases
  const finalReferralStatus = referralStatus === "required_missing" ? "clinic_follow_up" : referralStatus;

  const bookingRow = await db.query(
    `INSERT INTO activeclinic.public_booking_requests (
      organization_id, healthcare_organization_id, facility_id,
      request_number, booking_kind, status,
      procedure_id, patient_id,
      patient_first_name, patient_last_name,
      patient_phone_normalized, patient_phone_display,
      patient_email_normalized, patient_email_display,
      visit_reason, preferred_starts_at, timezone,
      referral_status, referral_notes, preparation_acknowledged,
      idempotency_key
    ) VALUES ($1, $2, $3, $4, 'procedure', 'submitted_pending_confirmation',
              $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
    RETURNING id, request_number, status, created_at`,
    [
      organizationId,
      healthcareOrganizationId,
      facilityId,
      requestNumber,
      procedureId,
      match.patientId,
      firstName,
      lastName,
      phone.normalized,
      phone.display,
      emailNormalized,
      emailDisplay,
      visitReason,
      preferredStartsAt,
      timezone,
      finalReferralStatus,
      referralNotes,
      preparationAcknowledged,
      idempotencyKey,
    ]
  );

  const booking = bookingRow.rows[0];

  const token = generateOpaqueToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  await db.query(
    `INSERT INTO activeclinic.public_booking_access_tokens (
      organization_id, healthcare_organization_id, booking_request_id,
      token_hash, expires_at
    ) VALUES ($1, $2, $3, $4, $5)`,
    [organizationId, healthcareOrganizationId, booking.id, tokenHash, expiresAt]
  );

  return {
    ok: true,
    code: RESULT.OK,
    booking: {
      id: booking.id,
      requestNumber: booking.request_number,
      status: booking.status,
      createdAt: booking.created_at,
      accessToken: token,
    },
  };
}

module.exports = {
  RESULT,
  generateIdempotencyKey,
  generateOpaqueToken,
  hashToken,
  matchGuestPatient,
  createConsultationBookingRequest,
  createProcedureBookingRequest,
};
