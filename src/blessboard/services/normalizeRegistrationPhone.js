"use strict";

/**
 * Canonical phone normalization for BlessBoard V5 public church registration.
 * Prefer E.164 when input + country data support it; reject ambiguous values.
 * Does not invent country codes. Not Zambia-only.
 */

const PHONE_E164_RE = /^\+[1-9]\d{6,14}$/;
const DUPLICATE_PHONE_MESSAGE =
  "This phone number is already linked to a BlessBoard church registration. Use a different number, or contact BlessBoard support if you need help.";

/**
 * ISO-2 and common English country names → ITU calling codes (digits only, no +).
 * Free-text country fields are matched case-insensitively after trim.
 * Keep this list intentionally modest — unknown countries require an international (+…) number.
 */
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

/**
 * Statuses that occupy the phone for a new self-registration.
 * Included: open / in-flight applications and any provisioned (or provisioning) tenant link.
 * Excluded (terminal / abandoned enquiry): rejected, cancelled, and closed without provision.
 *
 * application_status IN ('submitted', 'duplicate_review')
 * OR provisioning_status IN ('provisioning', 'provisioned', 'provisioning_failed')
 */
const PHONE_UNIQUENESS_APPLICATION_STATUSES = Object.freeze(["submitted", "duplicate_review"]);
const PHONE_UNIQUENESS_PROVISIONING_STATUSES = Object.freeze([
  "provisioning",
  "provisioned",
  "provisioning_failed",
]);

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
  if (/^[a-z]{2}$/.test(key) && COUNTRY_CALLING_CODES[key]) return COUNTRY_CALLING_CODES[key];
  return null;
}

/**
 * @param {unknown} phone
 * @param {unknown} [country]
 * @returns {{
 *   ok: true,
 *   display: string,
 *   normalized: string
 * } | {
 *   ok: false,
 *   error: string,
 *   field: "phone"
 * }}
 */
function normalizeRegistrationPhone(phone, country) {
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
      error: "Please enter a valid phone number with country code (for example +1…).",
      field: "phone",
    };
  }

  if (cleaned.startsWith("+")) {
    const normalized = `+${digitsOnly(cleaned.slice(1))}`;
    if (!PHONE_E164_RE.test(normalized)) {
      return {
        ok: false,
        error: "Please enter a valid phone number with country code (for example +1…).",
        field: "phone",
      };
    }
    return { ok: true, display, normalized };
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
  if (national.startsWith("0")) {
    national = national.slice(1);
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
  return { ok: true, display, normalized };
}

/**
 * SQL predicate fragment (no leading AND) for phone uniqueness occupancy.
 * Alias defaults to the applications table.
 * @param {string} [alias]
 */
function phoneUniquenessSqlPredicate(alias) {
  const a = alias ? `${alias}.` : "";
  return `(
    ${a}application_status IN ('submitted', 'duplicate_review')
    OR ${a}provisioning_status IN ('provisioning', 'provisioned', 'provisioning_failed')
  )`;
}

module.exports = {
  PHONE_E164_RE,
  DUPLICATE_PHONE_MESSAGE,
  COUNTRY_CALLING_CODES,
  PHONE_UNIQUENESS_APPLICATION_STATUSES,
  PHONE_UNIQUENESS_PROVISIONING_STATUSES,
  normalizeRegistrationPhone,
  resolveCallingCode,
  phoneUniquenessSqlPredicate,
  digitsOnly,
};
