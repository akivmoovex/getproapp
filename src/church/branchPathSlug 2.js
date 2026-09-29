"use strict";

/**
 * Stable org-scoped branch slug rules for Growth path routing
 * (`/{primary}.blessboard.com/branches/{slug}`).
 *
 * Distinct from globally unique host_slug (DNS). Path slugs are unique per organisation.
 */

const { normalizeSlug, SLUG_PATTERN } = require("./platformProvisioningValidation");

/** Path segments / marketing labels that must never be branch path slugs. */
const BRANCH_PATH_RESERVED_SLUGS = new Set([
  "www",
  "admin",
  "api",
  "static",
  "mail",
  "app",
  "church",
  "global",
  "demo",
  "zm",
  "blessboard",
  "getpro",
  "support",
  "hq",
  "branch",
  "branches",
  "member",
  "members",
  "login",
  "register",
  "assets",
  "about",
  "events",
  "sermons",
  "ministries",
  "leadership",
  "giving",
  "contact",
  "privacy",
  "terms",
  "new",
  "edit",
  "open",
  "transfer",
]);

/**
 * @param {unknown} value
 * @returns {{ ok: true, slug: string } | { ok: false, error: string }}
 */
function validateBranchPathSlug(value) {
  const slug = normalizeSlug(value);
  if (!slug) {
    return { ok: false, error: "Branch slug is required." };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      ok: false,
      error: "Branch slug must be lowercase letters, numbers, or hyphens (max 63 characters).",
    };
  }
  if (BRANCH_PATH_RESERVED_SLUGS.has(slug)) {
    return { ok: false, error: "Branch slug is reserved." };
  }
  return { ok: true, slug };
}

/**
 * Stable display/path slug for a branch row (org-scoped).
 * Prefer `slug`; fall back to host_slug for legacy rows.
 * @param {{ slug?: string | null, host_slug?: string | null } | null} branch
 */
function branchPathSlug(branch) {
  if (!branch) return "";
  return normalizeSlug(branch.slug || branch.host_slug || "");
}

module.exports = {
  BRANCH_PATH_RESERVED_SLUGS,
  validateBranchPathSlug,
  branchPathSlug,
  normalizeSlug,
};
