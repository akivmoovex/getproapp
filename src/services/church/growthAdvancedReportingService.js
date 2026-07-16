"use strict";

/**
 * Growth advanced reporting helpers: saved filters (entitlement-gated).
 * Cross-branch aggregates live in crossBranchComparisonService.
 * Scheduled runs live in scheduledReportService.
 */

const savedReportFiltersRepo = require("../../db/pg/church/savedReportFiltersRepo");
const { validateSavedFilterBody } = require("../../church/growthAdvancedReportingValidation");
const { hasEntitlement, getOrganisationPlan } = require("./churchEntitlementService");
const crossBranchComparisonService = require("./crossBranchComparisonService");

const REPORTING_ERRORS = Object.freeze({
  PACKAGE_REQUIRED: "PACKAGE_REQUIRED",
  VALIDATION: "VALIDATION",
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
});

function makeError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

async function assertGrowthReporting(pool, organizationId) {
  const plan = await getOrganisationPlan(pool, organizationId);
  if (!plan || !hasEntitlement(plan, "reports.cross_branch")) {
    throw makeError(REPORTING_ERRORS.PACKAGE_REQUIRED, "Advanced reporting requires Growth.");
  }
  return plan;
}

async function saveFilter(pool, ctx, body) {
  await assertGrowthReporting(pool, ctx.organization_id);
  const validation = validateSavedFilterBody(body);
  if (!validation.ok) {
    throw makeError(REPORTING_ERRORS.VALIDATION, validation.error);
  }
  if (validation.data.surface === "cross_branch") {
    await crossBranchComparisonService.assertCrossBranchAccess(pool, ctx.organization_id);
  }
  return savedReportFiltersRepo.insertSavedFilter(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id || null,
    surface: validation.data.surface,
    name: validation.data.name,
    filters_json: validation.data.filters_json,
    created_by_actor_type: ctx.actor_type || "hq_admin",
    created_by_actor_id: ctx.actor_id || null,
  });
}

async function listFilters(pool, ctx, opts = {}) {
  await assertGrowthReporting(pool, ctx.organization_id);
  return savedReportFiltersRepo.listSavedFiltersForOrg(pool, ctx.organization_id, {
    surface: opts.surface || "cross_branch",
    branchId: ctx.branch_id || null,
    limit: opts.limit,
  });
}

async function applySavedFilter(pool, ctx, filterId) {
  await assertGrowthReporting(pool, ctx.organization_id);
  const row = await savedReportFiltersRepo.findSavedFilterByIdForOrg(
    pool,
    filterId,
    ctx.organization_id
  );
  if (!row) throw makeError(REPORTING_ERRORS.NOT_FOUND, "Saved filter not found.");
  if (row.surface === "cross_branch") {
    await crossBranchComparisonService.assertCrossBranchAccess(pool, ctx.organization_id);
  }
  const filters = crossBranchComparisonService.parseFilters(row.filters_json || {});
  return { savedFilter: row, filters };
}

async function deleteFilter(pool, ctx, filterId) {
  await assertGrowthReporting(pool, ctx.organization_id);
  const ok = await savedReportFiltersRepo.deleteSavedFilterForOrg(
    pool,
    filterId,
    ctx.organization_id
  );
  if (!ok) throw makeError(REPORTING_ERRORS.NOT_FOUND, "Saved filter not found.");
  return true;
}

module.exports = {
  REPORTING_ERRORS,
  assertGrowthReporting,
  saveFilter,
  listFilters,
  applySavedFilter,
  deleteFilter,
};
