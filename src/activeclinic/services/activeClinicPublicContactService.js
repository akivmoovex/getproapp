"use strict";

/**
 * ActiveClinic public contact inquiries (P22).
 * Stores received inquiries; never claims delivery.
 */

const { normalizeActiveClinicPhone, normalizeActiveClinicEmail } = require("./normalizeActiveClinicContact");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function trimName(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) return null;
  return text.slice(0, max);
}

/**
 * Store a public contact inquiry.
 */
async function createPublicContactInquiry(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const healthcareOrganizationId = String((input && input.healthcareOrganizationId) || "").trim();
  const facilityId = input && input.facilityId ? String(input.facilityId).trim() : null;

  if (!UUID_RE.test(organizationId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, inquiry: null };
  }

  if (facilityId && !UUID_RE.test(facilityId)) {
    return { ok: false, code: RESULT.INVALID_INPUT, inquiry: null };
  }

  const senderName = trimName(input.senderName, 120);
  const message = String(input.message || "").trim();

  if (!senderName || message.length < 1 || message.length > 4000) {
    return { ok: false, code: RESULT.INVALID_INPUT, inquiry: null };
  }

  const email = normalizeActiveClinicEmail(input.senderEmail);
  if (!email.ok) {
    return { ok: false, code: email.code, inquiry: null };
  }
  if (!email.normalized) {
    return { ok: false, code: "email_required", inquiry: null };
  }

  let phoneNormalized = null;
  let phoneDisplay = null;
  if (input.senderPhone || input.phoneNational) {
    const phone = normalizeActiveClinicPhone({
      phone: input.senderPhone,
      phoneCountry: input.phoneCountry || null,
      phoneNational: input.phoneNational || null,
      clinicDefaultCountry: input.clinicDefaultCountry || null,
      required: true,
    });
    if (!phone.ok) {
      return { ok: false, code: phone.code, inquiry: null };
    }
    phoneNormalized = phone.normalized;
    phoneDisplay = phone.display;
  }

  const row = await db.query(
    `INSERT INTO activeclinic.public_contact_inquiries (
      organization_id, healthcare_organization_id, facility_id,
      sender_name, sender_email_normalized, sender_email_display,
      sender_phone_normalized, sender_phone_display,
      message, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'received')
    RETURNING id, created_at`,
    [
      organizationId,
      healthcareOrganizationId,
      facilityId,
      senderName,
      email.normalized,
      email.display,
      phoneNormalized,
      phoneDisplay,
      message,
    ]
  );

  return {
    ok: true,
    code: RESULT.OK,
    inquiry: {
      id: row.rows[0].id,
      createdAt: row.rows[0].created_at,
    },
  };
}

module.exports = {
  RESULT,
  createPublicContactInquiry,
};
