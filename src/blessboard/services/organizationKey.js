"use strict";

/**
 * Canonical organization_key / church_key normalization and reserved-key checks
 * for Foundation path-based tenants.
 */

const ORG_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/** Reserved path / product tokens — exact match after normalization. */
const RESERVED_ORGANIZATION_KEYS = Object.freeze([
  "admin",
  "api",
  "account",
  "auth",
  "blessboard",
  "branch",
  "branches",
  "c",
  "church",
  "churches",
  "directory",
  "features",
  "for-churches",
  "getpro",
  "healthz",
  "hq",
  "login",
  "logout",
  "member",
  "org",
  "organization",
  "organizations",
  "platform",
  "portal",
  "pricing",
  "privacy",
  "register",
  "register-church",
  "static",
  "terms",
  "www",
]);

const RESERVED_SET = new Set(RESERVED_ORGANIZATION_KEYS);

/**
 * @param {string} raw
 * @returns {string}
 */
function slugifyOrganizationKey(raw) {
  const s = String(raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
  if (!s) return "";
  // Must start with a letter for organization_key format.
  if (/^[a-z]/.test(s)) return s.slice(0, 64);
  return `c-${s}`.slice(0, 64);
}

/**
 * @param {string} raw
 * @returns {{ ok: true, key: string } | { ok: false, reason: string }}
 */
function normalizeOrganizationKey(raw) {
  const key = slugifyOrganizationKey(raw);
  if (!key || !ORG_KEY_RE.test(key)) {
    return { ok: false, reason: "invalid_key" };
  }
  if (RESERVED_SET.has(key)) {
    return { ok: false, reason: "reserved_key" };
  }
  return { ok: true, key };
}

/**
 * @param {string} key
 * @returns {boolean}
 */
function isReservedOrganizationKey(key) {
  return RESERVED_SET.has(String(key || "").trim().toLowerCase());
}

module.exports = {
  ORG_KEY_RE,
  RESERVED_ORGANIZATION_KEYS,
  slugifyOrganizationKey,
  normalizeOrganizationKey,
  isReservedOrganizationKey,
};
