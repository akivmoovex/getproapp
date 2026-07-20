"use strict";

/**
 * Allowlisted public ↔ database plan mapping for BlessBoard registration.
 *
 * Public catalogue codes (forms, applications.selected_plan): foundation | growth | network
 * Database catalogue keys (platform.plans.plan_key): free | growth | professional | partner
 *
 * Network product branding stays "Network"; the DB key remains "professional".
 * Do not rename plan_key in this module's consumers.
 */

const PUBLIC_PLAN_CODES = Object.freeze({
  FOUNDATION: "foundation",
  GROWTH: "growth",
  NETWORK: "network",
});

const DB_PLAN_KEYS = Object.freeze({
  FREE: "free",
  GROWTH: "growth",
  /** Canonical DB key for the Network product. */
  PROFESSIONAL: "professional",
  PARTNER: "partner",
});

/** Public registration/application codes that may be stored on selected_plan. */
const ALLOWED_PUBLIC_PLAN_CODES = Object.freeze([
  PUBLIC_PLAN_CODES.FOUNDATION,
  PUBLIC_PLAN_CODES.GROWTH,
  PUBLIC_PLAN_CODES.NETWORK,
]);

/**
 * Directory / subscription filter values accepted from admin UI.
 * Prefer public Network branding; also accept the DB key for operators.
 */
const ALLOWED_DIRECTORY_PLAN_FILTERS = Object.freeze([
  DB_PLAN_KEYS.FREE,
  DB_PLAN_KEYS.GROWTH,
  PUBLIC_PLAN_CODES.NETWORK,
  DB_PLAN_KEYS.PROFESSIONAL,
]);

const PUBLIC_TO_DB = Object.freeze({
  [PUBLIC_PLAN_CODES.FOUNDATION]: DB_PLAN_KEYS.FREE,
  [PUBLIC_PLAN_CODES.GROWTH]: DB_PLAN_KEYS.GROWTH,
  [PUBLIC_PLAN_CODES.NETWORK]: DB_PLAN_KEYS.PROFESSIONAL,
});

const DB_TO_PUBLIC = Object.freeze({
  [DB_PLAN_KEYS.FREE]: PUBLIC_PLAN_CODES.FOUNDATION,
  [DB_PLAN_KEYS.GROWTH]: PUBLIC_PLAN_CODES.GROWTH,
  [DB_PLAN_KEYS.PROFESSIONAL]: PUBLIC_PLAN_CODES.NETWORK,
});

const PUBLIC_DISPLAY_LABELS = Object.freeze({
  [PUBLIC_PLAN_CODES.FOUNDATION]: "Foundation — Free",
  [PUBLIC_PLAN_CODES.GROWTH]: "Growth",
  [PUBLIC_PLAN_CODES.NETWORK]: "Network",
});

const DB_DISPLAY_LABELS = Object.freeze({
  [DB_PLAN_KEYS.FREE]: "Foundation — Free",
  [DB_PLAN_KEYS.GROWTH]: "Growth",
  [DB_PLAN_KEYS.PROFESSIONAL]: "Network",
  [DB_PLAN_KEYS.PARTNER]: "Partner",
});

function trimPlanToken(raw) {
  return String(raw == null ? "" : raw)
    .trim()
    .toLowerCase()
    .slice(0, 40);
}

/**
 * Normalize inbound public plan aliases to a stored public code, or null.
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizePublicPlanCode(raw) {
  const value = trimPlanToken(raw);
  if (!value) return null;
  if (value === "free" || value === "basic" || value === "basic_free") {
    return PUBLIC_PLAN_CODES.FOUNDATION;
  }
  if (ALLOWED_PUBLIC_PLAN_CODES.includes(value)) return value;
  return null;
}

/**
 * Map public / stored registration plan code → platform.plans.plan_key.
 * Network → professional. Unknown → null.
 * @param {unknown} raw
 * @returns {string | null}
 */
function mapPublicPlanToDbPlanKey(raw) {
  const publicCode = normalizePublicPlanCode(raw);
  if (!publicCode) return null;
  return PUBLIC_TO_DB[publicCode] || null;
}

/**
 * Map platform.plans.plan_key → public registration code when one exists.
 * @param {unknown} raw
 * @returns {string | null}
 */
function mapDbPlanKeyToPublicCode(raw) {
  const key = trimPlanToken(raw);
  if (!key) return null;
  return DB_TO_PUBLIC[key] || null;
}

/**
 * Resolve an organization-directory plan filter to the DB plan_key used in SQL.
 * Accepts public `network` or DB `professional` (and free/growth aliases).
 * @param {unknown} raw
 * @returns {string | null}
 */
function mapDirectoryPlanFilterToDbPlanKey(raw) {
  const value = trimPlanToken(raw);
  if (!value) return null;
  if (!ALLOWED_DIRECTORY_PLAN_FILTERS.includes(value)) return null;
  if (value === PUBLIC_PLAN_CODES.NETWORK || value === DB_PLAN_KEYS.PROFESSIONAL) {
    return DB_PLAN_KEYS.PROFESSIONAL;
  }
  if (value === PUBLIC_PLAN_CODES.FOUNDATION || value === DB_PLAN_KEYS.FREE) {
    return DB_PLAN_KEYS.FREE;
  }
  if (value === PUBLIC_PLAN_CODES.GROWTH || value === DB_PLAN_KEYS.GROWTH) {
    return DB_PLAN_KEYS.GROWTH;
  }
  return null;
}

/**
 * Customer-facing / admin label for a public plan code.
 * @param {unknown} raw
 * @returns {string}
 */
function publicPlanDisplayLabel(raw) {
  const code = normalizePublicPlanCode(raw);
  if (!code) return "";
  return PUBLIC_DISPLAY_LABELS[code] || code;
}

/**
 * Customer-facing label for a DB plan_key (professional → Network).
 * @param {unknown} raw
 * @returns {string}
 */
function dbPlanDisplayLabel(raw) {
  const key = trimPlanToken(raw);
  if (!key) return "";
  return DB_DISPLAY_LABELS[key] || key;
}

/**
 * Label for either a public code or a DB key.
 * @param {unknown} raw
 * @returns {string}
 */
function planDisplayLabel(raw) {
  const value = trimPlanToken(raw);
  if (!value) return "";
  if (DB_DISPLAY_LABELS[value]) return DB_DISPLAY_LABELS[value];
  return publicPlanDisplayLabel(value);
}

module.exports = {
  PUBLIC_PLAN_CODES,
  DB_PLAN_KEYS,
  ALLOWED_PUBLIC_PLAN_CODES,
  ALLOWED_DIRECTORY_PLAN_FILTERS,
  PUBLIC_TO_DB,
  DB_TO_PUBLIC,
  PUBLIC_DISPLAY_LABELS,
  DB_DISPLAY_LABELS,
  normalizePublicPlanCode,
  mapPublicPlanToDbPlanKey,
  mapDbPlanKeyToPublicCode,
  mapDirectoryPlanFilterToDbPlanKey,
  publicPlanDisplayLabel,
  dbPlanDisplayLabel,
  planDisplayLabel,
};
