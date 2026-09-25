"use strict";

/**
 * V8 automated test suite manifest.
 * All suites use Node.js built-in `node --test` (same framework as V7).
 * Destructive tests must use disposable foundation fixtures only — never hosted V7 data.
 */

const path = require("path");

const ROOT = path.resolve(__dirname, "../..");

/** @typedef {{ id: string, title: string, description: string, files: string[], concurrency?: number }} Suite */

/** Shared-platform unit + security + integration (fast, mostly no DB or disposable DB). */
const SHARED_PLATFORM = Object.freeze({
  id: "shared-platform",
  title: "Shared platform (unit / security / integration)",
  description:
    "Hostname resolution, deployment profiles, sessions, env validation, and platform HTTP context.",
  concurrency: 1,
  files: Object.freeze([
    "tests/deployment-profiles.test.js",
    "tests/platform-hostname-resolution.test.js",
    "tests/platform-host-context-middleware.test.js",
    "tests/platform-host-comparison.test.js",
    "tests/platform-deployment-code-string.test.js",
    "tests/v5-environment-validation.test.js",
    "tests/v5-foundation-startup.test.js",
    "tests/v5-logging-sensitive-data.test.js",
    "tests/platform-v5-sessions.test.js",
    "tests/v7-runtime-env-isolation.test.js",
    "tests/v8-shared-module-coverage.test.js",
    "tests/v8-bug002-hostinger-upstream-503.test.js",
    "tests/v8-p0-503-diagnosis.test.js",
    "tests/v8-deployment-profile.test.js",
    "tests/v8-hostinger-env-profile-conflict.test.js",
    "tests/v8-about-version-2.test.js",
    "tests/v8-qa-homepage-v2-only.test.js",
    "tests/v2-01-release-notes-center.test.js",
    "tests/v8-shared-media-resolution.test.js",
    "tests/v8-shared-auth-password-security.test.js",
    "tests/v8-shared-verification.test.js",
    "tests/v8-shared-session-security.test.js",
    "tests/v8-shared-rbac-tenant-isolation.test.js",
    "tests/v8-shared-website-sections.test.js",
    "tests/v8-shared-website-lifecycle.test.js",
    "tests/v8-shared-validation.test.js",
    "tests/v8-shared-audit-logging.test.js",
    "tests/shared-website-section-lifecycle.test.js",
  ]),
});

/** V7/V8 database + schema + migration contract + tenant/product isolation. */
const COMPATIBILITY = Object.freeze({
  id: "compatibility",
  title: "V7/V8 database & isolation compatibility",
  description:
    "Shared-DB contract, migration idempotency, runtime schema gate, tenant isolation, V8 env isolation.",
  concurrency: 1,
  files: Object.freeze([
    "tests/v8-db-compatibility-baseline.test.js",
    "tests/v8-migration-contract.test.js",
    "tests/v8-environment-isolation.test.js",
    "tests/v8-bug002-hostinger-upstream-503.test.js",
    "tests/v8-p0-503-diagnosis.test.js",
    "tests/v8-deployment-profile.test.js",
    "tests/v8-hostinger-env-profile-conflict.test.js",
    "tests/v8-about-version-2.test.js",
    "tests/v8-qa-homepage-v2-only.test.js",
    "tests/v2-01-release-notes-center.test.js",
    "tests/v8-shared-media-resolution.test.js",
    "tests/v7-runtime-schema-compatibility.test.js",
    "tests/v7-migrate-identity-gate.test.js",
    "tests/v7-tenant-isolation-security.test.js",
    "tests/activeclinic-product-isolation.test.js",
    "tests/v8-tenant-product-isolation.test.js",
    "tests/v8-shared-module-coverage.test.js",
    "tests/v8-shared-auth-password-security.test.js",
    "tests/v8-shared-verification.test.js",
    "tests/v8-shared-session-security.test.js",
    "tests/v8-shared-rbac-tenant-isolation.test.js",
    "tests/v8-shared-website-sections.test.js",
    "tests/v8-shared-website-lifecycle.test.js",
    "tests/v8-shared-validation.test.js",
    "tests/v8-shared-audit-logging.test.js",
    "tests/shared-website-section-lifecycle.test.js",
  ]),
});

/** BlessBoard regression gate used by V8 (composes curated node:test files). */
const BLESSBOARD = Object.freeze({
  id: "blessboard",
  title: "BlessBoard regression (V8 gate)",
  description:
    "Auth, authorization, tenant routing, and static structure — disposable local fixtures only.",
  concurrency: 1,
  files: Object.freeze([
    "tests/blessboard-v5-fixtures.test.js",
    "tests/blessboard-design-system.test.js",
    "tests/blessboard-apex-auth-gui.test.js",
    "tests/blessboard-v5-a11y-structure.test.js",
    "tests/blessboard-v5-responsive-structure.test.js",
    "tests/blessboard-v5-frontend-assets.test.js",
    "tests/blessboard-v5-server-query-audit.test.js",
    "tests/blessboard-v5-route-link-audit.test.js",
    "tests/blessboard-v5-csrf-action-audit.test.js",
    "tests/blessboard-v5-input-output-safety.test.js",
    "tests/blessboard-tenant-routing-mode.test.js",
    "tests/blessboard-auth-schema.test.js",
    "tests/blessboard-authorization.test.js",
    "tests/blessboard-authoritative-host-allowlist.test.js",
  ]),
});

