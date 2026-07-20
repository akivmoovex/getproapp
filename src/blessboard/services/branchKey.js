"use strict";

/**
 * Branch key normalization and reserved-key protection for BlessBoard V5 campuses.
 * Keys are immutable after insert; uniqueness is enforced per church in the DB.
 */

const BRANCH_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/** Exact-match reserved keys after normalization (HQ row, route collisions, system tokens). */
const RESERVED_BRANCH_KEYS = Object.freeze([
  "admin",
  "api",
  "branch",
  "branches",
  "create",
  "hq",
  "login",
  "logout",
  "me",
  "new",
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

module.exports = {
  BRANCH_KEY_RE,
  RESERVED_BRANCH_KEYS,
  slugifyBranchKey,
  normalizeBranchKey,
  isReservedBranchKey,
};
