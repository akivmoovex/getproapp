"use strict";

/**
 * Read-only BlessBoard branch listing / key resolution for HQ shell.
 * No process.env. No writes. Compact DTOs only — never raw rows to callers' templates.
 */

const repo = require("../repositories/blessBoardBranchRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  INACTIVE: "inactive",
  LOOKUP_ERROR: "lookup_error",
});

const BRANCH_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/**
 * @param {object} row
 */
function mapBranch(row) {
  if (!row) return null;
  return {
    key: String(row.branch_key),
    displayName: String(row.display_name || ""),
    branchType: String(row.branch_type || ""),
    isPrimary: Boolean(row.is_primary),
  };
}

/**
 * @param {string | null | undefined} raw
 */
function normalizeBranchKey(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase();
  if (!key || !BRANCH_KEY_RE.test(key)) return null;
  return key;
}

/**
 * @param {{ query: Function }} db
 * @param {string} churchId
 */
async function listBlessBoardBranches(db, churchId) {
  const id = churchId != null ? String(churchId).trim() : "";
  if (!id) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "church_id_required",
      branches: [],
      activeCount: 0,
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "database required",
      branches: [],
      activeCount: 0,
    };
  }

  try {
    const rows = await repo.listActiveBranchesByChurchId(db, id);
    const branches = rows.map(mapBranch).filter(Boolean);
    return {
      ok: true,
      status: STATUS.OK,
      message: STATUS.OK,
      branches,
      activeCount: branches.length,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "lookup_error",
      branches: [],
      activeCount: 0,
    };
  }
}

/**
 * Resolve an active branch for the given church UUID + branch key.
 * Returns compact DTO including id for authorization only (not for templates).
 * @param {{ query: Function }} db
 * @param {string} churchId
 * @param {string} branchKeyRaw
 */
async function resolveBlessBoardBranchForChurch(db, churchId, branchKeyRaw) {
  const id = churchId != null ? String(churchId).trim() : "";
  const branchKey = normalizeBranchKey(branchKeyRaw);
  if (!id || !branchKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input", branch: null };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "database required", branch: null };
  }

  try {
    const row = await repo.findBranchByChurchIdAndKey(db, id, branchKey);
    if (!row) {
      return { ok: false, status: STATUS.NOT_FOUND, message: "not_found", branch: null };
    }
    if (String(row.church_id) !== id) {
      return { ok: false, status: STATUS.NOT_FOUND, message: "not_found", branch: null };
    }
    if (String(row.status) !== "active") {
      return { ok: false, status: STATUS.INACTIVE, message: "inactive", branch: null };
    }
    return {
      ok: true,
      status: STATUS.OK,
      message: STATUS.OK,
      branch: {
        id: String(row.id),
        key: String(row.branch_key),
        displayName: String(row.display_name || ""),
        branchType: String(row.branch_type || ""),
        status: String(row.status || ""),
        isPrimary: Boolean(row.is_primary),
      },
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error", branch: null };
  }
}

module.exports = {
  STATUS,
  normalizeBranchKey,
  mapBranch,
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
};
