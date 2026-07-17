"use strict";

/**
 * Read-only observational comparison of platform host context vs legacy routing.
 * Never mutates platform/legacy context, never queries DB, always fail-open.
 */

const { shouldSkipDiagnosticLog } = require("./loadPlatformHostContext");
const { getPlatformHostContextMode, MODE_DIAGNOSTIC } = require("../config/platformHostContextMode");

const COMPARISON_CATEGORIES = Object.freeze({
  MATCH: "match",
  LEGACY_ONLY: "legacy_only",
  PLATFORM_ONLY: "platform_only",
  IDENTITY_MISMATCH: "identity_mismatch",
  PRODUCT_MISMATCH: "product_mismatch",
  NOT_COMPARABLE: "not_comparable",
});

const INACTIVE_OR_UNRESOLVED_PLATFORM = new Set([
  "inactive_domain",
  "inactive_deployment",
  "inactive_product",
  "inactive_organization",
  "inactive_enrolment",
  "missing_enrolment",
  "missing_organization",
  "deployment_mismatch",
  "unknown_domain",
  "invalid_hostname",
  "lookup_error",
  "resolved_apex",
]);

/**
 * Stable legacy tenant key + product hint from request (no display names).
 * Prefer orgSlug / tenant slug — platform organization UUIDs are not on legacy req yet.
 *
 * @param {import('express').Request} req
 * @returns {{ kind: string, tenantKey: string | null, productHint: string | null }}
 */
function extractLegacyTenantIdentity(req) {
  if (req && req.isChurchHost && req.churchContext) {
    const ctx = req.churchContext;
    if (ctx.kind === "vertical-apex") {
      return { kind: "apex", tenantKey: null, productHint: "blessboard" };
    }
    const fromOrg =
      ctx.organization && ctx.organization.slug != null
        ? String(ctx.organization.slug).trim().toLowerCase()
        : "";
    const fromSlug = ctx.orgSlug != null ? String(ctx.orgSlug).trim().toLowerCase() : "";
    const fromHost = ctx.hostSlug != null ? String(ctx.hostSlug).trim().toLowerCase() : "";
    const tenantKey = fromOrg || fromSlug || fromHost || null;
    if (tenantKey) {
      return { kind: "tenant", tenantKey, productHint: "blessboard" };
    }
    return { kind: "church_unresolved", tenantKey: null, productHint: "blessboard" };
  }

  if (req && req.tenant && req.tenant.slug) {
    const tenantKey = String(req.tenant.slug).trim().toLowerCase();
    if (tenantKey) {
      return { kind: "tenant", tenantKey, productHint: "getpro" };
    }
  }
  if (req && req.tenantSlug) {
    const tenantKey = String(req.tenantSlug).trim().toLowerCase();
    if (tenantKey) {
      return { kind: "tenant", tenantKey, productHint: "getpro" };
    }
  }

  return { kind: "none", tenantKey: null, productHint: null };
}

/**
 * @param {object | null | undefined} platformHostContext
 * @param {{ kind: string, tenantKey: string | null, productHint: string | null }} legacy
 */
