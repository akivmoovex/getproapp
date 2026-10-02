"use strict";

/**
 * Canonical BlessBoard / platform phone normalization.
 * Delegates to shared PhoneNumberService (E.164). Default country Zambia (ZM).
 */

const {
  PHONE_E164_RE,
  PLATFORM_DEFAULT_COUNTRY,
  normalizePhoneNumber,
  getCountryFromE164,
} = require("../../platform/services/phoneNumberService");

/** @deprecated Prefer PhoneNumberService; retained for BlessBoard callers/tests. */
const COUNTRY_CALLING_CODES = Object.freeze({
  zm: "260",
  zambia: "260",
  za: "27",
  "south africa": "27",
  us: "1",
  usa: "1",
  "united states": "1",
  "united states of america": "1",
  ca: "1",
  canada: "1",
  gb: "44",
  uk: "44",
  "united kingdom": "44",
  ke: "254",
  kenya: "254",
  ng: "234",
  nigeria: "234",
  gh: "233",
  ghana: "233",
  tz: "255",
  tanzania: "255",
  ug: "256",
  uganda: "256",
  mw: "265",
  malawi: "265",
  bw: "267",
  botswana: "267",
  zw: "263",
  zimbabwe: "263",
  au: "61",
  australia: "61",
  in: "91",
  india: "91",
});

const DEFAULT_COUNTRY = PLATFORM_DEFAULT_COUNTRY;

function trim(value, max) {
  return String(value == null ? "" : value)
    .trim()
    .slice(0, max == null ? 500 : max);
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * @param {unknown} country
 * @returns {string | null} calling-code digits or null
 */
function resolveCallingCode(country) {
  const key = trim(country, 120).toLowerCase();
  if (!key) return null;
  if (COUNTRY_CALLING_CODES[key]) return COUNTRY_CALLING_CODES[key];
  // ISO-2
  if (/^[a-z]{2}$/i.test(key)) {
    try {
      const {
        getCountryCallingCode,
        getCountries,
      } = require("libphonenumber-js");
      const iso = key.toUpperCase();
      if (getCountries().includes(iso)) {
        return String(getCountryCallingCode(iso));
      }
    } catch (_err) {
      /* fall through */
    }
  }
  return null;
}

/**
 * @param {unknown} phone
 * @param {string | {
 *   country?: unknown,
 *   defaultCountry?: string | null,
 *   requireCountry?: boolean,
 *   clinicDefaultCountry?: string | null,
 *   phoneNational?: unknown,
 *   phoneCountry?: unknown,
 * } | null | undefined} [optionsOrCountry]
 */
function normalizeBlessBoardPhone(phone, optionsOrCountry) {
  const opts =
    optionsOrCountry != null && typeof optionsOrCountry === "object"
      ? optionsOrCountry
      : { country: optionsOrCountry };

  const display = trim(
    opts.phoneNational != null && String(opts.phoneNational).trim() !== ""
      ? opts.phoneNational
      : phone,
    50
  );

  if (!display && !(opts.phoneNational && String(opts.phoneNational).trim())) {
    return { ok: false, error: "Please enter a phone number.", field: "phone" };
  }

  let defaultCountry = DEFAULT_COUNTRY;
  if (opts.requireCountry === true && !(opts.country || opts.phoneCountry)) {
    return {
      ok: false,
      error:
        "Please enter your phone number with an international country code (for example +260…), or use a recognized country name.",
      field: "phone",
    };
  }
  if (opts.defaultCountry === null) {
    // Legacy: refuse inventing a country when national and no country provided.
    if (!(opts.country || opts.phoneCountry) && display && !String(display).trim().startsWith("+")) {
      return {
        ok: false,
        error:
          "Please enter your phone number with an international country code (for example +260…), or use a recognized country name.",
        field: "phone",
      };
    }
    defaultCountry = null;
  } else if (opts.defaultCountry != null) {
    defaultCountry = opts.defaultCountry;
  }

  const countryRaw = opts.phoneCountry || opts.country;
  let countryIso = null;
  const countryWasProvided =
    countryRaw != null && String(countryRaw).trim() !== "";
  const cleanedForIntl = display.replace(/[^\d+]/g, "");
  const isInternationalShape =
    cleanedForIntl.startsWith("+") || cleanedForIntl.startsWith("00");

  if (countryWasProvided) {
    const key = String(countryRaw).trim();
    if (/^[a-z]{2}$/i.test(key)) {
      countryIso = key.toUpperCase();
    } else {
      const nameToIso = {
        zambia: "ZM",
        "south africa": "ZA",
        "united states": "US",
        "united states of america": "US",
        usa: "US",
        canada: "CA",
        "united kingdom": "GB",
        uk: "GB",
        kenya: "KE",
        nigeria: "NG",
        ghana: "GH",
        tanzania: "TZ",
        uganda: "UG",
        malawi: "MW",
        botswana: "BW",
        zimbabwe: "ZW",
        australia: "AU",
        india: "IN",
      };
      countryIso = nameToIso[key.toLowerCase()] || null;
    }
    // Unrecognized country is fatal only for national numbers (ambiguous).
    // International / 00… inputs already carry the calling code.
    if (!countryIso && !isInternationalShape) {
      return {
        ok: false,
        error:
          "Please enter your phone number with an international country code (for example +260…), or use a recognized country name.",
        field: "phone",
      };
    }
  }

  const result = normalizePhoneNumber({
    phone: display,
    phoneCountry: countryIso,
    phoneNational: opts.phoneNational != null ? opts.phoneNational : null,
    clinicDefaultCountry: opts.clinicDefaultCountry || null,
    defaultCountry: defaultCountry || PLATFORM_DEFAULT_COUNTRY,
    required: true,
    env: opts.env,
    validationMode: opts.validationMode,
  });

  if (!result.ok) {
    return {
      ok: false,
      error: result.error || "Please enter a valid phone number.",
      field: "phone",
    };
  }

  return {
    ok: true,
    display: display || result.display,
    normalized: result.e164,
    countryCode: result.country || getCountryFromE164(result.e164),
  };
}

/**
 * Format a stored E.164 value for masked list display.
 * Example: +260971234567 → +260 97 *** 4567
 * @param {string | null | undefined} phoneE164
 */
function maskBlessBoardPhone(phoneE164) {
  const n = String(phoneE164 || "").trim();
  if (!PHONE_E164_RE.test(n)) return "•••";
  const digits = n.slice(1);
  if (digits.length < 8) return `+${digits.slice(0, 3)} ***`;
  const ccLen = digits.startsWith("260") ? 3 : digits.startsWith("1") ? 1 : 2;
  const cc = digits.slice(0, ccLen);
  const rest = digits.slice(ccLen);
  const head = rest.slice(0, 2);
  const tail = rest.slice(-4);
  return `+${cc} ${head} *** ${tail}`;
}

module.exports = {
  PHONE_E164_RE,
  COUNTRY_CALLING_CODES,
  DEFAULT_COUNTRY,
  normalizeBlessBoardPhone,
  resolveCallingCode,
  digitsOnly,
  maskBlessBoardPhone,
};
