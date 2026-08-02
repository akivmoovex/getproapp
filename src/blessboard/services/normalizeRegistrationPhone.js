"use strict";

/**
 * Canonical phone normalization for BlessBoard V5 public church registration.
 * Prefer E.164 when input + country data support it; reject ambiguous values.
 *
 * Delegates to normalizeBlessBoardPhone. Registration callers that omit country
 * still default to Zambia (+260) for national numbers (phone-first identity).
 * Pass `{ requireCountry: true }` when inventing a default must be refused.
 */

const {
  PHONE_E164_RE,
  COUNTRY_CALLING_CODES,
  DEFAULT_COUNTRY,
  normalizeBlessBoardPhone,
  resolveCallingCode,
  digitsOnly,
} = require("./normalizeBlessBoardPhone");

const DUPLICATE_PHONE_MESSAGE =
  "This phone number is already linked to a BlessBoard church registration. Use a different number, or contact BlessBoard support if you need help.";

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
  const result = normalizeBlessBoardPhone(phone, {
    country,
    defaultCountry: DEFAULT_COUNTRY,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    display: result.display,
    normalized: result.normalized,
  };
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
