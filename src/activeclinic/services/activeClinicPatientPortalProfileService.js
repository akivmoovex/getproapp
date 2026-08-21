"use strict";

/**
 * ActiveClinic patient portal profile service (AC-V6-P27).
 * Update patient profile (safe fields only). No clinical fields.
 */

const {
  normalizeEmail,
} = require("../../platform/services/platformIdentityService");
const {
  normalizeRegistrationPhone,
} = require("../../blessboard/services/normalizeRegistrationPhone");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  PATIENT_NOT_FOUND: "patient_not_found",
  ACCESS_DENIED: "access_denied",
  TRANSACTION_ERROR: "transaction_error",
});

const ALLOWED_CONTACT_METHODS = ["phone", "email", "sms", "none"];

/**
 * Get patient profile.
 */
async function getPatientProfile(db, input) {
  const patientId = String((input && input.patientId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();

  if (!UUID_RE.test(patientId) || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, profile: null };
  }

  const row = await db.query(
    `SELECT id, patient_number, first_name, last_name, preferred_name,
            phone_normalized, phone_display,
            email_normalized, email_display,
            address_line_1, address_line_2, city, province,
            postal_code, country_code,
            preferred_contact_method, status
     FROM activeclinic.patients
     WHERE id = $1 AND organization_id = $2 AND status = 'active'
     LIMIT 1`,
    [patientId, organizationId]
  );

  if (!row.rows[0]) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND, profile: null };
  }

  const p = row.rows[0];
  return {
    ok: true,
    code: RESULT.OK,
    profile: {
      id: p.id,
      patientNumber: p.patient_number,
      firstName: p.first_name,
      lastName: p.last_name,
      preferredName: p.preferred_name,
      phoneNormalized: p.phone_normalized,
      phoneDisplay: p.phone_display,
      emailNormalized: p.email_normalized,
      emailDisplay: p.email_display,
      addressLine1: p.address_line_1,
      addressLine2: p.address_line_2,
      addressCity: p.city,
      addressProvince: p.province,
      addressPostalCode: p.postal_code,
      addressCountryCode: p.country_code,
      preferredContactMethod: p.preferred_contact_method,
      status: p.status,
    },
  };
}

/**
 * Update patient profile (safe fields only).
 * Allowed: preferred_name, phone, email, address, preferred_contact_method.
 * NOT allowed: first_name, last_name, date_of_birth, sex_at_registration, patient_number, clinical fields.
 * Address columns are the existing 008_patients names (address_line_1, city, province).
 */
async function updatePatientProfile(db, input) {
  const patientId = String((input && input.patientId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();

  if (!UUID_RE.test(patientId) || !UUID_RE.test(organizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const existing = await db.query(
    `SELECT id, status FROM activeclinic.patients WHERE id = $1 AND organization_id = $2`,
    [patientId, organizationId]
  );

  if (!existing.rows[0]) {
    return { ok: false, code: RESULT.PATIENT_NOT_FOUND };
  }

  if (existing.rows[0].status !== "active") {
    return { ok: false, code: RESULT.ACCESS_DENIED };
  }

  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (input.preferredName !== undefined) {
    const preferredName =
      input.preferredName != null ? String(input.preferredName).trim().slice(0, 80) : null;
    updates.push(`preferred_name = $${paramIndex++}`);
    values.push(preferredName);
  }

  if (input.phone !== undefined && (input.phone || input.phoneNational)) {
    const phoneNorm = normalizeRegistrationPhone(
      input.phoneNational || input.phone,
      input.phoneCountry || input.country || "ZM"
    );
    if (!phoneNorm.ok) {
      return { ok: false, code: RESULT.INVALID_INPUT, message: "invalid_phone" };
    }
    updates.push(`phone_normalized = $${paramIndex++}`);
    values.push(phoneNorm.normalized);
    updates.push(`phone_display = $${paramIndex++}`);
    values.push(phoneNorm.display);
  }

  if (input.email !== undefined) {
    const emailNorm = input.email ? normalizeEmail(input.email) : null;
    const emailDisplay = input.email ? String(input.email).trim() : null;
    updates.push(`email_normalized = $${paramIndex++}`);
    values.push(emailNorm);
    updates.push(`email_display = $${paramIndex++}`);
    values.push(emailDisplay);
  }

  if (input.addressLine1 !== undefined) {
    const val = input.addressLine1 ? String(input.addressLine1).trim().slice(0, 200) : null;
    updates.push(`address_line_1 = $${paramIndex++}`);
    values.push(val);
  }

  if (input.addressLine2 !== undefined) {
    const val = input.addressLine2 ? String(input.addressLine2).trim().slice(0, 200) : null;
    updates.push(`address_line_2 = $${paramIndex++}`);
    values.push(val);
  }

  if (input.addressCity !== undefined) {
    const val = input.addressCity ? String(input.addressCity).trim().slice(0, 100) : null;
    updates.push(`city = $${paramIndex++}`);
    values.push(val);
  }

  if (input.addressProvince !== undefined) {
    const val = input.addressProvince ? String(input.addressProvince).trim().slice(0, 100) : null;
    updates.push(`province = $${paramIndex++}`);
    values.push(val);
  }

  if (input.addressPostalCode !== undefined) {
    const val = input.addressPostalCode ? String(input.addressPostalCode).trim().slice(0, 20) : null;
    updates.push(`postal_code = $${paramIndex++}`);
    values.push(val);
  }

  if (input.addressCountryCode !== undefined) {
    const val = input.addressCountryCode ? String(input.addressCountryCode).trim().slice(0, 2).toUpperCase() : null;
    updates.push(`country_code = $${paramIndex++}`);
    values.push(val);
  }

  if (input.preferredContactMethod !== undefined) {
    const method = String(input.preferredContactMethod || "phone").trim().toLowerCase();
    if (!ALLOWED_CONTACT_METHODS.includes(method)) {
      return { ok: false, code: RESULT.INVALID_INPUT, message: "invalid_contact_method" };
    }
    updates.push(`preferred_contact_method = $${paramIndex++}`);
    values.push(method);
  }

  if (updates.length === 0) {
    return { ok: true, code: RESULT.OK };
  }

  updates.push(`updated_at = now()`);
  values.push(patientId, organizationId);

  await db.query(
    `UPDATE activeclinic.patients
     SET ${updates.join(", ")}
     WHERE id = $${paramIndex++} AND organization_id = $${paramIndex++}`,
    values
  );

  await db.query(
    `INSERT INTO activeclinic.patient_portal_link_events
      (organization_id, healthcare_organization_id, patient_id, platform_identity_id, event_type, metadata_json)
     SELECT organization_id, healthcare_organization_id, id, platform_identity_id, 'profile_updated', '{}'::jsonb
     FROM activeclinic.patients WHERE id = $1`,
    [patientId]
  );

  return { ok: true, code: RESULT.OK };
}

module.exports = {
  RESULT,
  getPatientProfile,
  updatePatientProfile,
};
