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
 * Statuses that occupy the phone for a *different* applicant's self-registration.
 * Same-email reuse (multi-org / retry) is allowed at the application layer.
 *
 * In-flight: submitted / review / provisioning
 * Occupying completed: active + provisioned (blocks a different email only)
 */
const PHONE_UNIQUENESS_APPLICATION_STATUSES = Object.freeze([
  "submitted",
  "duplicate_review",
  "review_required",
  "provisioning",
  "active",
]);
const PHONE_UNIQUENESS_PROVISIONING_STATUSES = Object.freeze([
  "provisioning",
  "provisioned",
  "provisioning_failed",
]);

/**
 * @param {unknown} phone
 * @param {unknown | {
 *   country?: unknown,
 *   phoneCountry?: unknown,
 *   phoneNational?: unknown,
 *   env?: object,
 *   validationMode?: string,
 *   defaultCountry?: string | null,
 *   requireCountry?: boolean,
 * }} [countryOrOptions]
 * @returns {{
 *   ok: true,
 *   display: string,
 *   normalized: string,
 *   countryCode?: string | null
 * } | {
 *   ok: false,
 *   error: string,
 *   field: "phone"
 * }}
 */
function normalizeRegistrationPhone(phone, countryOrOptions) {
  const opts =
    countryOrOptions != null && typeof countryOrOptions === "object"
      ? countryOrOptions
      : { country: countryOrOptions };
  const result = normalizeBlessBoardPhone(phone, {
    defaultCountry: DEFAULT_COUNTRY,
    ...opts,
  });
  if (!result.ok) return result;
  return {
    ok: true,
    display: result.display,
    normalized: result.normalized,
    countryCode: result.countryCode || null,
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
    ${a}application_status IN ('submitted', 'duplicate_review', 'review_required', 'provisioning', 'active')
    OR ${a}provisioning_status IN ('provisioning', 'provisioned', 'provisioning_failed')
  )`;
}

/**
 * Whether an occupying phone row blocks a new application for this email.
 * Same email may proceed (idempotent retry or multi-org identity reuse).
 * @param {object|null|undefined} occupyingRow
 * @param {string} applicantEmail
 */
function phoneOccupancyBlocksApplicant(occupyingRow, applicantEmail) {
  if (!occupyingRow) return false;
  const left = String(occupyingRow.contact_email || "")
    .trim()
    .toLowerCase();
  const right = String(applicantEmail || "")
    .trim()
    .toLowerCase();
  if (left && right && left === right) return false;
  return true;
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
  phoneOccupancyBlocksApplicant,
  digitsOnly,
};
