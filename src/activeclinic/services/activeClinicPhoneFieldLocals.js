"use strict";

/**
 * Shared locals for ActiveClinic PhoneField partials.
 */

const {
  listPhoneCountries,
  resolveDefaultCountry,
  resolvePhoneValidationMode,
  VALIDATION_MODES,
  PLATFORM_DEFAULT_COUNTRY,
  getCountryFromE164,
  formatNational,
  extractPhoneFieldsFromBody,
  normalizePhoneNumber,
} = require("../../platform/services/phoneNumberService");

let cachedCountries = null;

function getPhoneCountries() {
  if (!cachedCountries) cachedCountries = listPhoneCountries();
  return cachedCountries;
}

/**
 * @param {{
 *   clinicDefaultCountry?: string|null,
 *   selectedCountry?: string|null,
 *   platformDefaultCountry?: string|null,
 *   env?: object,
 * }} [input]
 */
function buildPhoneFieldLocals(input) {
  const opts = input || {};
  const mode = resolvePhoneValidationMode(opts.env || process.env);
  const defaultCountry = resolveDefaultCountry({
    selectedCountry: opts.selectedCountry || null,
    clinicDefaultCountry: opts.clinicDefaultCountry || null,
    platformDefaultCountry: opts.platformDefaultCountry || PLATFORM_DEFAULT_COUNTRY,
  });
  return {
    phoneCountries: getPhoneCountries(),
    defaultPhoneCountry: defaultCountry,
    phoneValidationRelaxed: mode === VALIDATION_MODES.RELAXED,
    phoneValidationMode: mode,
    platformDefaultPhoneCountry: PLATFORM_DEFAULT_COUNTRY,
  };
}

/**
 * Resolve clinic default country from auth/product context.
 * @param {{ healthcareOrganization?: { countryCode?: string }, organization?: object }|null} ctx
 */
function clinicDefaultCountryFromContext(ctx) {
  if (!ctx) return null;
  const hco = ctx.healthcareOrganization || ctx.hco || null;
  if (hco && hco.countryCode) return String(hco.countryCode).toUpperCase();
  if (ctx.countryCode) return String(ctx.countryCode).toUpperCase();
  return null;
}

/**
 * Normalize phone from request body (legacy + structured) with clinic default.
 * @param {object} body
 * @param {{
 *   prefix?: string,
 *   clinicDefaultCountry?: string|null,
 *   required?: boolean,
 *   fieldKeys?: { phone?: string, country?: string, national?: string },
 * }} [options]
 */
function normalizePhoneFromBody(body, options) {
  const opts = options || {};
  const extracted = extractPhoneFieldsFromBody(body, opts.prefix || "");
  const fieldKeys = opts.fieldKeys || {};
  if (fieldKeys.phone && body && body[fieldKeys.phone] != null) {
    extracted.phone = body[fieldKeys.phone];
  }
  if (fieldKeys.country && body && body[fieldKeys.country] != null) {
    extracted.phoneCountry = body[fieldKeys.country];
  }
  if (fieldKeys.national && body && body[fieldKeys.national] != null) {
    extracted.phoneNational = body[fieldKeys.national];
  }

  // Prefer structured national when present; fall back to legacy phone.
  const national = extracted.phoneNational;
  const legacy = extracted.phone;
  const hasStructured = national != null && String(national).trim() !== "";
  const hasLegacy = legacy != null && String(legacy).trim() !== "";

  if (!hasStructured && !hasLegacy && opts.required === false) {
    return { ok: true, normalized: null, display: null, e164: null, country: null };
  }

  return normalizePhoneNumber({
    phone: hasStructured ? null : legacy,
    phoneCountry: extracted.phoneCountry,
    phoneNational: hasStructured ? national : null,
    clinicDefaultCountry: opts.clinicDefaultCountry || null,
    required: opts.required !== false,
  });
}

/**
 * Split stored E.164 into country + national for form editing.
 * @param {string|null|undefined} e164
 * @param {string|null|undefined} fallbackCountry
 */
function splitE164ForForm(e164, fallbackCountry) {
  const country = getCountryFromE164(e164) || fallbackCountry || PLATFORM_DEFAULT_COUNTRY;
  let national = "";
  if (e164) {
    try {
      const { parsePhoneNumberFromString } = require("libphonenumber-js");
      const phone = parsePhoneNumberFromString(String(e164));
      national = phone && phone.nationalNumber ? String(phone.nationalNumber) : formatNational(e164);
    } catch (_err) {
      national = String(e164);
    }
  }
  return { country, national, e164: e164 || "" };
}

module.exports = {
  getPhoneCountries,
  buildPhoneFieldLocals,
  clinicDefaultCountryFromContext,
  normalizePhoneFromBody,
  splitE164ForForm,
};
