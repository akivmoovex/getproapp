"use strict";

/**
 * Read-only observational comparison of platform host context vs legacy routing.
 * Never mutates platform/legacy context, never queries DB, always fail-open.
 *
 * Preferred identity order when UUIDs are available on both sides:
 * 1 organization UUID
 * 2 BlessBoard church UUID
 * 3 product + normalized organization key (temporary)
 * 4 not_comparable
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

const COMPARISON_BASIS = Object.freeze({
  ORGANIZATION_UUID: "organization_uuid",
  CHURCH_UUID: "church_uuid",
  PRODUCT_AND_KEY: "product_and_key",
  NONE: "none",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * @param {unknown} value
 * @returns {string | null}
 */
function asUuid(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!UUID_RE.test(s)) return null;
  return s.toLowerCase();
}

/**
 * Stable legacy tenant identity from request (no display names).
 * Platform organization / church UUIDs are optional until legacy context carries them.
 *
 * @param {import('express').Request} req
 * @returns {{
 *   kind: string,
 *   tenantKey: string | null,
 *   productHint: string | null,
 *   organizationId: string | null,
 *   churchId: string | null
 * }}
 */
function extractLegacyTenantIdentity(req) {
  const empty = {
    kind: "none",
    tenantKey: null,
    productHint: null,
    organizationId: null,
    churchId: null,
  };

  if (req && req.isChurchHost && req.churchContext) {
    const ctx = req.churchContext;
    if (ctx.kind === "vertical-apex") {
      return {
        kind: "apex",
        tenantKey: null,
        productHint: "blessboard",
        organizationId: null,
        churchId: null,
      };
    }
    const fromOrg =
      ctx.organization && ctx.organization.slug != null
        ? String(ctx.organization.slug).trim().toLowerCase()
        : "";
    const fromSlug = ctx.orgSlug != null ? String(ctx.orgSlug).trim().toLowerCase() : "";
    const fromHost = ctx.hostSlug != null ? String(ctx.hostSlug).trim().toLowerCase() : "";
    const tenantKey = fromOrg || fromSlug || fromHost || null;

    const organizationId =
      asUuid(ctx.platformOrganizationId) ||
      asUuid(ctx.organization && ctx.organization.platformOrganizationId) ||
      asUuid(ctx.organization && ctx.organization.platform_organization_id) ||
      asUuid(ctx.organization && ctx.organization.id) ||
      null;
    const churchId =
      asUuid(ctx.churchId) ||
      asUuid(ctx.church && ctx.church.id) ||
      asUuid(ctx.organization && ctx.organization.churchId) ||
      null;

    if (tenantKey || organizationId || churchId) {
      return {
        kind: "tenant",
        tenantKey,
        productHint: "blessboard",
        organizationId,
        churchId,
      };
    }
    return {
      kind: "church_unresolved",
      tenantKey: null,
      productHint: "blessboard",
      organizationId: null,
      churchId: null,
    };
  }

  if (req && req.tenant && req.tenant.slug) {
    const tenantKey = String(req.tenant.slug).trim().toLowerCase();
    if (tenantKey) {
      return {
        kind: "tenant",
        tenantKey,
        productHint: "getpro",
        organizationId: asUuid(req.tenant.platformOrganizationId) || asUuid(req.tenant.id),
        churchId: null,
      };
    }
  }
  if (req && req.tenantSlug) {
    const tenantKey = String(req.tenantSlug).trim().toLowerCase();
    if (tenantKey) {
      return {
        kind: "tenant",
        tenantKey,
        productHint: "getpro",
        organizationId: null,
        churchId: null,
      };
    }
  }

  return empty;
}

/**
 * @param {object | null | undefined} platformHostContext
 * @param {{
 *   kind: string,
 *   tenantKey: string | null,
 *   productHint: string | null,
 *   organizationId?: string | null,
 *   churchId?: string | null
 * }} legacy
 * @param {object | null | undefined} [blessBoardCatalogueContext]
 */
