"use strict";

/**
 * ActiveClinic public clinic onboarding applications (P21).
 * Creates pending applications; never auto-publishes a clinic.
 */

const { normalizeActiveClinicPhone, normalizeActiveClinicEmail } = require("./normalizeActiveClinicContact");
const crypto = require("crypto");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  DUPLICATE: "duplicate_application",
});

function trimName(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) return null;
  return text.slice(0, max);
}

function generateApplicationNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `AC-${timestamp}-${random}`;
}

/**
 * Normalize Zambia phone to E.164 (+260...).
 * Accepts national or international formats.
 */
function normalizeZambiaPhone(raw) {
  const display = String(raw == null ? "" : raw).trim();
  if (!display) return { ok: false, code: "phone_required" };
  
  let digits = display.replace(/[^\d+]/g, "");
  
  if (digits.startsWith("+260")) {
    // Already E.164
  } else if (digits.startsWith("260")) {
    digits = "+" + digits;
  } else if (digits.startsWith("0")) {
    // National format: 0977... -> +260977...
    digits = "+260" + digits.slice(1);
  } else if (digits.length >= 9 && !digits.startsWith("+")) {
    // Assume national without leading 0
    digits = "+260" + digits;
  } else {
    // Try to parse as international
    if (!digits.startsWith("+")) {
      return { ok: false, code: "phone_invalid" };
    }
  }
  
  const phone = normalizeActiveClinicPhone(digits);
  if (!phone.ok) return phone;
  
  return { ok: true, normalized: phone.normalized, display: display.slice(0, 40) };
}

/**
 * Validate clinic registration input without persisting.
 * @returns {{ ok: boolean, code?: string, errors: Record<string, string>, normalized: object|null }}
 */
function validateClinicRegistrationInput(input) {
  const errors = {};
  const clinicName = trimName(input.clinicName, 200);
  const contactName = trimName(input.contactName, 120);
  const province = input.province ? trimName(input.province, 100) : null;
  const city = input.city ? trimName(input.city, 100) : null;
  const notes = input.notes ? String(input.notes).trim().slice(0, 2000) : null;

  if (!clinicName) errors.clinicName = "Enter your clinic name (up to 200 characters).";
  if (!contactName) errors.contactName = "Enter a contact name (up to 120 characters).";

  const email = normalizeActiveClinicEmail(input.contactEmail);
  if (!email.ok || !email.normalized) {
    errors.contactEmail = email.code === "email_required"
      ? "Enter a contact email address."
      : "Enter a valid email address.";
  }

  const phone = normalizeZambiaPhone(input.contactPhone);
  if (!phone.ok) {
    errors.contactPhone = phone.code === "phone_required"
      ? "Enter a Zambia mobile number."
      : "Enter a valid Zambia phone number (e.g. +260… or 09…).";
  }

  if (Object.keys(errors).length) {
    return { ok: false, code: RESULT.INVALID_INPUT, errors, normalized: null };
  }

  const countryCode = input.countryCode && /^[A-Z]{2}$/.test(String(input.countryCode).toUpperCase())
    ? String(input.countryCode).toUpperCase()
    : "ZM";

  return {
    ok: true,
    code: RESULT.OK,
    errors: {},
    normalized: {
      clinicName,
      contactName,
      contactEmail: email.normalized,
      contactEmailDisplay: email.display,
      contactPhone: phone.normalized,
      contactPhoneDisplay: phone.display,
      province,
      city,
      countryCode,
      notes,
    },
  };
}

/**
 * Create a clinic registration application.
 * Detects duplicate by email within 30 days.
 */
async function createClinicRegistrationApplication(db, input) {
  const validated = validateClinicRegistrationInput(input);
  if (!validated.ok) {
    return { ok: false, code: validated.code, errors: validated.errors, application: null };
  }

  const {
    clinicName,
    contactName,
    contactEmail,
    contactEmailDisplay,
    contactPhone,
    contactPhoneDisplay,
    province,
    city,
    countryCode,
    notes,
  } = validated.normalized;

  const email = { ok: true, normalized: contactEmail, display: contactEmailDisplay };
  const phone = { ok: true, normalized: contactPhone, display: contactPhoneDisplay };

  // Check for duplicate application by email in last 30 days
  const dupCheck = await db.query(
    `SELECT id, application_number, status
     FROM activeclinic.clinic_registration_applications
     WHERE contact_email_normalized = $1
       AND created_at > now() - interval '30 days'
       AND status NOT IN ('rejected', 'withdrawn')
     ORDER BY created_at DESC
     LIMIT 1`,
    [email.normalized]
  );

  if (dupCheck.rows.length) {
    const existing = dupCheck.rows[0];
    return {
      ok: false,
      code: RESULT.DUPLICATE,
      application: {
        applicationNumber: existing.application_number,
        status: existing.status,
      },
    };
  }

  const applicationNumber = generateApplicationNumber();

  const row = await db.query(
    `INSERT INTO activeclinic.clinic_registration_applications (
      application_number, clinic_name, contact_name,
      contact_email_normalized, contact_email_display,
      contact_phone_normalized, contact_phone_display,
      province, city, country_code, notes, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending_review')
    RETURNING id, application_number, status, created_at`,
    [
      applicationNumber,
      clinicName,
      contactName,
      email.normalized,
      email.display,
      phone.normalized,
      phone.display,
      province,
      city,
      countryCode,
      notes,
    ]
  );

  return {
    ok: true,
    code: RESULT.OK,
    application: {
      id: row.rows[0].id,
      applicationNumber: row.rows[0].application_number,
      status: row.rows[0].status,
      createdAt: row.rows[0].created_at,
    },
  };
}

module.exports = {
  RESULT,
  normalizeZambiaPhone,
  validateClinicRegistrationInput,
  createClinicRegistrationApplication,
};
