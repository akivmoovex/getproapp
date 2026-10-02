"use strict";

/**
 * Branch key normalization and reserved-key protection for BlessBoard V5 campuses.
 * Keys are immutable after insert; uniqueness is enforced per church in the DB.
 */

const BRANCH_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/** Exact-match reserved keys after normalization (HQ row, route collisions, system tokens). */
const RESERVED_BRANCH_KEYS = Object.freeze([
  "about",
  "admin",
  "api",
  "branch",
  "branches",
  "contact",
  "create",
  "edit",
  "events",
  "giving",
  "hq",
  "leadership",
  "login",
  "logout",
  "me",
  "ministries",
  "new",
  "sermons",
  "settings",
  "www",
]);

const RESERVED_SET = new Set(RESERVED_BRANCH_KEYS);

/**
 * @param {unknown} raw
 * @returns {string}
 */
function slugifyBranchKey(raw) {
  return String(raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u201A\u2032`']/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64);
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, key: string } | { ok: false, reason: string, message: string }}
 */
function normalizeBranchKey(raw) {
  const key = slugifyBranchKey(raw);
  if (!key || !BRANCH_KEY_RE.test(key)) {
    return {
      ok: false,
      reason: "branch_key",
      message:
        "Enter a branch key starting with a letter (lowercase letters, numbers, hyphens, or underscores; max 64 characters).",
    };
  }
  if (RESERVED_SET.has(key)) {
    return {
      ok: false,
      reason: "reserved_key",
      message: "That branch key is reserved. Please choose a different key.",
    };
  }
  return { ok: true, key };
}

/**
 * @param {string} key
 */
function isReservedBranchKey(key) {
  return RESERVED_SET.has(String(key || "").trim().toLowerCase());
}

/**
 * Append numeric collision suffix while staying within 64 chars and BRANCH_KEY_RE.
 * @param {string} base
 * @param {number} n
 * @returns {string}
 */
function withBranchKeySuffix(base, n) {
  const root = String(base || "").trim().toLowerCase();
  if (!root) return "";
  if (!n || n <= 1) return root.slice(0, 64);
  const suffix = n < 10 ? `-0${n}` : `-${n}`;
  const maxRoot = Math.max(1, 64 - suffix.length);
  let truncated = root.slice(0, maxRoot).replace(/-+$/g, "");
  if (!truncated) truncated = "b";
  if (!/^[a-z]/.test(truncated)) truncated = `b-${truncated}`.slice(0, maxRoot);
  return `${truncated}${suffix}`.slice(0, 64);
}

/**
 * Resolve a usable branch key from a display name (registration preview + provisioning).
 * @param {unknown} raw
 * @returns {{ ok: true, key: string } | { ok: false, reason: string }}
 */
function resolveBaseBranchKey(raw) {
  const slug = slugifyBranchKey(raw);
  if (!slug) return { ok: false, reason: "invalid_key" };

  const direct = normalizeBranchKey(slug);
  if (direct.ok) return direct;

  if (direct.reason === "branch_key" || direct.reason === "reserved_key") {
    const alts = [`${slug}-branch`, `campus-${slug}`, `b-${slug}`];
    for (const alt of alts) {
      const norm = normalizeBranchKey(alt);
      if (norm.ok) return norm;
    }
  }
  return { ok: false, reason: direct.reason || "invalid_key" };
}

module.exports = {
  BRANCH_KEY_RE,
  RESERVED_BRANCH_KEYS,
  slugifyBranchKey,
  normalizeBranchKey,
  isReservedBranchKey,
  withBranchKeySuffix,
  resolveBaseBranchKey,
};
