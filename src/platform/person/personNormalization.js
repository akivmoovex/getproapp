"use strict";

/**
 * Shared person field normalization (V2.04).
 * Reuses platform phoneNumberService — does not invent a second phone system.
 */

const {
  normalizePhoneNumber,
  PHONE_E164_RE,
} = require("../services/phoneNumberService");
const { PERSON_FORBIDDEN_FIELDS } = require("./personConstants");

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

/**
 * Collapse whitespace + lowercase for search/dedupe — not a legal name transform.
 * @param {string|null|undefined} firstName
 * @param {string|null|undefined} middleName
 * @param {string|null|undefined} lastName
 */
function normalizePersonName(firstName, middleName, lastName) {
  const parts = [firstName, middleName, lastName]
    .map((p) =>
      String(p || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase()
    )
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, display: string|null, normalized: string|null } | { ok: false, code: string }}
 */
function normalizePersonEmail(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, display: null, normalized: null };
  }
  const display = String(raw).trim();
  const normalized = display.toLowerCase();
  if (normalized.length < 3 || normalized.length > 254 || !EMAIL_RE.test(normalized)) {
    return { ok: false, code: "invalid_email" };
  }
  return { ok: true, display, normalized };
}

/**
 * @param {{
 *   phone?: string|null,
 *   phoneDisplay?: string|null,
 *   phoneNormalized?: string|null,
 *   country?: string|null,
 *   defaultCountry?: string|null,
 *   required?: boolean,
 * }} input
 */
function normalizePersonPhone(input) {
  const src = input && typeof input === "object" ? input : {};
  if (src.phoneNormalized) {
    const e164 = String(src.phoneNormalized).trim();
    if (!PHONE_E164_RE.test(e164)) {
      return { ok: false, code: "invalid_phone" };
    }
    return {
      ok: true,
      display: src.phoneDisplay ? String(src.phoneDisplay).trim() : e164,
      normalized: e164,
    };
  }
  const raw = src.phone != null ? src.phone : src.phoneDisplay;
  const result = normalizePhoneNumber({
    raw,
    selectedCountry: src.country || null,
    clinicDefaultCountry: src.defaultCountry || null,
    required: src.required === true,
  });
  if (!result.ok) {
    return { ok: false, code: result.code || "invalid_phone" };
  }
  return {
    ok: true,
    display: result.display || result.e164 || null,
    normalized: result.e164 || null,
  };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, dateOfBirth: string|null } | { ok: false, code: string }}
 */
function normalizePersonDateOfBirth(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, dateOfBirth: null };
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = String(raw.getMonth() + 1).padStart(2, "0");
    const d = String(raw.getDate()).padStart(2, "0");
    return { ok: true, dateOfBirth: `${y}-${m}-${d}` };
  }
  const text = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return { ok: false, code: "invalid_date_of_birth" };
  }
  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, code: "invalid_date_of_birth" };
  }
  const today = new Date();
  if (parsed.getTime() > today.getTime()) {
    return { ok: false, code: "date_of_birth_in_future" };
  }
  return { ok: true, dateOfBirth: text };
}

/**
 * Reject product-domain fields that must stay off platform.persons.
 * @param {object|null|undefined} body
 */
function rejectForbiddenPersonFields(body) {
  if (!body || typeof body !== "object") {
    return { ok: true };
  }
  const found = [];
  for (const key of PERSON_FORBIDDEN_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, key) && body[key] != null) {
      found.push(key);
    }
  }
  if (found.length) {
    return { ok: false, code: "forbidden_person_field", fields: found };
  }
  return { ok: true };
}

/**
 * Normalize a person create/update payload (demographics only).
 * @param {object} input
 */
function normalizePersonDemographics(input) {
  const src = input && typeof input === "object" ? input : {};
  const forbidden = rejectForbiddenPersonFields(src);
  if (!forbidden.ok) return forbidden;

  const firstName = String(src.firstName || src.first_name || "")
    .trim()
    .replace(/\s+/g, " ");
  const lastName = String(src.lastName || src.last_name || "")
    .trim()
    .replace(/\s+/g, " ");
  const middleRaw = src.middleName != null ? src.middleName : src.middle_name;
  const middleName =
    middleRaw == null || String(middleRaw).trim() === ""
      ? null
      : String(middleRaw).trim().replace(/\s+/g, " ");
  const preferredRaw =
    src.preferredName != null ? src.preferredName : src.preferred_name;
  const preferredName =
    preferredRaw == null || String(preferredRaw).trim() === ""
      ? null
      : String(preferredRaw).trim().replace(/\s+/g, " ");

  if (!firstName || firstName.length > 100) {
    return { ok: false, code: "invalid_first_name" };
  }
  if (!lastName || lastName.length > 100) {
    return { ok: false, code: "invalid_last_name" };
  }
  if (middleName && middleName.length > 100) {
    return { ok: false, code: "invalid_middle_name" };
  }
  if (preferredName && preferredName.length > 100) {
    return { ok: false, code: "invalid_preferred_name" };
  }

  const nameNormalized = normalizePersonName(firstName, middleName, lastName);
  if (!nameNormalized) {
    return { ok: false, code: "invalid_name" };
  }

  const dob = normalizePersonDateOfBirth(
    src.dateOfBirth != null ? src.dateOfBirth : src.date_of_birth
  );
  if (!dob.ok) return dob;

  const email = normalizePersonEmail(
    src.email != null
      ? src.email
      : src.emailDisplay != null
        ? src.emailDisplay
        : src.email_display
  );
  if (!email.ok) return email;

  const phone = normalizePersonPhone({
    phone: src.phone,
    phoneDisplay: src.phoneDisplay != null ? src.phoneDisplay : src.phone_display,
    phoneNormalized:
      src.phoneNormalized != null ? src.phoneNormalized : src.phone_normalized,
    country: src.phoneCountry || src.country || null,
    defaultCountry: src.defaultCountry || null,
    required: false,
  });
  if (!phone.ok) return phone;

  return {
    ok: true,
    firstName,
    middleName,
    lastName,
    preferredName,
    nameNormalized,
    dateOfBirth: dob.dateOfBirth,
    emailDisplay: email.display,
    emailNormalized: email.normalized,
    phoneDisplay: phone.display,
    phoneNormalized: phone.normalized,
  };
}