function comparePlatformAndLegacy(platformHostContext, legacy, blessBoardCatalogueContext) {
  const ctx = platformHostContext && typeof platformHostContext === "object" ? platformHostContext : null;
  const catalogue =
    blessBoardCatalogueContext && typeof blessBoardCatalogueContext === "object"
      ? blessBoardCatalogueContext
      : null;

  if (!ctx || !ctx.enabled) {
    return {
      category: COMPARISON_CATEGORIES.NOT_COMPARABLE,
      comparisonBasis: COMPARISON_BASIS.NONE,
      platformResultType: null,
      platformOrganizationKey: null,
      platformOrganizationId: null,
      platformChurchId: null,
      platformProductKey: null,
      legacyTenantKey: legacy.tenantKey,
      legacyProductHint: legacy.productHint,
      legacyOrganizationId: legacy.organizationId || null,
      legacyChurchId: legacy.churchId || null,
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
  const platformOrganizationId =
    asUuid(resolution && resolution.organization && resolution.organization.id) ||
    asUuid(catalogue && catalogue.organizationId) ||
    null;
  const platformChurchId =
    asUuid(catalogue && catalogue.church && catalogue.church.id) || null;
  const platformProductKey =
    resolution && resolution.product && resolution.product.key
      ? String(resolution.product.key).trim().toLowerCase()
      : null;
  const resolvedDeploymentCode =
    resolution && resolution.deployment && resolution.deployment.code
      ? resolution.deployment.code
      : null;

  const legacyOrganizationId = asUuid(legacy.organizationId) || null;
  const legacyChurchId = asUuid(legacy.churchId) || null;

  const base = {
    platformResultType: resultType,
    platformOrganizationKey: platformOrgKey,
    platformOrganizationId,
    platformChurchId,
    platformProductKey: platformProductKey,
    legacyTenantKey: legacy.tenantKey,
    legacyProductHint: legacy.productHint,
    legacyOrganizationId,
    legacyChurchId,
    expectedDeploymentCode: ctx.expectedDeploymentCode || null,
    resolvedDeploymentCode,
    comparisonBasis: COMPARISON_BASIS.NONE,
  };

  if (legacy.kind === "apex" || resultType === "resolved_apex") {
    return { category: COMPARISON_CATEGORIES.NOT_COMPARABLE, ...base };
  }
  if (INACTIVE_OR_UNRESOLVED_PLATFORM.has(String(resultType || ""))) {
    if (legacy.tenantKey && resultType !== "resolved_tenant") {
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

  if (resultType === "resolved_tenant") {
    const hasLegacyIdentity = Boolean(
      legacy.tenantKey || legacyOrganizationId || legacyChurchId
    );

    if (platformOrganizationId && legacyOrganizationId) {
      if (platformOrganizationId === legacyOrganizationId) {
        if (legacy.productHint && platformProductKey && legacy.productHint !== platformProductKey) {
          return {
            category: COMPARISON_CATEGORIES.PRODUCT_MISMATCH,
            ...base,
            comparisonBasis: COMPARISON_BASIS.ORGANIZATION_UUID,
          };
        }
        return {
          category: COMPARISON_CATEGORIES.MATCH,
          ...base,
          comparisonBasis: COMPARISON_BASIS.ORGANIZATION_UUID,
        };
      }
      return {
        category: COMPARISON_CATEGORIES.IDENTITY_MISMATCH,
        ...base,
        comparisonBasis: COMPARISON_BASIS.ORGANIZATION_UUID,
      };
    }

    if (platformChurchId && legacyChurchId) {
      if (platformChurchId === legacyChurchId) {
        if (legacy.productHint && platformProductKey && legacy.productHint !== platformProductKey) {
          return {
            category: COMPARISON_CATEGORIES.PRODUCT_MISMATCH,
            ...base,
            comparisonBasis: COMPARISON_BASIS.CHURCH_UUID,
          };
        }
        return {
          category: COMPARISON_CATEGORIES.MATCH,
          ...base,
          comparisonBasis: COMPARISON_BASIS.CHURCH_UUID,
        };
      }
      return {
        category: COMPARISON_CATEGORIES.IDENTITY_MISMATCH,
        ...base,
        comparisonBasis: COMPARISON_BASIS.CHURCH_UUID,
      };
    }

    if (platformOrgKey && legacy.tenantKey) {
      if (legacy.productHint && platformProductKey && legacy.productHint !== platformProductKey) {
        return {
          category: COMPARISON_CATEGORIES.PRODUCT_MISMATCH,
          ...base,
          comparisonBasis: COMPARISON_BASIS.PRODUCT_AND_KEY,
        };
      }
      if (legacy.tenantKey === platformOrgKey) {
        return {
          category: COMPARISON_CATEGORIES.MATCH,
          ...base,
          comparisonBasis: COMPARISON_BASIS.PRODUCT_AND_KEY,
        };
      }
      return {
        category: COMPARISON_CATEGORIES.IDENTITY_MISMATCH,
        ...base,
        comparisonBasis: COMPARISON_BASIS.PRODUCT_AND_KEY,
      };
    }

    if (hasLegacyIdentity && !platformOrgKey && !platformOrganizationId) {
      return { category: COMPARISON_CATEGORIES.LEGACY_ONLY, ...base };
    }
    if (!hasLegacyIdentity && (platformOrgKey || platformOrganizationId)) {
      return { category: COMPARISON_CATEGORIES.PLATFORM_ONLY, ...base };
    }
  }

  if (legacy.tenantKey && !platformOrgKey && !platformOrganizationId) {
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
  const catalogue = req.blessBoardCatalogueContext || null;
  // Keys / codes only — omit UUIDs from console diagnostics.
  const line = JSON.stringify({
    event: "platform_host_comparison",
    hostname: (req.platformHostContext && req.platformHostContext.hostname) || null,
    platformResultType: comparison.platformResultType || null,
    comparisonCategory: comparison.category || null,
    comparisonBasis: comparison.comparisonBasis || COMPARISON_BASIS.NONE,
    expectedDeploymentCode: comparison.expectedDeploymentCode || null,
    resolvedDeploymentCode: comparison.resolvedDeploymentCode || null,
    platformProductKey: comparison.platformProductKey || null,
    platformOrganizationKey: comparison.platformOrganizationKey || null,
    legacyTenantKey: comparison.legacyTenantKey || null,
    blessBoardCatalogueResultType: catalogue && catalogue.resultType ? catalogue.resultType : null,
    churchKey: catalogue && catalogue.church ? catalogue.church.churchKey : null,
    hqBranchKey: catalogue && catalogue.hqBranch ? catalogue.hqBranch.branchKey : null,
    primaryBranchKey:
      catalogue && catalogue.primaryBranch ? catalogue.primaryBranch.branchKey : null,
    dataEnvironment:
      (catalogue && catalogue.church && catalogue.church.dataEnvironment) ||
      (req.platformHostContext &&
      req.platformHostContext.resolution &&
      req.platformHostContext.resolution.organization
        ? req.platformHostContext.resolution.organization.dataEnvironment
        : null),
    path: String((req && (req.path || req.url)) || "").split("?")[0] || null,
    requestId: (req && req.requestId) || null,
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
      const comparison = comparePlatformAndLegacy(
        req.platformHostContext,
        legacy,
        req.blessBoardCatalogueContext
      );
      req.platformHostComparison = comparison;
      logPlatformHostComparison(req, comparison, logFn);
    } catch {
      // Fail-open: never block legacy routing.
      try {
        req.platformHostComparison = {
          category: COMPARISON_CATEGORIES.NOT_COMPARABLE,
          comparisonBasis: COMPARISON_BASIS.NONE,
          platformResultType:
            req.platformHostContext && req.platformHostContext.resultType
              ? req.platformHostContext.resultType
              : null,
          platformOrganizationKey: null,
          platformOrganizationId: null,
          platformChurchId: null,
          platformProductKey: null,
          legacyTenantKey: null,
          legacyProductHint: null,
          legacyOrganizationId: null,
          legacyChurchId: null,
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
  COMPARISON_BASIS,
  extractLegacyTenantIdentity,
  comparePlatformAndLegacy,
  createCompareLegacyHostContext,
  logPlatformHostComparison,
};
