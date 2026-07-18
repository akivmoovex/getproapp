"use strict";

/**
 * Read-only platform organization summary by organization_key.
 * Safe catalogue fields only — never UUIDs, passwords, or session data.
 * No process.env. No writes.
 */

const repo = require("../repositories/platformAdminRepository");
const { mapRow } = require("./listPlatformOrganizations");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const ORG_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/**
 * @param {object} row
 */
function mapBranchRow(row) {
  if (!row) return null;
  return {
    key: String(row.branch_key || ""),
    displayName: String(row.display_name || ""),
    branchType: String(row.branch_type || ""),
    status: String(row.status || ""),
    isPrimary: Boolean(row.is_primary),
    countryCode: row.country_code != null ? String(row.country_code) : null,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} organizationKeyRaw
 */
async function getPlatformOrganizationSummary(db, organizationKeyRaw) {
  const organizationKey = String(organizationKeyRaw || "")
    .trim()
    .toLowerCase();
  if (!organizationKey || !ORG_KEY_RE.test(organizationKey)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: "invalid_input",
      organization: null,
      branches: [],
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "database required",
      organization: null,
      branches: [],
    };
  }

  try {
    const row = await repo.findOrganizationDirectoryByKey(db, organizationKey);
    if (!row) {
      return {
        ok: false,
        status: STATUS.NOT_FOUND,
        message: "not_found",
        organization: null,
        branches: [],
      };
    }
    const branchRows = await repo.listBranchesForOrganizationKey(db, organizationKey);
    return {
      ok: true,
      status: STATUS.OK,
      message: STATUS.OK,
      organization: mapRow(row),
      branches: (branchRows || []).map(mapBranchRow).filter(Boolean),
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "lookup_error",
      organization: null,
      branches: [],
    };
  }
}

module.exports = {
  STATUS,
  mapBranchRow,
  getPlatformOrganizationSummary,
};
