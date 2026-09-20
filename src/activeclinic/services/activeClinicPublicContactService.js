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

  // Retry / double-submit protection without schema changes: same clinic + email +
  // message within a short window reuses the existing receipt (not an appointment).
  const recent = await db.query(
    `SELECT id, created_at
       FROM activeclinic.public_contact_inquiries
      WHERE organization_id = $1
        AND sender_email_normalized = $2
        AND message = $3
        AND created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC
      LIMIT 1`,
    [organizationId, email.normalized, message]
  );
  if (recent.rows[0]) {
    return {
      ok: true,
      code: RESULT.OK,
      duplicate: true,
      inquiry: {
        id: recent.rows[0].id,
        createdAt: recent.rows[0].created_at,
      },
    };
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

const PLATFORM_CONTACT_SUBJECTS = Object.freeze({
  joining: "Joining ActiveClinic",
  directory: "Clinic directory listing",
  account: "Existing clinic account",
  platform: "Website or platform question",
  partnership: "Partnership or business enquiry",
  other: "Other",
});

function normalizePlatformContactSubject(value) {
  const key = String(value == null ? "" : value).trim().toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(PLATFORM_CONTACT_SUBJECTS, key)) {
    return null;
  }
  return { key, label: PLATFORM_CONTACT_SUBJECTS[key] };
}

/**
 * Store a platform (ActiveClinic.org) contact inquiry.
 */
async function createPlatformContactInquiry(db, input) {
  const senderName = trimName(input && input.senderName, 120);
  const messageBody = String((input && input.message) || "").trim();
  const subject = normalizePlatformContactSubject(input && input.subject);

  if (!senderName || senderName.length < 2 || messageBody.length < 1) {
    return { ok: false, code: RESULT.INVALID_INPUT, inquiry: null };
  }
  if (!subject) {
    return { ok: false, code: "subject_required", inquiry: null };
  }

  const message = `[Subject: ${subject.label}]\n\n${messageBody}`.slice(0, 4000);
  if (message.length < 1 || message.length > 4000) {
    return { ok: false, code: RESULT.INVALID_INPUT, inquiry: null };
  }

  const email = normalizeActiveClinicEmail(input && input.senderEmail);
  if (!email.ok) {
    return { ok: false, code: email.code, inquiry: null };
  }
  if (!email.normalized) {
    return { ok: false, code: "email_required", inquiry: null };
  }

  let phoneNormalized = null;
  let phoneDisplay = null;
  if ((input && input.senderPhone) || (input && input.phoneNational)) {
    const phone = normalizeActiveClinicPhone({
      phone: input.senderPhone,
      phoneCountry: input.phoneCountry || "ZM",
      phoneNational: input.phoneNational || null,
      clinicDefaultCountry: "ZM",
      required: false,
    });
    if (!phone.ok) {
      return { ok: false, code: phone.code, inquiry: null };
    }
    phoneNormalized = phone.normalized;
    phoneDisplay = phone.display;
  }

  const recent = await db.query(
    `SELECT id, created_at
       FROM activeclinic.platform_contact_inquiries
      WHERE sender_email_normalized = $1
        AND message = $2
        AND created_at > NOW() - INTERVAL '30 minutes'
      ORDER BY created_at DESC
      LIMIT 1`,
    [email.normalized, message]
  );
  if (recent.rows[0]) {
    return {
      ok: true,
      code: RESULT.OK,
      duplicate: true,
      inquiry: {
        id: recent.rows[0].id,
        createdAt: recent.rows[0].created_at,
        subject: subject.key,
      },
    };
  }

  const row = await db.query(
    `INSERT INTO activeclinic.platform_contact_inquiries (
      sender_name, sender_email_normalized, sender_email_display,
      sender_phone_normalized, sender_phone_display,
      message, status
    ) VALUES ($1, $2, $3, $4, $5, $6, 'received')
    RETURNING id, created_at`,
    [senderName, email.normalized, email.display, phoneNormalized, phoneDisplay, message]
  );

  return {
    ok: true,
    code: RESULT.OK,
    inquiry: {
      id: row.rows[0].id,
      createdAt: row.rows[0].created_at,
      subject: subject.key,
    },
  };
}

function describePlatformContactErrors(code) {
  const errors = {};
  if (code === "email_required" || code === "invalid_email" || code === "email_invalid") {
    errors.senderEmail = "Enter a valid email address.";
  }
  if (code === "subject_required") {
    errors.subject = "Select a subject for your enquiry.";
  }
  if (code === "invalid_phone" || code === "phone_required" || code === "phone_invalid") {
    errors.phone_national = "Enter a valid phone number.";
  }
  if (code === RESULT.INVALID_INPUT) {
    errors.senderName = "Enter your name (2–120 characters).";
    errors.message = "Enter a message (1–4000 characters).";
  }
  return errors;
}

/** Field-safe messages for clinic (tenant) contact inquiries — never expose codes/stack. */
function describeClinicContactErrors(code) {
  const errors = {};
  if (code === "email_required" || code === "invalid_email" || code === "email_invalid") {
    errors.senderEmail = "Enter a valid email address.";
  }
  if (code === "invalid_phone" || code === "phone_required" || code === "phone_invalid") {
    errors.phone_national = "Enter a valid phone number.";
  }
  if (code === RESULT.INVALID_INPUT) {
    errors.senderName = "Enter your name.";
    errors.message = "Enter a message.";
  }
  return errors;
}

module.exports = {
  RESULT,
  PLATFORM_CONTACT_SUBJECTS,
  normalizePlatformContactSubject,
  createPublicContactInquiry,
  createPlatformContactInquiry,
  describePlatformContactErrors,
  describeClinicContactErrors,
};