function comparePlatformAndLegacy(platformHostContext, legacy) {
  const ctx = platformHostContext && typeof platformHostContext === "object" ? platformHostContext : null;
  if (!ctx || !ctx.enabled) {
    return {
      category: COMPARISON_CATEGORIES.NOT_COMPARABLE,
      platformResultType: null,
      platformOrganizationKey: null,
      platformProductKey: null,
      legacyTenantKey: legacy.tenantKey,
      legacyProductHint: legacy.productHint,
      expectedDeploymentCode: null,
      resolvedDeploymentCode: null,
    };
  }

  const resultType = ctx.resultType || null;
  const resolution = ctx.resolution;
  const platformOrgKey =
    resolution && resolution.organization && resolution.organization.key
      ? String(resolution.organization.key).trim().toLowerCase()
      : null;
  const platformProductKey =
    resolution && resolution.product && resolution.product.key
      ? String(resolution.product.key).trim().toLowerCase()
      : null;
  const resolvedDeploymentCode =
    resolution && resolution.deployment && resolution.deployment.code
      ? resolution.deployment.code
      : null;

  const base = {
    platformResultType: resultType,
    platformOrganizationKey: platformOrgKey,
    platformProductKey: platformProductKey,
    legacyTenantKey: legacy.tenantKey,
    legacyProductHint: legacy.productHint,
    expectedDeploymentCode: ctx.expectedDeploymentCode || null,
    resolvedDeploymentCode,
  };

  if (legacy.kind === "apex" || resultType === "resolved_apex") {
    return { category: COMPARISON_CATEGORIES.NOT_COMPARABLE, ...base };
  }
  if (INACTIVE_OR_UNRESOLVED_PLATFORM.has(String(resultType || ""))) {
    if (legacy.tenantKey && resultType !== "resolved_tenant") {
      // Platform has no active tenant identity; legacy does.
      if (
        resultType === "unknown_domain" ||
        resultType === "invalid_hostname" ||
        resultType === "lookup_error" ||
        resultType === "missing_organization" ||
        resultType === "missing_enrolment" ||
        String(resultType || "").startsWith("inactive_")
      ) {
        return { category: COMPARISON_CATEGORIES.LEGACY_ONLY, ...base };
      }
    }
    return { category: COMPARISON_CATEGORIES.NOT_COMPARABLE, ...base };
  }

  if (resultType === "resolved_tenant" && platformOrgKey) {
    if (legacy.tenantKey) {
      if (legacy.productHint && platformProductKey && legacy.productHint !== platformProductKey) {
        return { category: COMPARISON_CATEGORIES.PRODUCT_MISMATCH, ...base };
      }
      if (legacy.tenantKey === platformOrgKey) {
        return { category: COMPARISON_CATEGORIES.MATCH, ...base };
      }
      return { category: COMPARISON_CATEGORIES.IDENTITY_MISMATCH, ...base };
    }
    return { category: COMPARISON_CATEGORIES.PLATFORM_ONLY, ...base };
  }

  if (legacy.tenantKey && !platformOrgKey) {
    return { category: COMPARISON_CATEGORIES.LEGACY_ONLY, ...base };
  }

  return { category: COMPARISON_CATEGORIES.NOT_COMPARABLE, ...base };
}

/**
 * @param {import('express').Request} req
 * @param {object} comparison
 * @param {(line: string) => void} [logFn]
 */
function logPlatformHostComparison(req, comparison, logFn) {
  if (shouldSkipDiagnosticLog(req)) return;
  const line = JSON.stringify({
    event: "platform_host_comparison",
    hostname: (req.platformHostContext && req.platformHostContext.hostname) || null,
    platformResultType: comparison.platformResultType || null,
    comparisonCategory: comparison.category || null,
    expectedDeploymentCode: comparison.expectedDeploymentCode || null,
    resolvedDeploymentCode: comparison.resolvedDeploymentCode || null,
    platformProductKey: comparison.platformProductKey || null,
    platformOrganizationKey: comparison.platformOrganizationKey || null,
    legacyTenantKey: comparison.legacyTenantKey || null,
    dataEnvironment:
      req.platformHostContext &&
      req.platformHostContext.resolution &&
      req.platformHostContext.resolution.organization
        ? req.platformHostContext.resolution.organization.dataEnvironment
        : null,
    path: String((req && (req.path || req.url)) || "").split("?")[0] || null,
  });
  const out = typeof logFn === "function" ? logFn : (msg) => console.log(msg);
  out(`[platform-host-comparison] ${line}`);
}

/**
 * @param {{
 *   getMode?: () => string,
 *   log?: (line: string) => void,
 * }} [deps]
 */
function createCompareLegacyHostContext(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getMode = options.getMode || getPlatformHostContextMode;
  const logFn = options.log;

  return function compareLegacyHostContext(req, res, next) {
    try {
      if (getMode() !== MODE_DIAGNOSTIC) {
        return next();
      }
      if (!req.platformHostContext || !req.platformHostContext.enabled) {
        return next();
      }

      const legacy = extractLegacyTenantIdentity(req);
      const comparison = comparePlatformAndLegacy(req.platformHostContext, legacy);
      req.platformHostComparison = comparison;
      logPlatformHostComparison(req, comparison, logFn);
    } catch {
      // Fail-open: never block legacy routing.
      try {
        req.platformHostComparison = {
          category: COMPARISON_CATEGORIES.NOT_COMPARABLE,
          platformResultType:
            req.platformHostContext && req.platformHostContext.resultType
              ? req.platformHostContext.resultType
              : null,
          platformOrganizationKey: null,
          platformProductKey: null,
          legacyTenantKey: null,
          legacyProductHint: null,
          expectedDeploymentCode: null,
          resolvedDeploymentCode: null,
        };
      } catch {
        /* ignore */
      }
    }
    return next();
  };
}

module.exports = {
  COMPARISON_CATEGORIES,
  extractLegacyTenantIdentity,
  comparePlatformAndLegacy,
  createCompareLegacyHostContext,
  logPlatformHostComparison,
};
