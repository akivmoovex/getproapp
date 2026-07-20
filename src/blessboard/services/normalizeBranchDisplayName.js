"use strict";

/**
 * Canonical branch display-name normalization for BlessBoard V5.
 * Ownership boundary: blessboard.branches.church_id (one church per organization).
 * Preserves user-facing display_name; compares on normalized form.
 */

const DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE =
  "A branch with this name already exists for this church. Please choose a different branch name.";

/**
 * Normalize for comparison: trim, collapse internal whitespace, lowercase.
 * Does not strip punctuation.
 * @param {unknown} value
 * @returns {string}
 */
function normalizeBranchDisplayName(value) {
  return String(value == null ? "" : value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Validate and prepare display + normalized pair for persistence.
 * @param {unknown} value
 * @param {{ max?: number, required?: boolean, emptyMessage?: string }} [opts]
 * @returns {{
 *   ok: true,
 *   display: string,
 *   normalized: string
 * } | {
 *   ok: false,
 *   error: string,
 *   field: "branch_name" | "displayName"
 * }}
 */
function prepareBranchDisplayName(value, opts = {}) {
  const max = opts.max == null ? 200 : opts.max;
  const field = opts.field || "branch_name";
  const raw = String(value == null ? "" : value);
  const display = raw.trim().replace(/\s+/g, " ").slice(0, max);
  const normalized = normalizeBranchDisplayName(display);
  if (!display || !normalized) {
    if (opts.required === false) {
      return { ok: true, display: "", normalized: "" };
    }
    return {
      ok: false,
      error: opts.emptyMessage || "Please enter a branch name.",
      field,
    };
  }
  if (display.length > max) {
    return {
      ok: false,
      error: `Branch name must be ${max} characters or fewer.`,
      field,
    };
  }
  return { ok: true, display, normalized };
}

function isUniqueBranchDisplayNameViolation(err) {
  if (!err) return false;
  if (String(err.code) !== "23505") return false;
  const constraint = String(err.constraint || err.constraint_name || "");
  const detail = String(err.detail || err.message || "");
  return (
    constraint.includes("display_name_normalized") ||
    detail.includes("display_name_normalized") ||
    detail.includes("branches_church_display_name_normalized_live_uidx")
  );
}

module.exports = {
  DUPLICATE_BRANCH_DISPLAY_NAME_MESSAGE,
  normalizeBranchDisplayName,
  prepareBranchDisplayName,
  isUniqueBranchDisplayNameViolation,
};
