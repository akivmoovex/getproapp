"use strict";

/**
 * Public website branch resolution for Stage 3 mini websites.
 * Never silently substitutes the primary branch for an explicit branchKey.
 */

const {
  resolveBlessBoardBranchForChurch,
  listBlessBoardBranches,
  normalizeBranchKey,
  STATUS: BRANCH_STATUS,
} = require("./listBlessBoardBranches");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * Resolve an active branch for a church by explicit public branch key.
 * Unknown / inactive / foreign → NOT_FOUND (callers map to HTTP 404).
 *
 * @param {{ query: Function }} db
 * @param {{ churchId: string, branchKey: string }} input
 */
async function resolvePublicWebsiteBranch(db, input) {
  const churchId = input && input.churchId != null ? String(input.churchId).trim() : "";
  const branchKey = normalizeBranchKey(input && input.branchKey);
  if (!churchId || !branchKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, branch: null };
  }

  const resolved = await resolveBlessBoardBranchForChurch(db, churchId, branchKey);
  if (!resolved.ok || !resolved.branch) {
    if (resolved.status === BRANCH_STATUS.LOOKUP_ERROR) {
      return { ok: false, status: STATUS.LOOKUP_ERROR, branch: null };
    }
    return { ok: false, status: STATUS.NOT_FOUND, branch: null };
  }

  return {
    ok: true,
    status: STATUS.OK,
    branch: {
      id: String(resolved.branch.id),
      key: String(resolved.branch.key),
      displayName: String(resolved.branch.displayName || ""),
      branchType: String(resolved.branch.branchType || ""),
      isPrimary: Boolean(resolved.branch.isPrimary),
    },
  };
}

/**
 * Active branches for public branch switcher (compact; no UUIDs in templates).
 * @param {{ query: Function }} db
 * @param {string} churchId
 */
async function listPublicWebsiteBranches(db, churchId) {
  const listed = await listBlessBoardBranches(db, churchId);
  if (!listed.ok) {
    return {
      ok: false,
      status: listed.status === BRANCH_STATUS.LOOKUP_ERROR ? STATUS.LOOKUP_ERROR : STATUS.NOT_FOUND,
      branches: [],
    };
  }
  return {
    ok: true,
    status: STATUS.OK,
    branches: (listed.branches || []).map((b) => ({
      key: b.key,
      displayName: b.displayName,
      branchType: b.branchType,
      isPrimary: Boolean(b.isPrimary),
    })),
  };
}

module.exports = {
  STATUS,
  resolvePublicWebsiteBranch,
  listPublicWebsiteBranches,
  normalizeBranchKey,
};
