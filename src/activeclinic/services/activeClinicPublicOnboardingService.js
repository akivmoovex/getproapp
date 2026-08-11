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

function trimName(value, max, min) {
  const text = String(value == null ? "" : value).trim();
  const minLen = typeof min === "number" ? min : 1;
  if (!text || text.length < minLen || text.length > max) return null;
  return text.slice(0, max);
}

function normalizeOptionalNotes(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  return text.slice(0, 2000);
}

function generateApplicationNumber() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `AC-${timestamp}-${random}`;
}

/**
 * Normalize contact phone to E.164 (default country Zambia / clinic default).
 * Delegates to shared ActiveClinic phone normalization — do not invent a second pipeline.
 */
function normalizeZambiaPhone(raw, options) {
  const opts = options && typeof options === "object" ? options : {};
  const display = String(
    opts.phoneNational != null && String(opts.phoneNational).trim() !== ""
      ? opts.phoneNational
      : raw == null
        ? ""
        : raw
  ).trim();
  if (!display && !(opts.phoneNational && String(opts.phoneNational).trim())) {
    return { ok: false, code: "phone_required" };
  }
  const phone = normalizeActiveClinicPhone({
    phone: display,
    phoneCountry: opts.phoneCountry || opts.country || null,
    phoneNational: opts.phoneNational || null,
    clinicDefaultCountry: opts.clinicDefaultCountry || null,
    defaultCountry: opts.defaultCountry || "ZM",
  });
  if (!phone.ok) return phone;
  return {
    ok: true,
    normalized: phone.normalized,
    display: display.slice(0, 40),
    country: phone.country || null,
  };
}

/**
 * Validate clinic registration input without persisting.
 * @returns {{ ok: boolean, code?: string, errors: Record<string, string>, normalized: object|null }}
 */
function validateClinicRegistrationInput(input) {
  const errors = {};
  // Match SQL CHECKs: clinic_name 2–200, contact_name 2–120, notes null or 1–2000.
  const clinicName = trimName(input.clinicName, 200, 2);
  const contactName = trimName(input.contactName, 120, 2);
  const province = input.province ? trimName(input.province, 100, 1) : null;
  const city = input.city ? trimName(input.city, 100, 1) : null;
  const notes = normalizeOptionalNotes(input.notes);

  if (!clinicName) {
    errors.clinicName = "Enter your clinic name (2–200 characters).";
  }
  if (!contactName) {
    errors.contactName = "Enter a contact name (2–120 characters).";
  }

  const email = normalizeActiveClinicEmail(input.contactEmail);
  if (!email.ok || !email.normalized) {
    errors.contactEmail = email.code === "email_required"
      ? "Enter a contact email address."
      : "Enter a valid email address.";
  }

  const phone = normalizeZambiaPhone(input.contactPhone, {
    phoneCountry: input.phoneCountry || input.contactPhoneCountry || null,
    phoneNational: input.phoneNational || input.contactPhoneNational || null,
    defaultCountry: input.countryCode || "ZM",
  });
  if (!phone.ok) {
    errors.contactPhone = phone.code === "phone_required"
      ? "Enter a contact phone number."
      : (phone.error || "Enter a valid phone number for the selected country.");
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
