"use strict";

/**
 * Evaluate whether a request may receive authoritative BlessBoard tenant content.
 * Pure against already-loaded platform + catalogue contexts. No DB / env reads.
 */

const { buildBlessBoardTenantContext } = require("./buildBlessBoardTenantContext");
const { isTenantPublicSurfacePath } = require("./tenantPublicPaths");
const {
  ALLOWLIST_DECISION,
  decideAuthoritativeHostAllowlist,
} = require("../config/authoritativeHostAllowlist");

const OUTCOME = Object.freeze({
  RENDER_TENANT: "render_tenant",
  FOUNDATION: "foundation",
  NOT_FOUND: "not_found",
  UNAVAILABLE: "unavailable",
  SKIP: "skip",
});

const HTTP_STATUS = Object.freeze({
  [OUTCOME.RENDER_TENANT]: 200,
  [OUTCOME.FOUNDATION]: 200,
  [OUTCOME.NOT_FOUND]: 404,
  [OUTCOME.UNAVAILABLE]: 503,
  [OUTCOME.SKIP]: 200,
});

const NOT_FOUND_REASONS = new Set([
  "unknown_domain",
  "invalid_hostname",
  "inactive_domain",
  "deployment_mismatch",
  "missing_organization",
]);

const UNAVAILABLE_PLATFORM_REASONS = new Set([
  "inactive_product",
  "inactive_organization",
  "inactive_enrolment",
  "inactive_deployment",
  "missing_enrolment",
  "lookup_error",
]);

const UNAVAILABLE_CATALOGUE_REASONS = new Set([
  "church_missing",
  "church_inactive",
  "environment_mismatch",
  "hq_branch_missing",
  "hq_branch_inactive",
  "primary_branch_missing",
  "primary_branch_inactive",
  "catalogue_lookup_error",
]);

/**
 * @param {{
 *   routingMode: 'off'|'shadow'|'authoritative',
 *   isApex: boolean,
 *   path?: string,
 *   platformHostContext?: object | null,
 *   blessBoardCatalogueContext?: object | null,
 *   authoritativeHostAllowlist?: object | null,
 * }} input
 */
