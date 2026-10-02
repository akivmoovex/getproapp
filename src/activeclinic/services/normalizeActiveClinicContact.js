"use strict";

/**
 * Product-local contact helpers for ActiveClinic.
 * Phone normalization delegates to the shared platform PhoneNumberService.
 */

const {
  PHONE_E164_RE,
  PLATFORM_DEFAULT_COUNTRY,
  normalizePhoneNumber,
  extractPhoneFieldsFromBody,
  resolveDefaultCountry,
  resolvePhoneValidationMode,
} = require("../../platform/services/phoneNumberService");

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;

/**
 * Normalize a phone for ActiveClinic storage / identity.
 *
 * Accepts:
 * - legacy string: "+260971234567" or national with options.country
 * - structured: { phone, phoneCountry, phoneNational, clinicDefaultCountry }
 * - (raw, options) where options may include phoneCountry / phoneNational / clinicDefaultCountry
 *
 * @param {unknown} rawOrInput
 * @param {object} [options]
 * @returns {{ ok: true, normalized: string|null, display: string|null, e164?: string|null, country?: string|null } | { ok: false, code: string, error?: string, field?: string }}
 */
function normalizeActiveClinicPhone(rawOrInput, options) {
  const opts = options && typeof options === "object" ? { ...options } : {};
  let fields = {
    phone: null,
    phoneCountry: opts.phoneCountry || opts.country || null,
    phoneNational: opts.phoneNational || opts.national || null,
  };

  if (rawOrInput != null && typeof rawOrInput === "object" && !Array.isArray(rawOrInput)) {
    fields = {
      phone: rawOrInput.phone != null ? rawOrInput.phone : rawOrInput.phone_number || rawOrInput.mobile,
      phoneCountry:
        rawOrInput.phoneCountry ||
        rawOrInput.phone_country ||
        rawOrInput.country ||
        fields.phoneCountry,
      phoneNational:
        rawOrInput.phoneNational ||
        rawOrInput.phone_national ||
        rawOrInput.national ||
        fields.phoneNational,
      clinicDefaultCountry:
        rawOrInput.clinicDefaultCountry || opts.clinicDefaultCountry || null,
      defaultCountry: rawOrInput.defaultCountry || opts.defaultCountry || null,
      required: rawOrInput.required != null ? rawOrInput.required : opts.required,
      validationMode: rawOrInput.validationMode || opts.validationMode,
    };
  } else {
    fields.phone = rawOrInput;
    fields.clinicDefaultCountry = opts.clinicDefaultCountry || null;
    fields.defaultCountry = opts.defaultCountry || null;
    fields.required = opts.required;
    fields.validationMode = opts.validationMode;
  }

  // If only structured national is present, phone may be empty.
  const result = normalizePhoneNumber({
    phone: fields.phone,
    phoneCountry: fields.phoneCountry,
    phoneNational: fields.phoneNational,
    clinicDefaultCountry: fields.clinicDefaultCountry,
    defaultCountry: fields.defaultCountry || PLATFORM_DEFAULT_COUNTRY,
    required: fields.required !== false,
    validationMode: fields.validationMode,
  });

  if (!result.ok) {
    // Preserve legacy code names used by ActiveClinic routes.
    let code = result.code;
    if (code === "phone_unparseable" || code === "phone_invalid_for_country") {
      code = "phone_invalid";
    }
    return {
      ok: false,
      code,
      error: result.error,
      field: result.field || "phone",
    };
  }

  return {
    ok: true,
    normalized: result.e164,
    display: result.display || result.e164,
    e164: result.e164,
    country: result.country,
    national: result.national,
  };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, normalized: string|null, display: string|null } | { ok: false, code: string }}
 */
function normalizeActiveClinicEmail(raw) {
  if (raw == null || String(raw).trim() === "") {
    return { ok: true, normalized: null, display: null };
  }
  const display = String(raw).trim();
  const normalized = display.toLowerCase();
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) {
    return { ok: false, code: "email_invalid" };
  }
  return { ok: true, normalized, display: display.slice(0, 254) };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, code: string }}
 */
function normalizeCountryCode(raw) {
  const value = String(raw == null ? "" : raw)
    .trim()
    .toUpperCase();
  if (!COUNTRY_RE.test(value)) return { ok: false, code: "country_code_invalid" };
  return { ok: true, value };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, code: string }}
 */
function normalizeTimezone(raw) {
  const value = String(raw == null ? "" : raw).trim();
  if (!value || value.length > 64) return { ok: false, code: "timezone_invalid" };
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
  } catch (_err) {
    return { ok: false, code: "timezone_invalid" };
  }
  return { ok: true, value };
}

/** Curated options for settings selects; validation still accepts any valid IANA zone. */
function listActiveClinicTimezoneOptions() {
  const preferred = [
    "Africa/Lusaka",
    "Africa/Harare",
    "Africa/Johannesburg",
    "Africa/Nairobi",
    "Africa/Lagos",
    "Africa/Cairo",
    "UTC",
    "Europe/London",
  ];
  let supported = preferred;
  try {
    if (typeof Intl.supportedValuesOf === "function") {
      supported = Intl.supportedValuesOf("timeZone");
    }
  } catch (_err) {
    supported = preferred;
  }
  const set = new Set(supported);
  const ordered = preferred.filter((z) => set.has(z));
  for (const z of supported) {
    if (!ordered.includes(z) && z.startsWith("Africa/")) ordered.push(z);
  }
  return ordered;
}

module.exports = {
  EMAIL_RE,
  PHONE_E164_RE,
  PLATFORM_DEFAULT_COUNTRY,
  normalizeActiveClinicPhone,
  normalizeActiveClinicEmail,
  normalizeCountryCode,
  normalizeTimezone,
  listActiveClinicTimezoneOptions,
  extractPhoneFieldsFromBody,
  resolveDefaultCountry,
  resolvePhoneValidationMode,
};
