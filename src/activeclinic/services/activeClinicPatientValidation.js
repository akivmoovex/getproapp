"use strict";

/**
 * Validation and normalization for ActiveClinic patient administrative fields.
 */

const {
  normalizeActiveClinicPhone,
  normalizeActiveClinicEmail,
  normalizeCountryCode,
} = require("./normalizeActiveClinicContact");

const SEX_VALUES = Object.freeze([
  "male",
  "female",
  "intersex",
  "unknown",
  "not_recorded",
]);

const STATUSES = Object.freeze(["active", "inactive", "deceased", "archived"]);

const IDENTIFIER_TYPES = Object.freeze([
  "national_id",
  "passport",
  "birth_certificate",
  "insurance_member_number",
  "facility_legacy_number",
  "other",
]);

const REGISTRATION_METHODS = Object.freeze([
  "walk_in",
  "referral",
  "transfer_in",
  "outreach",
  "imported",
  "other",
]);

const CONTACT_METHODS = Object.freeze(["phone", "email", "none", "unspecified"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function trimRequired(value, max) {
  const text = String(value == null ? "" : value).trim();
  if (!text || text.length > max) return null;
  return text;
}

function trimOptional(value, max) {
  if (value == null || String(value).trim() === "") return null;
  const text = String(value).trim();
  if (text.length > max) return { ok: false, code: "field_too_long" };
  return { ok: true, value: text };
}

function normalizeDateOfBirth(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, value: null };
  }
  const text = String(raw).trim();
  if (!DATE_RE.test(text)) return { ok: false, code: "date_of_birth_invalid" };
  const d = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, code: "date_of_birth_invalid" };
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  if (d.getTime() > todayUtc) return { ok: false, code: "date_of_birth_future" };
  return { ok: true, value: text };
}

function normalizeSexAtRegistration(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, value: null };
  }
  const value = String(raw).trim().toLowerCase();
  if (!SEX_VALUES.includes(value)) return { ok: false, code: "sex_at_registration_invalid" };
  return { ok: true, value };
}

function normalizeIdentifierValue(raw) {
  const display = String(raw == null ? "" : raw).trim();
  if (!display || display.length > 128) return { ok: false, code: "identifier_value_invalid" };
  const normalized = display.toUpperCase().replace(/\s+/g, "");
  if (!normalized || normalized.length > 128) {
    return { ok: false, code: "identifier_value_invalid" };
  }
  return { ok: true, normalized, display };
}

/**
 * @param {object} demographics
 */
function normalizePatientDemographics(demographics) {
  const firstName = trimRequired(demographics && demographics.firstName, 100);
  const lastName = trimRequired(demographics && demographics.lastName, 100);
  if (!firstName || !lastName) {
    return { ok: false, code: "name_required" };
  }

  const middle = trimOptional(demographics.middleName, 100);
  if (middle && middle.ok === false) return { ok: false, code: "middle_name_invalid" };
  const preferred = trimOptional(demographics.preferredName, 100);
  if (preferred && preferred.ok === false) return { ok: false, code: "preferred_name_invalid" };

  const dob = normalizeDateOfBirth(demographics.dateOfBirth);
  if (!dob.ok) return dob;

  const sex = normalizeSexAtRegistration(demographics.sexAtRegistration);
  if (!sex.ok) return sex;

  let nationalityCountryCode = null;
  if (demographics.nationalityCountryCode) {
    const c = normalizeCountryCode(demographics.nationalityCountryCode);
    if (!c.ok) return { ok: false, code: c.code };
    nationalityCountryCode = c.value;
  }

  const language = trimOptional(demographics.primaryLanguage, 64);
  if (language && language.ok === false) return { ok: false, code: "primary_language_invalid" };

  return {
    ok: true,
    value: {
      firstName,
      middleName: middle && middle.ok ? middle.value : null,
      lastName,
      preferredName: preferred && preferred.ok ? preferred.value : null,
      dateOfBirth: dob.value,
      estimatedDateOfBirth: demographics.estimatedDateOfBirth === true,
      sexAtRegistration: sex.value,
      nationalityCountryCode,
      primaryLanguage: language && language.ok ? language.value : null,
    },
  };
}

