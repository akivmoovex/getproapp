"use strict";

/**
 * Diagnostic BlessBoard catalogue loader (org → church → HQ/primary branch).
 * Runs after platform host context. Observational only — never routes, redirects, or writes.
 */

const { shouldSkipDiagnosticLog } = require("../../platform/http/loadPlatformHostContext");
const {
  getBlessBoardCatalogueContext,
  STATUS: CATALOGUE_STATUS,
} = require("../services/getBlessBoardCatalogueContext");

const RESULT_TYPES = Object.freeze({
  RESOLVED: "resolved",
  NOT_APPLICABLE: "not_applicable",
  PLATFORM_CONTEXT_DISABLED: "platform_context_disabled",
  PLATFORM_NOT_RESOLVED: "platform_not_resolved",
  CHURCH_MISSING: "church_missing",
  CHURCH_INACTIVE: "church_inactive",
  HQ_BRANCH_MISSING: "hq_branch_missing",
  HQ_BRANCH_INACTIVE: "hq_branch_inactive",
  PRIMARY_BRANCH_MISSING: "primary_branch_missing",
  PRIMARY_BRANCH_INACTIVE: "primary_branch_inactive",
  CATALOGUE_LOOKUP_ERROR: "catalogue_lookup_error",
});

const SERVICE_STATUS_TO_RESULT = Object.freeze({
  [CATALOGUE_STATUS.OK]: RESULT_TYPES.RESOLVED,
  [CATALOGUE_STATUS.CHURCH_MISSING]: RESULT_TYPES.CHURCH_MISSING,
  [CATALOGUE_STATUS.CHURCH_INACTIVE]: RESULT_TYPES.CHURCH_INACTIVE,
  [CATALOGUE_STATUS.HQ_BRANCH_MISSING]: RESULT_TYPES.HQ_BRANCH_MISSING,
  [CATALOGUE_STATUS.HQ_BRANCH_INACTIVE]: RESULT_TYPES.HQ_BRANCH_INACTIVE,
  [CATALOGUE_STATUS.PRIMARY_BRANCH_MISSING]: RESULT_TYPES.PRIMARY_BRANCH_MISSING,
  [CATALOGUE_STATUS.PRIMARY_BRANCH_INACTIVE]: RESULT_TYPES.PRIMARY_BRANCH_INACTIVE,
  [CATALOGUE_STATUS.ORGANIZATION_NOT_FOUND]: RESULT_TYPES.CHURCH_MISSING,
  [CATALOGUE_STATUS.LOOKUP_ERROR]: RESULT_TYPES.CATALOGUE_LOOKUP_ERROR,
});

/**
 * @param {object | null | undefined} platformHostContext
 * @returns {{ applicable: boolean, reason: string | null, organizationId: string | null }}
 */
function evaluateApplicability(platformHostContext) {
  const ctx = platformHostContext && typeof platformHostContext === "object" ? platformHostContext : null;
  if (!ctx || !ctx.enabled) {
    return { applicable: false, reason: "platform_context_disabled", organizationId: null };
  }
  if (ctx.resultType !== "resolved_tenant") {
    return { applicable: false, reason: "platform_not_resolved", organizationId: null };
  }
  const resolution = ctx.resolution && typeof ctx.resolution === "object" ? ctx.resolution : null;
  const productKey =
    resolution && resolution.product && resolution.product.key
      ? String(resolution.product.key).trim().toLowerCase()
      : "";
  if (productKey !== "blessboard") {
    return { applicable: false, reason: "not_blessboard_tenant", organizationId: null };
  }
  const rawOrgId =
    resolution && resolution.organization ? resolution.organization.id : null;
  const organizationId =
    rawOrgId != null && String(rawOrgId).trim() !== ""
      ? String(rawOrgId).trim()
      : "";
  if (!organizationId) {
    return { applicable: false, reason: "missing_organization_id", organizationId: null };
  }
  return { applicable: true, reason: null, organizationId };
}

/**
 * @param {object | null} serviceContext
 */
function mapChurch(serviceContext) {
  const church = serviceContext && serviceContext.church;
  if (!church) return null;
  return {
    id: church.id,
    churchKey: church.key,
    displayName: church.displayName,
    status: church.status,
    dataEnvironment: church.dataEnvironment,
  };
}

/**
 * @param {object | null} serviceContext
 */
function mapHqBranch(serviceContext) {
  const branch = serviceContext && serviceContext.hqBranch;
  if (!branch) return null;
  return {
    id: branch.id,
    branchKey: branch.key,
    displayName: branch.displayName,
    status: branch.status,
  };
}

/**
 * @param {object | null} serviceContext
 */
