"use strict";

/**
 * V5 BlessBoard.org foundation startup mode.
 *
 * Active when PLATFORM_DEPLOYMENT_CODE selects an authoritative profile with
 * runtimeMode=v5-foundation (blessboard-org-v5). DEPLOYMENT_ENV may be omitted
 * (derived as testing from the profile); an explicit conflicting value fails
 * closed via deploymentProfiles validation / pairing checks.
 *
 * Temporary: boots Express against the platform foundation database without
 * legacy public application tables (tenants, session, church_*, ensure*Schema).
 */

const { getPlatformDeploymentCode } = require("./platformDeploymentCode");
const { getDeploymentProfile, CODE_ORG_V5 } = require("./deploymentProfiles");

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
  const profile = getDeploymentProfile(source);
  if (profile && profile.runtimeMode === "v5-foundation" && profile.authoritative) {
    const depEnv = String(source.DEPLOYMENT_ENV || "")
      .trim()
      .toLowerCase();
    // Explicit conflict is not foundation mode (pairing assert exits separately).
    if (depEnv && depEnv !== profile.deploymentEnvironment) return false;
    return true;
  }
  // Backward-compatible path when profile registry is unavailable in older callers:
  const deploy = getPlatformDeploymentCode(source);
  const depEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  return Boolean(
    deploy.ok &&
      deploy.code === V5_FOUNDATION_DEPLOYMENT_CODE &&
      (depEnv === "testing" || depEnv === "")
  );
}

/**
 * Startup logs (no secrets).
 * @param {(msg: string) => void} [logFn]
 */
function logV5FoundationModeActive(logFn) {
  const out = typeof logFn === "function" ? logFn : (msg) => console.log(msg);
  out("[blessboard] V5 foundation mode: ACTIVE");
  out(
    `[blessboard] V5 foundation mode: PLATFORM_DEPLOYMENT_CODE=${V5_FOUNDATION_DEPLOYMENT_CODE} (deployment environment derived as testing)`
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
  SKIPPED_LEGACY_MODULES,
  isV5FoundationMode,
  logV5FoundationModeActive,
};
