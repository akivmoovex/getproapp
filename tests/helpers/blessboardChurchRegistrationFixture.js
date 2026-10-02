"use strict";

/**
 * Canonical BlessBoard church registration application fixture contract.
 *
 * Schema (blessboard/105_registration_branch_name_required.sql) requires
 * platform_church_registration_applications.branch_name NOT NULL.
 * Public registration validation already requires an explicit branch_name;
 * many suites call createApplication() directly and historically omitted it.
 *
 * Prefer this helper over raw repository.createApplication / SQL INSERT so
 * every fixture inherits a deterministic, semantically valid HQ branch name.
 */

const appRepo = require("../../src/blessboard/repositories/platformChurchRegistrationRepository");

/** Matches migration 105 legacy backfill / default HQ campus naming. */
const DEFAULT_HQ_BRANCH_NAME = "Headquarters";

/**
 * @param {object} [fields]
 * @returns {object}
 */
function withRequiredBranchName(fields) {
  const src = fields && typeof fields === "object" ? fields : {};
  const trimmed =
    src.branch_name != null && String(src.branch_name).trim() !== ""
      ? String(src.branch_name).trim()
      : DEFAULT_HQ_BRANCH_NAME;
  return { ...src, branch_name: trimmed };
}

/**
 * @param {import("pg").Pool | { query: Function }} pool
 * @param {object} [fields]
 */
async function createChurchRegistrationApplication(pool, fields) {
  return appRepo.createApplication(pool, withRequiredBranchName(fields));
}

module.exports = {
  DEFAULT_HQ_BRANCH_NAME,
  withRequiredBranchName,
  createChurchRegistrationApplication,
};
