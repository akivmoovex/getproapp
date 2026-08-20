"use strict";

/**
 * ActiveClinic public clinic registration.
 * Public confirm creates the application then auto-provisions unless exceptional
 * review is required. Never auto-publishes the clinic website.
 * Terms acceptance is required before persist/provision.
 */

const bcrypt = require("bcryptjs");
const { normalizeActiveClinicPhone, normalizeActiveClinicEmail } = require("./normalizeActiveClinicContact");
const {
  validatePasswordPolicy,
} = require("../../platform/services/platformIdentityCredentialService");
const crypto = require("crypto");
const { appendReviewEvent } = require("./clinicRegistrationReviewService");
const { validateTermsAcceptance } = require("../legal/termsAcceptance");
const { FACILITY_TYPES } = require("./facilityService");

const BCRYPT_ROUNDS = 12;

const CLINIC_TYPE_LABELS = Object.freeze({
  hospital: "Hospital",
  health_centre: "Health centre",
  clinic: "Clinic",
  diagnostic_centre: "Diagnostic centre",
  pharmacy: "Pharmacy",
  mobile_clinic: "Mobile clinic",
  administrative_office: "Administrative office",
  other: "Other",
});

function clinicTypeLabel(type) {
  const key = String(type || "").trim();
  return CLINIC_TYPE_LABELS[key] || key || "Clinic";
}

function listClinicTypeOptions() {
  return FACILITY_TYPES.map((value) => ({ value, label: clinicTypeLabel(value) }));
}

function normalizeClinicType(raw, options) {
  const required = Boolean(options && options.required);
  const value = String(raw == null ? "" : raw).trim();
  if (!value) {
    return required
      ? { ok: false, error: "Select a clinic type." }
      : { ok: true, value: "clinic" };
  }
  if (!FACILITY_TYPES.includes(value)) {
    return { ok: false, error: "Select a valid clinic type." };
  }
  return { ok: true, value };
}

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
 * Terms acceptance is required only when requireTermsAcceptance is true
 * (confirm / create clinic), not on the details → review step.
 * @returns {{ ok: boolean, code?: string, errors: Record<string, string>, normalized: object|null }}
 */
function validateClinicRegistrationInput(input, options) {
  const errors = {};
  const requireTerms = Boolean(options && options.requireTermsAcceptance);
  const clinicOnly = options && options.step === "clinic";
  // Match SQL CHECKs: clinic_name 2–200, contact_name 2–120, notes null or 1–2000.
  const clinicName = trimName(input.clinicName, 200, 2);
  const contactName = clinicOnly ? null : trimName(input.contactName, 120, 2);
  const province = input.province ? trimName(input.province, 100, 1) : null;
  const city = input.city ? trimName(input.city, 100, 1) : null;
  const addressRaw = input.address != null ? String(input.address).trim() : "";
  const address = addressRaw ? trimName(addressRaw, 300, 1) : null;
  const notes = normalizeOptionalNotes(input.notes);
  const clinicTypeResult = normalizeClinicType(input.clinicType || input.facilityType, {
    required: clinicOnly || Boolean(String(input.clinicType || input.facilityType || "").trim()),
  });

  if (!clinicName) {
    errors.clinicName = "Enter your clinic name (2–200 characters).";
  }
  if (!clinicTypeResult.ok) {
    errors.clinicType = clinicTypeResult.error;
  }

  const countryRaw = String(input.countryCode || "").trim().toUpperCase();
  const countryCode = /^[A-Z]{2}$/.test(countryRaw) ? countryRaw : (clinicOnly ? "" : "ZM");
  if (clinicOnly && !countryCode) {
    errors.countryCode = "Select a country.";
  }

  if (addressRaw && !address) {
    errors.address = "Enter a street address of 1–300 characters, or leave it blank.";
  }

  let email = { ok: true, normalized: null, display: null };
  let phone = { ok: true, normalized: null, display: null };
  let passwordPolicy = { ok: true, value: null };
  if (!clinicOnly) {
    if (!contactName) {
      errors.contactName = "Enter an administrator name (2–120 characters).";
    }

    email = normalizeActiveClinicEmail(input.contactEmail);
    if (!email.ok || !email.normalized) {
      errors.contactEmail = !String(input.contactEmail || "").trim()
        ? "Enter an administrator email address."
        : "Enter a valid email address.";
    }

    phone = normalizeZambiaPhone(input.contactPhone, {
      phoneCountry: input.phoneCountry || input.contactPhoneCountry || null,
      phoneNational: input.phoneNational || input.contactPhoneNational || null,
      defaultCountry: countryCode || "ZM",
    });
    if (!phone.ok) {
      errors.contactPhone = phone.code === "phone_required"
        ? "Enter an administrator phone number."
        : (phone.error || "Enter a valid phone number for the selected country.");
    }

    passwordPolicy = validatePasswordPolicy(input.password);
    if (!passwordPolicy.ok) {
      errors.password = "Password must be at least 10 characters.";
    }
    if (String(input.password || "") !== String(input.passwordConfirm || "")) {
      errors.passwordConfirm = "Password and confirmation do not match.";
    }
  }

  let terms = { ok: true, errors: {}, termsVersion: null, privacyVersion: null };
  if (requireTerms) {
    terms = validateTermsAcceptance(input);
    if (!terms.ok) {
      Object.assign(errors, terms.errors);
    }
  }

  if (Object.keys(errors).length) {
    return { ok: false, code: RESULT.INVALID_INPUT, errors, normalized: null };
  }

  return {
    ok: true,
    code: RESULT.OK,
    errors: {},
    normalized: {
      clinicName,
      clinicType: clinicTypeResult.value || "clinic",
      contactName: contactName || "",
      contactEmail: email.normalized || null,
      contactEmailDisplay: email.display || "",
      contactPhone: phone.normalized || null,
      contactPhoneDisplay: phone.display || "",
      province,
      city,
      address,
      countryCode: countryCode || "ZM",
      notes,
      termsVersion: requireTerms ? terms.termsVersion : null,
      privacyVersion: requireTerms ? terms.privacyVersion : null,
    },
    password: passwordPolicy.ok ? passwordPolicy.value : null,
  };
}