function evaluateTenantRoute(input) {
  const mode = input.routingMode || "off";
  const pathOnly = String(input.path || "/").split("?")[0] || "/";

  if (input.isApex) {
    return {
      outcome: OUTCOME.SKIP,
      reason: "apex_host",
      httpStatus: 200,
      tenant: null,
      authoritative: false,
      allowlistDecision: ALLOWLIST_DECISION.N_A,
    };
  }

  if (mode === "off") {
    return {
      outcome: OUTCOME.FOUNDATION,
      reason: "routing_off",
      httpStatus: 200,
      tenant: null,
      authoritative: false,
      allowlistDecision: ALLOWLIST_DECISION.N_A,
    };
  }

  const isPublicPath = isTenantPublicSurfacePath(pathOnly);

  const platform = input.platformHostContext;
  const catalogue = input.blessBoardCatalogueContext;

  if (!platform || !platform.enabled) {
    return fail(mode, "platform_context_disabled", OUTCOME.UNAVAILABLE, isPublicPath);
  }

  const resultType = String(platform.resultType || "");
  if (NOT_FOUND_REASONS.has(resultType)) {
    return fail(mode, resultType, OUTCOME.NOT_FOUND, isPublicPath);
  }
  if (UNAVAILABLE_PLATFORM_REASONS.has(resultType)) {
    return fail(mode, resultType, OUTCOME.UNAVAILABLE, isPublicPath);
  }
  if (resultType === "resolved_apex") {
    return fail(mode, "resolved_apex", OUTCOME.NOT_FOUND, isPublicPath);
  }
  if (resultType !== "resolved_tenant") {
    return fail(mode, resultType || "platform_not_resolved", OUTCOME.NOT_FOUND, isPublicPath);
  }

  const resolution = platform.resolution || null;
  const productKey =
    resolution && resolution.product && resolution.product.key
      ? String(resolution.product.key).toLowerCase()
      : "";
  if (productKey !== "blessboard") {
    return fail(mode, "not_blessboard_tenant", OUTCOME.NOT_FOUND, isPublicPath);
  }

  const productStatus = resolution && resolution.product ? resolution.product.status : null;
  if (productStatus && String(productStatus) !== "active") {
    return fail(mode, "inactive_product", OUTCOME.UNAVAILABLE, isPublicPath);
  }
  const orgStatus = resolution && resolution.organization ? resolution.organization.status : null;
  if (orgStatus && String(orgStatus) !== "active") {
    return fail(mode, "inactive_organization", OUTCOME.UNAVAILABLE, isPublicPath);
  }
  const enrolmentStatus =
    resolution && resolution.organizationProduct ? resolution.organizationProduct.status : null;
  if (enrolmentStatus && String(enrolmentStatus) !== "active") {
    return fail(mode, "inactive_enrolment", OUTCOME.UNAVAILABLE, isPublicPath);
  }

  if (!catalogue || !catalogue.enabled || catalogue.applicable === false) {
    return fail(
      mode,
      (catalogue && catalogue.reason) || "catalogue_not_applicable",
      OUTCOME.UNAVAILABLE,
      isPublicPath
    );
  }

  const catalogueType = String(catalogue.resultType || "");
  if (UNAVAILABLE_CATALOGUE_REASONS.has(catalogueType)) {
    return fail(mode, catalogueType, OUTCOME.UNAVAILABLE, isPublicPath);
  }
  if (catalogueType !== "resolved") {
    return fail(mode, catalogueType || "catalogue_not_resolved", OUTCOME.UNAVAILABLE, isPublicPath);
  }

  const tenant = buildBlessBoardTenantContext({
    organization: resolution && resolution.organization,
    church: catalogue.church,
    hqBranch: catalogue.hqBranch,
    primaryBranch: catalogue.primaryBranch,
  });
  if (!tenant) {
    return fail(mode, "incomplete_tenant_context", OUTCOME.UNAVAILABLE, isPublicPath);
  }

  // Non-public paths: attach tenant for authorization; do not drive public HTML.
  if (!isPublicPath) {
    return {
      outcome: OUTCOME.SKIP,
      reason: "non_tenant_path",
      httpStatus: 200,
      tenant,
      authoritative: false,
      allowlistDecision: ALLOWLIST_DECISION.N_A,
    };
  }

  if (mode === "shadow") {
    return {
      outcome: OUTCOME.FOUNDATION,
      reason: "shadow_match",
      httpStatus: 200,
      tenant,
      authoritative: false,
      allowlistDecision: ALLOWLIST_DECISION.N_A,
    };
  }

  // Authoritative: require pilot allow-list (empty → fail closed; * → estate).
  const hostname =
    (platform && platform.hostname) ||
    (resolution && resolution.domain && resolution.domain.hostname) ||
    null;
  const allowlistDecision = decideAuthoritativeHostAllowlist(
    input.authoritativeHostAllowlist,
    hostname
  );

  if (
    allowlistDecision === ALLOWLIST_DECISION.DENY_EMPTY ||
    allowlistDecision === ALLOWLIST_DECISION.DENY
  ) {
    return {
      outcome: OUTCOME.FOUNDATION,
      reason:
        allowlistDecision === ALLOWLIST_DECISION.DENY_EMPTY
          ? "authoritative_allowlist_empty"
          : "authoritative_host_not_allowlisted",
      httpStatus: 200,
      tenant,
      authoritative: false,
      allowlistDecision,
    };
  }

  return {
    outcome: OUTCOME.RENDER_TENANT,
    reason: "authoritative_match",
    httpStatus: 200,
    tenant,
    authoritative: true,
    allowlistDecision: ALLOWLIST_DECISION.ALLOW,
  };
}

/**
 * @param {string} mode
 * @param {string} reason
 * @param {string} outcome
 * @param {boolean} [isPublicPath=true]
 */
function fail(mode, reason, outcome, isPublicPath) {
  const publicPath = isPublicPath !== false;
  if (!publicPath) {
    return {
      outcome: OUTCOME.SKIP,
      reason,
      httpStatus: 200,
      tenant: null,
      authoritative: false,
      allowlistDecision: ALLOWLIST_DECISION.N_A,
    };
  }
  if (mode === "shadow" || mode === "off") {
    // Shadow: observe but keep foundation response (not error pages).
    return {
      outcome: OUTCOME.FOUNDATION,
      reason,
      httpStatus: 200,
      tenant: null,
      authoritative: false,
      allowlistDecision: ALLOWLIST_DECISION.N_A,
    };
  }
  return {
    outcome,
    reason,
    httpStatus: HTTP_STATUS[outcome] || 503,
    tenant: null,
    authoritative: false,
    allowlistDecision: ALLOWLIST_DECISION.N_A,
  };
}

module.exports = {
  OUTCOME,
  HTTP_STATUS,
  evaluateTenantRoute,
};