function mapPrimaryBranch(serviceContext) {
  const branch = serviceContext && serviceContext.primaryBranch;
  if (!branch) return null;
  return {
    id: branch.id,
    branchKey: branch.key,
    displayName: branch.displayName,
    status: branch.status,
  };
}

/**
 * Compact diagnostic log for catalogue lookup failures only.
 * @param {import('express').Request} req
 * @param {object} context
 * @param {(line: string) => void} [logFn]
 */
function logBlessBoardCatalogueContextDiagnostic(req, context, logFn) {
  if (shouldSkipDiagnosticLog(req)) return;
  if (!context || context.resultType !== RESULT_TYPES.CATALOGUE_LOOKUP_ERROR) return;
  const platform = req.platformHostContext && req.platformHostContext.resolution;
  const line = JSON.stringify({
    event: "blessboard_catalogue_context",
    hostname: (req.platformHostContext && req.platformHostContext.hostname) || null,
    organizationId: context.organizationId || null,
    organizationKey:
      platform && platform.organization && platform.organization.key
        ? platform.organization.key
        : null,
    churchId: context.church ? context.church.id : null,
    churchKey: context.church ? context.church.churchKey : null,
    hqBranchId: context.hqBranch ? context.hqBranch.id : null,
    hqBranchKey: context.hqBranch ? context.hqBranch.branchKey : null,
    primaryBranchId: context.primaryBranch ? context.primaryBranch.id : null,
    primaryBranchKey: context.primaryBranch ? context.primaryBranch.branchKey : null,
    resultType: context.resultType,
    dataEnvironment: context.church ? context.church.dataEnvironment : null,
    path: String((req && (req.path || req.url)) || "").split("?")[0] || null,
  });
  const out = typeof logFn === "function" ? logFn : (msg) => console.log(msg);
  out(`[blessboard-catalogue-context] ${line}`);
}

/**
 * @param {{
 *   getPool?: () => { query: Function } | null | undefined,
 *   getCatalogueContext?: Function,
 *   log?: (line: string) => void,
 * }} [deps]
 */
function createLoadBlessBoardCatalogueContext(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const getCatalogue =
    options.getCatalogueContext || getBlessBoardCatalogueContext;
  const logFn = options.log;

  return async function loadBlessBoardCatalogueContext(req, res, next) {
    try {
      const applicability = evaluateApplicability(req.platformHostContext);
      if (!applicability.applicable) {
        const disabled = applicability.reason === "platform_context_disabled";
        req.blessBoardCatalogueContext = disabled
          ? {
              enabled: false,
              reason: "platform_context_disabled",
              resultType: RESULT_TYPES.PLATFORM_CONTEXT_DISABLED,
            }
          : {
              enabled: true,
              applicable: false,
              reason: applicability.reason,
              resultType:
                applicability.reason === "platform_not_resolved"
                  ? RESULT_TYPES.PLATFORM_NOT_RESOLVED
                  : RESULT_TYPES.NOT_APPLICABLE,
              organizationId: null,
              church: null,
              hqBranch: null,
              primaryBranch: null,
            };
        return next();
      }

      if (typeof getPool !== "function") {
        throw new Error("blessboard catalogue context requires getPool()");
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        throw new Error("blessboard catalogue context pool is not query-capable");
      }

      const lookup = await getCatalogue(pool, applicability.organizationId);
      const resultType =
        SERVICE_STATUS_TO_RESULT[lookup.status] || RESULT_TYPES.CATALOGUE_LOOKUP_ERROR;
      const serviceContext = lookup.context || null;

      req.blessBoardCatalogueContext = {
        enabled: true,
        applicable: true,
        resultType,
        organizationId: applicability.organizationId,
        church: mapChurch(serviceContext),
        hqBranch: mapHqBranch(serviceContext),
        primaryBranch: mapPrimaryBranch(serviceContext),
      };
      logBlessBoardCatalogueContextDiagnostic(req, req.blessBoardCatalogueContext, logFn);
    } catch {
      req.blessBoardCatalogueContext = {
        enabled: true,
        applicable: true,
        resultType: RESULT_TYPES.CATALOGUE_LOOKUP_ERROR,
        organizationId:
          req.platformHostContext &&
          req.platformHostContext.resolution &&
          req.platformHostContext.resolution.organization
            ? req.platformHostContext.resolution.organization.id || null
            : null,
        church: null,
        hqBranch: null,
        primaryBranch: null,
      };
      logBlessBoardCatalogueContextDiagnostic(req, req.blessBoardCatalogueContext, logFn);
    }

    return next();
  };
}

module.exports = {
  RESULT_TYPES,
  evaluateApplicability,
  createLoadBlessBoardCatalogueContext,
  logBlessBoardCatalogueContextDiagnostic,
};