/**
 * Create a clinic registration application.
 * Detects duplicate by email or phone within 30 days.
 */
async function createClinicRegistrationApplication(db, input) {
  const validated = validateClinicRegistrationInput(input, { requireTermsAcceptance: true });
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
    address,
    countryCode,
    notes,
    termsVersion,
    privacyVersion,
  } = validated.normalized;
  const administratorPassword = validated.password;
  if (!administratorPassword) {
    return { ok: false, code: RESULT.INVALID_INPUT, errors: { password: "Password must be at least 10 characters." }, application: null };
  }

  const email = { ok: true, normalized: contactEmail, display: contactEmailDisplay };
  const phone = { ok: true, normalized: contactPhone, display: contactPhoneDisplay };

  // Duplicate by email or phone in last 30 days (open applications only).
  const dupCheck = await db.query(
    `SELECT id, application_number, status
     FROM activeclinic.clinic_registration_applications
     WHERE created_at > now() - interval '30 days'
       AND status NOT IN ('rejected', 'withdrawn')
       AND (
         contact_email_normalized = $1
         OR contact_phone_normalized = $2
       )
     ORDER BY created_at DESC
     LIMIT 1`,
    [email.normalized, phone.normalized]
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
  const administratorPasswordHash = await bcrypt.hash(administratorPassword, BCRYPT_ROUNDS);

  const row = await db.query(
    `INSERT INTO activeclinic.clinic_registration_applications (
      application_number, clinic_name, contact_name,
      contact_email_normalized, contact_email_display,
      contact_phone_normalized, contact_phone_display,
      province, city, address, country_code, notes, status,
      administrator_password_hash,
      terms_version, terms_accepted_at, privacy_version, privacy_acknowledged_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'submitted', $13,
              $14, now(), $15, now())
    RETURNING id, application_number, status, created_at, terms_version, terms_accepted_at,
              privacy_version, privacy_acknowledged_at`,
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
      address,
      countryCode,
      notes,
      administratorPasswordHash,
      termsVersion,
      privacyVersion,
    ]
  );

  await appendReviewEvent(db, {
    applicationId: row.rows[0].id,
    eventType: "submitted",
    actorId: null,
    visibility: "history",
    deliveryStatus: "not_applicable",
  });

  return {
    ok: true,
    code: RESULT.OK,
    application: {
      id: row.rows[0].id,
      applicationNumber: row.rows[0].application_number,
      status: row.rows[0].status,
      createdAt: row.rows[0].created_at,
      termsVersion: row.rows[0].terms_version,
      termsAcceptedAt: row.rows[0].terms_accepted_at,
      privacyVersion: row.rows[0].privacy_version,
      privacyAcknowledgedAt: row.rows[0].privacy_acknowledged_at,
    },
  };
}

module.exports = {
  RESULT,
  FACILITY_TYPES,
  normalizeZambiaPhone,
  validateClinicRegistrationInput,
  createClinicRegistrationApplication,
  clinicTypeLabel,
  listClinicTypeOptions,
};
