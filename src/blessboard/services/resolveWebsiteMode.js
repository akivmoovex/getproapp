"use strict";

/**
 * Website mode foundation for BlessBoard V5 public sites.
 *
 * single_site  — 0 or 1 active branch: church-wide CMS is the only public website
 *                (contentBranchId = null on public church-wide URLs).
 * multi_site   — 2+ active branches: church-wide CMS is HQ; each active branch may
 *                have an independent public website (contentBranchId = branch id).
 *
 * Active count and mode are always derived from server-scoped church data.
 * Never trust organization/church/branch IDs or counts supplied by the client.
 *
 * Does not change routes, redirects, or UI by itself — callers decide when to apply.
 * Active-count boundary flips (1↔2+) are described in websiteModeTransition.js
 * (no CMS copy/merge/delete; HQ notices only).
 */

const repo = require("../repositories/blessBoardBranchRepository");
const { normalizeBranchKey } = require("./listBlessBoardBranches");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const WEBSITE_MODE = Object.freeze({
  SINGLE_SITE: "single_site",
  MULTI_SITE: "multi_site",
});

/**
 * @param {object} row
 */
function mapActiveBranch(row) {
  if (!row) return null;
  const id = row.id != null ? String(row.id).trim() : "";
  const key = normalizeBranchKey(row.branch_key || row.key);
  if (!id || !key) return null;
  return {
    id,
    key,
    displayName: String(row.display_name || row.displayName || ""),
    branchType: String(row.branch_type || row.branchType || ""),
    isPrimary: Boolean(row.is_primary != null ? row.is_primary : row.isPrimary),
  };
}

/**
 * @param {Array<{ id: string, key: string, isPrimary: boolean }>} branches
 */
function pickPrimaryActiveBranch(branches) {
  if (!branches || !branches.length) return null;
  const primary = branches.find((b) => b.isPrimary);
  return primary || branches[0] || null;
}

/**
 * Pure derivation from a trusted active-branch list (inactive already excluded).
 * Prefer this when branches were already loaded for the same church in-request.
 *
 * @param {Array<object> | null | undefined} activeBranches
 */
function deriveWebsiteMode(activeBranches) {
  const branches = (Array.isArray(activeBranches) ? activeBranches : [])
    .map(mapActiveBranch)
    .filter(Boolean);
  const activeBranchCount = branches.length;
  const websiteMode =
    activeBranchCount >= 2 ? WEBSITE_MODE.MULTI_SITE : WEBSITE_MODE.SINGLE_SITE;

  return {
    ok: true,
    status: STATUS.OK,
    activeBranchCount,
    websiteMode,
    primaryActiveBranch: pickPrimaryActiveBranch(branches),
    activeBranches: branches,
    /** Church-wide public CMS always uses null (never a silent primary mirror). */
    churchWideContentBranchId: null,
  };
}

/**
 * Whether a branch may expose an independent public website under the given mode.
 * Requires multi_site and the branch present in the trusted active list.
 *
 * @param {ReturnType<typeof deriveWebsiteMode>} mode
 * @param {string | { id?: string, key?: string, branchKey?: string } | null | undefined} branchRef
 */
function branchMayHaveIndependentPublicWebsite(mode, branchRef) {
  if (!mode || mode.ok !== true) {
    return false;
  }
  if (branchRef == null) return false;

  let id = null;
  let key = null;
  if (typeof branchRef === "string") {
    key = normalizeBranchKey(branchRef);
  } else if (typeof branchRef === "object") {
    id = branchRef.id != null ? String(branchRef.id).trim() : null;
    key = normalizeBranchKey(branchRef.key || branchRef.branchKey);
  }
  if (!id && !key) return false;

  return (mode.activeBranches || []).some(
    (b) => (id && b.id === id) || (key && b.key === key)
  );
}

function emptyFailure(status, extras) {
  return {
    ok: false,
    status,
    activeBranchCount: 0,
    websiteMode: WEBSITE_MODE.SINGLE_SITE,
    primaryActiveBranch: null,
    activeBranches: [],
    churchWideContentBranchId: null,
    churchId: null,
    requestedBranchMayHaveIndependentPublicWebsite: false,
    ...extras,
  };
}

/**
 * Resolve website mode from server-trusted church scope.
 *
 * @param {{ query: Function } | null | undefined} db
 * @param {{
 *   churchId: string,
 *   activeBranches?: Array<object>,
 *   branchKey?: string,
 *   branchId?: string,
 *   requestedBranch?: { id?: string, key?: string, branchKey?: string },
 * }} input
 */
async function resolveWebsiteMode(db, input) {
  const churchId = input && input.churchId != null ? String(input.churchId).trim() : "";
  if (!churchId) {
    return emptyFailure(STATUS.INVALID_INPUT);
  }

  let branches;
  if (Array.isArray(input.activeBranches)) {
    // Prefetched list must already be active-only and scoped to this church.
    branches = input.activeBranches.map(mapActiveBranch).filter(Boolean);
  } else {
    if (!db || typeof db.query !== "function") {
      return emptyFailure(STATUS.LOOKUP_ERROR, { churchId });
    }
    try {
      const rows = await repo.listActiveBranchesByChurchId(db, churchId);
      branches = rows.map(mapActiveBranch).filter(Boolean);
    } catch {
      return emptyFailure(STATUS.LOOKUP_ERROR, { churchId });
    }
  }

  const derived = deriveWebsiteMode(branches);
  const requestedRef =
    input.requestedBranch ||
    (input.branchKey || input.branchId
      ? { key: input.branchKey, id: input.branchId }
      : null);

  return {
    ...derived,
    churchId,
    requestedBranchMayHaveIndependentPublicWebsite: branchMayHaveIndependentPublicWebsite(
      derived,
      requestedRef
    ),
  };
}

module.exports = {
  STATUS,
  WEBSITE_MODE,
  mapActiveBranch,
  deriveWebsiteMode,
  branchMayHaveIndependentPublicWebsite,
  resolveWebsiteMode,
};
