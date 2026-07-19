"use strict";

/**
 * Attach tenant-routing decision + shadow/authoritative logs.
 * Does not send a response — public pages / errors are handled by route handlers.
 */

const { shouldSkipDiagnosticLog } = require("../../platform/http/loadPlatformHostContext");
const {
  getBlessBoardTenantRoutingMode,
  MODE_SHADOW,
  MODE_AUTHORITATIVE,
} = require("../config/tenantRoutingMode");
const { evaluateTenantRoute, OUTCOME } = require("./evaluateTenantRoute");

/**
 * @param {import('express').Request} req
 * @param {object} decision
 * @param {(line: string) => void} [logFn]
 */
function logShadow(req, decision, logFn) {
  if (shouldSkipDiagnosticLog(req)) return;
  const platform = req.platformHostContext || {};
  const catalogue = req.blessBoardCatalogueContext || {};
  const resolution = platform.resolution || {};
  const line = JSON.stringify({
    event: "blessboard_tenant_route_shadow",
    hostname: platform.hostname || null,
    platformResultType: platform.resultType || null,
    catalogueResultType: catalogue.resultType || null,
    proposedRouteOutcome: decision.outcome || null,
    proposedReason: decision.reason || null,
    organizationKey:
      (resolution.organization && resolution.organization.key) ||
      (decision.tenant && decision.tenant.organization && decision.tenant.organization.key) ||
      null,
    churchKey:
      (catalogue.church && catalogue.church.churchKey) ||
      (decision.tenant && decision.tenant.church && decision.tenant.church.key) ||
      null,
    primaryBranchKey:
      (catalogue.primaryBranch && catalogue.primaryBranch.branchKey) ||
      (decision.tenant && decision.tenant.primaryBranch && decision.tenant.primaryBranch.key) ||
      null,
    deploymentComparisonResult: platform.deploymentComparisonAvailable
      ? platform.resultType === "deployment_mismatch"
        ? "mismatch"
        : platform.resultType === "resolved_tenant"
          ? "match"
          : "n/a"
      : "unavailable",
    path: String((req && (req.path || req.url)) || "").split("?")[0] || null,
    requestId: (req && req.requestId) || null,
  });
  const out = typeof logFn === "function" ? logFn : (msg) => console.log(msg);
  out(`[blessboard-tenant-routing] ${line}`);
}

/**
 * @param {import('express').Request} req
 * @param {object} decision
 * @param {(line: string) => void} [logFn]
 */
function logAuthoritative(req, decision, logFn) {
  if (shouldSkipDiagnosticLog(req)) return;
  if (decision.outcome === OUTCOME.SKIP) return;
  const platform = req.platformHostContext || {};
  const line = JSON.stringify({
    event: "blessboard_tenant_route",
    hostname: platform.hostname || null,
    outcome: decision.outcome || null,
    reason: decision.reason || null,
    httpStatus: decision.httpStatus || null,
    churchKey: decision.tenant && decision.tenant.church ? decision.tenant.church.key : null,
    path: String((req && (req.path || req.url)) || "").split("?")[0] || null,
    requestId: (req && req.requestId) || null,
  });
  const out = typeof logFn === "function" ? logFn : (msg) => console.log(msg);
  out(`[blessboard-tenant-routing] ${line}`);
}

/**
 * @param {{
 *   getMode?: () => string,
 *   isApexHost?: (req: import('express').Request) => boolean,
 *   log?: (line: string) => void,
 * }} [deps]
 */
function createBlessBoardTenantRoutingDecision(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getMode = options.getMode || (() => getBlessBoardTenantRoutingMode());
  const isApex =
    options.isApexHost ||
    ((req) => {
      const host = String((req.headers && req.headers.host) || "")
        .toLowerCase()
        .split(":")[0];
      return host === "blessboard.org" || host === "www.blessboard.org" || host === "localhost";
    });
  const logFn = options.log;

  return function blessBoardTenantRoutingDecision(req, res, next) {
    try {
      const mode = getMode();
      const decision = evaluateTenantRoute({
        routingMode: mode,
        isApex: Boolean(isApex(req)),
        path: req.path || req.url,
        platformHostContext: req.platformHostContext,
        blessBoardCatalogueContext: req.blessBoardCatalogueContext,
      });

      req.blessBoardTenantRoute = {
        mode,
        outcome: decision.outcome,
        reason: decision.reason,
        httpStatus: decision.httpStatus,
        authoritative: Boolean(decision.authoritative),
      };

      // Only authoritative mode marks req.blessBoardTenantContext as resolved.
      // Shadow keeps proposedTenant for observational logs / future handoff tests.
      if ((decision.authoritative || mode === MODE_AUTHORITATIVE) && decision.tenant) {
        req.blessBoardTenantContext = decision.tenant;
      } else {
        req.blessBoardTenantContext = {
          resolved: false,
          reason: decision.reason,
        };
      }

      req.blessBoardTenantRoute.proposedTenant = decision.tenant || null;

      if (mode === MODE_SHADOW) {
        logShadow(req, decision, logFn);
      } else if (mode === MODE_AUTHORITATIVE) {
        logAuthoritative(req, decision, logFn);
      }

      return next();
    } catch {
      req.blessBoardTenantRoute = {
        mode: getMode(),
        outcome: OUTCOME.UNAVAILABLE,
        reason: "routing_error",
        httpStatus: 503,
        authoritative: false,
        proposedTenant: null,
      };
      req.blessBoardTenantContext = { resolved: false, reason: "routing_error" };
      return next();
    }
  };
}

module.exports = {
  createBlessBoardTenantRoutingDecision,
  logShadow,
  logAuthoritative,
};
