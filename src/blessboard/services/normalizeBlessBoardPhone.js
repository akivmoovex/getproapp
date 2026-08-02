"use strict";

/**
 * Canonical BlessBoard V5 phone normalization.
 * Stores E.164-compatible values; never compare raw formatted phones.
 *
 * Default country is Zambia (+260) when no country is supplied.
 * Callers that must not invent a country should pass `{ requireCountry: true }`.
 */

const PHONE_E164_RE = /^\+[1-9]\d{6,14}$/;

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

const DEFAULT_COUNTRY = "ZM";

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
  return null;
}

/**
 * @param {unknown} phone
 * @param {string | {
 *   country?: unknown,
 *   defaultCountry?: string | null,
 *   requireCountry?: boolean,
 * } | null | undefined} [optionsOrCountry]
 * @returns {{
 *   ok: true,
 *   display: string,
 *   normalized: string,
 *   countryCode: string | null,
 * } | {
 *   ok: false,
 *   error: string,
 *   field: "phone",
 * }}
 */
function normalizeBlessBoardPhone(phone, optionsOrCountry) {
  const opts =
    optionsOrCountry != null && typeof optionsOrCountry === "object"
      ? optionsOrCountry
      : { country: optionsOrCountry };

  const display = trim(phone, 50);
  if (!display) {
    return { ok: false, error: "Please enter a phone number.", field: "phone" };
  }

  let cleaned = display.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("00")) {
    cleaned = `+${cleaned.slice(2)}`;
  }

  if (cleaned.includes("+") && !cleaned.startsWith("+")) {
    return {
      ok: false,
      error: "Please enter a valid phone number with country code (for example +260…).",
      field: "phone",
    };
  }

  if (cleaned.startsWith("+")) {
    const normalized = `+${digitsOnly(cleaned.slice(1))}`;
    if (!PHONE_E164_RE.test(normalized)) {
      return {
        ok: false,
        error: "Please enter a valid phone number with country code (for example +260…).",
        field: "phone",
      };
    }
    const ccDigits = digitsOnly(normalized).slice(0, 3);
    let countryCode = null;
    for (const [name, code] of Object.entries(COUNTRY_CALLING_CODES)) {
      if (name.length === 2 && normalized.startsWith(`+${code}`)) {
        countryCode = name.toUpperCase();
        break;
      }
      void ccDigits;
    }
    return { ok: true, display, normalized, countryCode };
  }

  const countryRaw = opts.country;
  const countryProvided =
    countryRaw != null && String(countryRaw).trim() !== "";
  let country = countryProvided ? countryRaw : null;

  if (!countryProvided) {
    if (opts.requireCountry === true) {
      return {
        ok: false,
        error:
          "Please enter your phone number with an international country code (for example +260…), or use a recognized country name.",
        field: "phone",
      };
    }
    const defaultCountry =
      opts.defaultCountry === null
        ? null
        : opts.defaultCountry != null
          ? opts.defaultCountry
          : DEFAULT_COUNTRY;
    if (defaultCountry == null || String(defaultCountry).trim() === "") {
      return {
        ok: false,
        error:
          "Please enter your phone number with an international country code (for example +260…), or use a recognized country name.",
        field: "phone",
      };
    }
    country = defaultCountry;
  }

  const callingCode = resolveCallingCode(country);
  if (!callingCode) {
    return {
      ok: false,
      error:
        "Please enter your phone number with an international country code (for example +260…), or use a recognized country name.",
      field: "phone",
    };
  }

  let national = digitsOnly(cleaned);
  if (!national) {
    return { ok: false, error: "Please enter a valid phone number.", field: "phone" };
  }
  // Strip leading trunk 0 (e.g. 0971234567 → 971234567)
  if (national.startsWith("0")) {
    national = national.slice(1);
  }
  // Numbers that already include the country calling code without + / 00
  if (national.startsWith(callingCode) && national.length > callingCode.length + 5) {
    national = national.slice(callingCode.length);
  }
  if (national.length < 6 || national.length > 12) {
    return {
      ok: false,
      error: "Please enter a valid phone number.",
      field: "phone",
    };
  }

  const normalized = `+${callingCode}${national}`;
  if (!PHONE_E164_RE.test(normalized)) {
    return {
      ok: false,
      error: "Please enter a valid phone number.",
      field: "phone",
    };
  }

  const countryCode =
    typeof country === "string" && /^[a-z]{2}$/i.test(String(country).trim())
      ? String(country).trim().toUpperCase()
      : resolveCallingCode(country) === "260"
        ? "ZM"
        : null;

  return { ok: true, display, normalized, countryCode };
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
