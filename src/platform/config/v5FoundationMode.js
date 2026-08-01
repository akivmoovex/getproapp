"use strict";

/**
 * V5 BlessBoard foundation startup mode.
 *
 * Active when an authoritative deployment profile has runtimeMode=v5-foundation
 * (blessboard-org-staging, or deprecated alias blessboard-org-v5).
 */

const {
  getDeploymentProfile,
  hasAuthoritativeDeploymentProfile,
  CODE_ORG_STAGING,
  CODE_ORG_V5,
  RUNTIME_V5_FOUNDATION,
} = require("./deploymentProfiles");

/** @deprecated Prefer CODE_ORG_STAGING — kept for tests/docs that still reference the old code. */
const V5_FOUNDATION_DEPLOYMENT_CODE = CODE_ORG_V5;

const SKIPPED_LEGACY_MODULES = Object.freeze([
  "connect-pg-simple / public.session",
  "ensureChurchSchema and ensure*Schema runtime DDL",
  "assertBlessBoardDatabaseIdentityOrExit (legacy church_database_identity)",
  "createAttachTenantByHost / public.tenants",
  "createAttachChurchContext / church_* tables",
  "bootstrapAfterListen seeds (demo, builtin, manager, field-agent)",
  "scheduled jobs / BLESSBOARD_JOBS workers",
  "legacy login, admin, member, branch-admin, HQ-admin, portal routes",
]);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isV5FoundationMode(env) {
  const source = env || process.env;
  if (!hasAuthoritativeDeploymentProfile(source)) return false;
  const profile = getDeploymentProfile(source);
  return Boolean(profile && profile.runtimeMode === RUNTIME_V5_FOUNDATION);
}

/**
 * True when authoritative production (full app) profile is active.
 * @param {NodeJS.ProcessEnv} [env]
 */
function isBlessBoardProductionRuntime(env) {
  const source = env || process.env;
  if (!hasAuthoritativeDeploymentProfile(source)) return false;
  const profile = getDeploymentProfile(source);
  return Boolean(profile && profile.runtimeMode === "production");
}

/**
 * Startup logs (no secrets).
 * @param {(msg: string) => void} [logFn]
 */
function logV5FoundationModeActive(logFn) {
  const out = typeof logFn === "function" ? logFn : (msg) => console.log(msg);
  const profile = getDeploymentProfile();
  const code = (profile && profile.deploymentCode) || CODE_ORG_STAGING;
  out("[blessboard] V5 foundation mode: ACTIVE");
  out(
    `[blessboard] V5 foundation mode: PLATFORM_DEPLOYMENT_CODE=${code} (deployment environment derived as testing)`
  );
  out("[blessboard] V5 foundation mode: using DATABASE_URL only (no GETPRO_DATABASE_URL fallback)");
  out("[blessboard] V5 foundation mode: legacy public application tables are intentionally absent");
  out("[blessboard] V5 foundation mode: skipped legacy modules:");
  for (const name of SKIPPED_LEGACY_MODULES) {
    out(`  - ${name}`);
  }
}

module.exports = {
  V5_FOUNDATION_DEPLOYMENT_CODE,
  CODE_ORG_STAGING,
  SKIPPED_LEGACY_MODULES,
  isV5FoundationMode,
  isBlessBoardProductionRuntime,
  logV5FoundationModeActive,
};
