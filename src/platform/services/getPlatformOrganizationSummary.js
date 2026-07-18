"use strict";

/**
 * Read-only platform organization summary by organization_key.
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
 * @param {{ query: Function }} db
 * @param {string} organizationKeyRaw
 */
async function getPlatformOrganizationSummary(db, organizationKeyRaw) {
  const organizationKey = String(organizationKeyRaw || "")
    .trim()
    .toLowerCase();
  if (!organizationKey || !ORG_KEY_RE.test(organizationKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_input", organization: null };
  }
  if (!db || typeof db.query !== "function") {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "database required", organization: null };
  }

  try {
    const row = await repo.findOrganizationDirectoryByKey(db, organizationKey);
    if (!row) {
      return { ok: false, status: STATUS.NOT_FOUND, message: "not_found", organization: null };
    }
    return {
      ok: true,
      status: STATUS.OK,
      message: STATUS.OK,
      organization: mapRow(row),
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error", organization: null };
  }
}

module.exports = {
  STATUS,
  getPlatformOrganizationSummary,
};