/**
 * Normalize address value object (no person write).
 * @param {object} input
 */
function normalizePersonAddress(input) {
  const src = input && typeof input === "object" ? input : {};
  const kind = String(src.addressKind || src.address_kind || "home")
    .trim()
    .toLowerCase();
  const allowed = new Set(["home", "work", "postal", "billing", "other"]);
  if (!allowed.has(kind)) {
    return { ok: false, code: "invalid_address_kind" };
  }
  const trimOrNull = (v, max) => {
    if (v == null || String(v).trim() === "") return null;
    const s = String(v).trim();
    if (s.length > max) return { error: true };
    return s;
  };
  const line1 = trimOrNull(src.line1 != null ? src.line1 : src.line_1, 200);
  const line2 = trimOrNull(src.line2 != null ? src.line2 : src.line_2, 200);
  const city = trimOrNull(src.city, 120);
  const district = trimOrNull(src.district, 120);
  const province = trimOrNull(src.province, 120);
  const postal = trimOrNull(
    src.postalCode != null ? src.postalCode : src.postal_code,
    32
  );
  if (
    [line1, line2, city, district, province, postal].some(
      (v) => v && v.error
    )
  ) {
    return { ok: false, code: "invalid_address_field" };
  }
  let countryCode = src.countryCode != null ? src.countryCode : src.country_code;
  if (countryCode == null || String(countryCode).trim() === "") {
    countryCode = null;
  } else {
    countryCode = String(countryCode).trim().toUpperCase();
    if (countryCode.length < 2 || countryCode.length > 3) {
      return { ok: false, code: "invalid_country_code" };
    }
  }
  const locationId =
    src.locationId != null
      ? String(src.locationId).trim() || null
      : src.location_id != null
        ? String(src.location_id).trim() || null
        : null;

  return {
    ok: true,
    addressKind: kind,
    isPrimary: src.isPrimary === true || src.is_primary === true,
    line1: line1 || null,
    line2: line2 || null,
    city: city || null,
    district: district || null,
    province: province || null,
    postalCode: postal || null,
    countryCode,
    locationId,
  };
}

/**
 * Normalize related-contact draft.
 * @param {object} input
 */
function normalizeRelatedContact(input) {
  const src = input && typeof input === "object" ? input : {};
  const role = String(src.contactRole || src.contact_role || "")
    .trim()
    .toLowerCase();
  if (!["related", "next_of_kin", "emergency"].includes(role)) {
    return { ok: false, code: "invalid_contact_role" };
  }
  const fullName = String(src.fullName || src.full_name || "")
    .trim()
    .replace(/\s+/g, " ");
  if (!fullName || fullName.length > 200) {
    return { ok: false, code: "invalid_full_name" };
  }
  const relationshipLabelRaw =
    src.relationshipLabel != null
      ? src.relationshipLabel
      : src.relationship_label != null
        ? src.relationship_label
        : src.relationship;
  const relationshipLabel =
    relationshipLabelRaw == null || String(relationshipLabelRaw).trim() === ""
      ? null
      : String(relationshipLabelRaw).trim();
  if (relationshipLabel && relationshipLabel.length > 80) {
    return { ok: false, code: "invalid_relationship_label" };
  }

  const email = normalizePersonEmail(
    src.email != null
      ? src.email
      : src.emailDisplay != null
        ? src.emailDisplay
        : src.email_display
  );
  if (!email.ok) return email;

  const phone = normalizePersonPhone({
    phone: src.phone,
    phoneDisplay: src.phoneDisplay != null ? src.phoneDisplay : src.phone_display,
    phoneNormalized:
      src.phoneNormalized != null ? src.phoneNormalized : src.phone_normalized,
    country: src.phoneCountry || src.country || null,
    defaultCountry: src.defaultCountry || null,
    required: false,
  });
  if (!phone.ok) return phone;

  let notes = src.notes;
  if (notes == null || String(notes).trim() === "") {
    notes = null;
  } else {
    notes = String(notes).trim();
    if (notes.length > 500) return { ok: false, code: "invalid_notes" };
  }

  return {
    ok: true,
    contactRole: role,
    fullName,
    relationshipLabel,
    phoneDisplay: phone.display,
    phoneNormalized: phone.normalized,
    emailDisplay: email.display,
    emailNormalized: email.normalized,
    isPrimary: src.isPrimary === true || src.is_primary === true,
    consentToContact:
      src.consentToContact == null && src.consent_to_contact == null
        ? null
        : Boolean(src.consentToContact ?? src.consent_to_contact),
    notes,
  };
}

module.exports = {
  normalizePersonName,
  normalizePersonEmail,
  normalizePersonPhone,
  normalizePersonDateOfBirth,
  rejectForbiddenPersonFields,
  normalizePersonDemographics,
  normalizePersonAddress,
  normalizeRelatedContact,
};