function normalizePatientContacts(contacts) {
  contacts = contacts || {};
  let phoneNormalized = null;
  let phoneDisplay = null;
  if (contacts.phone != null && String(contacts.phone).trim() !== "") {
    const phone = normalizeActiveClinicPhone(contacts.phone);
    if (!phone.ok) return { ok: false, code: phone.code };
    phoneNormalized = phone.normalized;
    phoneDisplay = phone.display;
  }

  const email = normalizeActiveClinicEmail(contacts.email);
  if (!email.ok) return { ok: false, code: email.code };

  let preferredContactMethod = null;
  if (contacts.preferredContactMethod != null && String(contacts.preferredContactMethod).trim() !== "") {
    preferredContactMethod = String(contacts.preferredContactMethod).trim().toLowerCase();
    if (!CONTACT_METHODS.includes(preferredContactMethod)) {
      return { ok: false, code: "preferred_contact_method_invalid" };
    }
  }

  let allowAdminReminders = null;
  if (contacts.allowAdminReminders === true || contacts.allowAdminReminders === false) {
    allowAdminReminders = contacts.allowAdminReminders;
  }

  return {
    ok: true,
    value: {
      phoneNormalized,
      phoneDisplay,
      emailNormalized: email.normalized,
      emailDisplay: email.display,
      preferredContactMethod,
      allowAdminReminders,
    },
  };
}

function normalizePatientAddress(address) {
  address = address || {};
  const fields = {};
  for (const [key, max] of [
    ["addressLine1", 200],
    ["addressLine2", 200],
    ["city", 120],
    ["district", 120],
    ["province", 120],
    ["postalCode", 32],
  ]) {
    const opt = trimOptional(address[key], max);
    if (opt && opt.ok === false) return { ok: false, code: `${key}_invalid` };
    fields[key] = opt && opt.ok ? opt.value : null;
  }
  let countryCode = null;
  if (address.countryCode) {
    const c = normalizeCountryCode(address.countryCode);
    if (!c.ok) return { ok: false, code: c.code };
    countryCode = c.value;
  }
  return {
    ok: true,
    value: {
      addressLine1: fields.addressLine1,
      addressLine2: fields.addressLine2,
      city: fields.city,
      district: fields.district,
      province: fields.province,
      countryCode,
      postalCode: fields.postalCode,
    },
  };
}

function normalizeIdentifierInput(raw) {
  const identifierType = String((raw && raw.identifierType) || "")
    .trim()
    .toLowerCase();
  if (!IDENTIFIER_TYPES.includes(identifierType)) {
    return { ok: false, code: "identifier_type_invalid" };
  }
  const value = normalizeIdentifierValue(raw.identifierValue || raw.value);
  if (!value.ok) return value;
  let issuingCountryCode = null;
  if (raw.issuingCountryCode) {
    const c = normalizeCountryCode(raw.issuingCountryCode);
    if (!c.ok) return { ok: false, code: c.code };
    issuingCountryCode = c.value;
  }
  const issuer = trimOptional(raw.issuer, 120);
  if (issuer && issuer.ok === false) return { ok: false, code: "issuer_invalid" };
  const verificationStatus = String(raw.verificationStatus || "unverified")
    .trim()
    .toLowerCase();
  if (!["unverified", "verified", "rejected", "expired"].includes(verificationStatus)) {
    return { ok: false, code: "verification_status_invalid" };
  }
  return {
    ok: true,
    value: {
      identifierType,
      identifierValueNormalized: value.normalized,
      identifierValueDisplay: value.display,
      issuingCountryCode,
      issuer: issuer && issuer.ok ? issuer.value : null,
      isPrimary: raw.isPrimary === true,
      verificationStatus,
      verifiedAt: verificationStatus === "verified" ? raw.verifiedAt || new Date() : null,
    },
  };
}

function normalizeEmergencyContactInput(raw) {
  const fullName = trimRequired(raw && raw.fullName, 200);
  const relationship = trimRequired(raw && raw.relationship, 80);
  if (!fullName || !relationship) return { ok: false, code: "emergency_contact_invalid" };
  const phone = normalizeActiveClinicPhone(raw.phone);
  if (!phone.ok) return { ok: false, code: phone.code };
  const email = normalizeActiveClinicEmail(raw.email);
  if (!email.ok) return { ok: false, code: email.code };
  const address = trimOptional(raw.addressSummary, 300);
  if (address && address.ok === false) return { ok: false, code: "address_summary_invalid" };
  let consentToContact = null;
  if (raw.consentToContact === true || raw.consentToContact === false) {
    consentToContact = raw.consentToContact;
  }
  return {
    ok: true,
    value: {
      fullName,
      relationship,
      phoneNormalized: phone.normalized,
      phoneDisplay: phone.display,
      emailNormalized: email.normalized,
      emailDisplay: email.display,
      addressSummary: address && address.ok ? address.value : null,
      isPrimary: raw.isPrimary === true,
      consentToContact,
    },
  };
}

module.exports = {
  SEX_VALUES,
  STATUSES,
  IDENTIFIER_TYPES,
  REGISTRATION_METHODS,
  CONTACT_METHODS,
  normalizeDateOfBirth,
  normalizeSexAtRegistration,
  normalizeIdentifierValue,
  normalizePatientDemographics,
  normalizePatientContacts,
  normalizePatientAddress,
  normalizeIdentifierInput,
  normalizeEmergencyContactInput,
};
