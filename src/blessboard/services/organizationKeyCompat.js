"use strict";

/**
 * Compatibility redirects and vanity allowlist for organization keys.
 * Kept explicit (no catch-all first-path resolver) to protect reserved apex routes.
 */

const { isReservedOrganizationKey, normalizeOrganizationKey } = require("./organizationKey");

/** Old public keys → canonical organization_key after controlled rename. */
const LEGACY_ORGANIZATION_KEY_REDIRECTS = Object.freeze({
  "automated-test-church": "demo-church",
});

/**
 * Apex vanity paths (without /c/) that may resolve to a path-public church site.
 * Only allowlisted keys are eligible — unknown first segments must fall through to 404.
 */
const VANITY_ORGANIZATION_KEYS = Object.freeze(["demo-church"]);

const VANITY_SET = new Set(VANITY_ORGANIZATION_KEYS);

/**
 * @param {string} rawKey
 * @returns {string|null} canonical key to redirect to, or null
 */
function legacyOrganizationKeyRedirectTarget(rawKey) {
  const key = String(rawKey || "")
    .trim()
    .toLowerCase();
  if (!key || isReservedOrganizationKey(key)) return null;
  const target = LEGACY_ORGANIZATION_KEY_REDIRECTS[key];
  return target || null;
}

/**
 * @param {string} rawKey
 * @returns {{ ok: true, key: string } | { ok: false, reason: string }}
 */
function normalizeVanityOrganizationKey(rawKey) {
  const raw = String(rawKey || "")
    .trim()
    .toLowerCase();
  if (!raw) return { ok: false, reason: "empty" };
  if (isReservedOrganizationKey(raw)) return { ok: false, reason: "reserved_key" };
  const norm = normalizeOrganizationKey(raw);
  if (!norm.ok || norm.key !== raw) return { ok: false, reason: "invalid_key" };
  if (!VANITY_SET.has(norm.key)) return { ok: false, reason: "not_allowlisted" };
  return { ok: true, key: norm.key };
}

module.exports = {
  LEGACY_ORGANIZATION_KEY_REDIRECTS,
  VANITY_ORGANIZATION_KEYS,
  legacyOrganizationKeyRedirectTarget,
  normalizeVanityOrganizationKey,
};
