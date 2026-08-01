"use strict";

/**
 * Compatibility redirects and vanity allowlist for organization / branch keys.
 * Kept explicit (no catch-all first-path resolver) to protect reserved apex routes.
 */

const { isReservedOrganizationKey, normalizeOrganizationKey } = require("./organizationKey");
const { normalizeBranchKey } = require("./branchKey");

/** Old public keys → canonical organization_key after controlled rename. */
const LEGACY_ORGANIZATION_KEY_REDIRECTS = Object.freeze({
  "automated-test-church": "demo-church",
  demo: "demo-church",
});

/**
 * Org-scoped legacy branch key redirects for the Demo Church testing tenant.
 * test-main is intentionally omitted — it was a generic fixture, not proven Lusaka/Ndola.
 */
const LEGACY_BRANCH_KEY_REDIRECTS = Object.freeze({
  "demo-church": Object.freeze({
    lusaka: "demo-church-lusaka",
    kitwe: "demo-church-ndola",
  }),
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
 * @param {string} organizationKey
 * @param {string} branchKeyRaw
 * @returns {string|null}
 */
function legacyBranchKeyRedirectTarget(organizationKey, branchKeyRaw) {
  const org = String(organizationKey || "")
    .trim()
    .toLowerCase();
  const branch = String(branchKeyRaw || "")
    .trim()
    .toLowerCase();
  if (!org || !branch) return null;
  const map = LEGACY_BRANCH_KEY_REDIRECTS[org];
  if (!map) return null;
  const target = map[branch];
  if (!target) return null;
  const norm = normalizeBranchKey(target);
  return norm.ok ? norm.key : null;
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
  LEGACY_BRANCH_KEY_REDIRECTS,
  VANITY_ORGANIZATION_KEYS,
  legacyOrganizationKeyRedirectTarget,
  legacyBranchKeyRedirectTarget,
  normalizeVanityOrganizationKey,
};