/** ActiveClinic curated V7 regression files (same list as automated AC gate). */
const ACTIVECLINIC = Object.freeze({
  id: "activeclinic",
  title: "ActiveClinic regression (V8 gate)",
  description:
    "Auth, registration identity, editor contracts, catalogue, and website availability.",
  concurrency: 1,
  files: Object.freeze([
    "tests/v5-session-auth-intermittent.test.js",
    "tests/activeclinic-phone-standardization.test.js",
    "tests/activeclinic-qa-wave1-defects.test.js",
    "tests/activeclinic-account-lifecycle.test.js",
    "tests/activeclinic-registration-identity-idempotency.test.js",
    "tests/activeclinic-authentication-foundation.test.js",
    "tests/v7-phone-login-tab-http.test.js",
    "tests/v7-website-public-catalogue.test.js",
    "tests/v7-ac-qa-wave2-media-unit.test.js",
    "tests/v7-website-image-management.test.js",
    "tests/activeclinic-editor-client-contracts.test.js",
    "tests/v7-shared-website-editor.test.js",
    "tests/v7-new-clinic-operational-readiness.test.js",
    "tests/activeclinic-clinic-website-availability.test.js",
  ]),
});

/** Modules that must meet ≥90% line coverage when measuring the V8 gate. */
const COVERAGE_TARGETS = Object.freeze([
  "src/platform/schema/v8DbCompatibilityContract.js",
  "src/platform/config/v8DeploymentIsolation.js",
  "src/platform/ops/hostingerUpstreamProbe.js",
  "src/platform/config/v8HostingerEnvCompat.js",
  "src/platform/build/applicationBuildInfo.js",
  "src/platform/media/cdnMediaPresentation.js",
  "src/platform/media/platformMarketingAssets.js",
  "src/platform/http/platformRequestContext.js",
  "src/platform/config/canonicalHostRegistry.js",
  "src/platform/session/v5SessionCookie.js",
  "src/platform/auth/sharedPasswordPolicy.js",
  "src/platform/verification/sharedVerificationPolicy.js",
  "src/platform/verification/sharedVerificationService.js",
  "src/platform/session/sharedSessionSecurity.js",
  "src/platform/session/terminateV5BrowserSession.js",
  "src/platform/rbac/sharedTenantScope.js",
  "src/platform/rbac/sharedAuthzDecision.js",
  "src/platform/rbac/sharedRbacFacade.js",
  "src/platform/website/sections/sectionValidation.js",
  "src/platform/website/sections/sectionOrdering.js",
  "src/platform/website/sections/sectionManagementService.js",
  "src/platform/website/v7CompatibleWebsitePublish.js",
  "src/platform/validation/sharedFieldValidators.js",
  "src/platform/http/sharedApiError.js",
  "src/platform/audit/sharedAuditCatalog.js",
  "src/platform/audit/sharedAuditLogging.js",
]);

const COVERAGE_LINE_THRESHOLD = 90;

/** @type {Readonly<Record<string, Suite>>} */
const SUITES = Object.freeze({
  [SHARED_PLATFORM.id]: SHARED_PLATFORM,
  [COMPATIBILITY.id]: COMPATIBILITY,
  [BLESSBOARD.id]: BLESSBOARD,
  [ACTIVECLINIC.id]: ACTIVECLINIC,
});

/** Default order for `npm run test:v8:regression`. */
const REGRESSION_SUITE_ORDER = Object.freeze([
  SHARED_PLATFORM.id,
  COMPATIBILITY.id,
  BLESSBOARD.id,
  ACTIVECLINIC.id,
]);

/**
 * @param {string} rel
 */
function resolveSuiteFile(rel) {
  return path.join(ROOT, rel);
}

/**
 * @param {string} suiteId
 * @returns {Suite}
 */
function getSuite(suiteId) {
  const suite = SUITES[String(suiteId || "").trim()];
  if (!suite) {
    throw new Error(
      `Unknown V8 suite ${JSON.stringify(suiteId)}. Known: ${Object.keys(SUITES).join(", ")}`
    );
  }
  return suite;
}

module.exports = {
  ROOT,
  SUITES,
  REGRESSION_SUITE_ORDER,
  COVERAGE_TARGETS,
  COVERAGE_LINE_THRESHOLD,
  SHARED_PLATFORM,
  COMPATIBILITY,
  BLESSBOARD,
  ACTIVECLINIC,
  getSuite,
  resolveSuiteFile,
};
