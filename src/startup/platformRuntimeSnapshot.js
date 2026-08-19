"use strict";

/**
 * Safe testing-only platform runtime snapshot (no secrets).
 */

const {
  resolveDeploymentConfiguration,
  hasAuthoritativeDeploymentProfile,
} = require("../platform/config/deploymentProfiles");
const {
  fingerprintEffectiveDatabaseUrl,
} = require("./databaseUrlFingerprint");
const {
  buildStartupProcessMarker,
  readGitShaShort,
} = require("./startupProcessMarker");

/**
 * Whether `/__platform/runtime` may be exposed.
 * Allowed only when DEPLOYMENT_ENV=testing (or NODE_ENV is not production).
 * Never expose in production deployment env.
 * @param {NodeJS.ProcessEnv} [env]
 */
function isPlatformRuntimeDiagnosticsEndpointAllowed(env) {
  const source = env || process.env;
  const deploymentEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  if (deploymentEnv === "production") return false;
  if (deploymentEnv === "testing") return true;
  const nodeEnv = String(source.NODE_ENV || "")
    .trim()
    .toLowerCase();
  // Fail closed when NODE_ENV=production without an explicit testing deployment env.
  if (nodeEnv === "production") return false;
  return true;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ appRoot?: string, boot?: object }} [opts]
 */
function buildPlatformRuntimeSnapshot(env, opts) {
  const source = env || process.env;
  const options = opts || {};
  const deployment = resolveDeploymentConfiguration(source);
  const fp = fingerprintEffectiveDatabaseUrl(source);
  const marker = buildStartupProcessMarker({
    appRoot: options.appRoot,
    env: source,
    phase: "runtime_endpoint",
  });
  const boot = options.boot || null;
  return {
    ok: true,
    gitSha: marker.gitSha || readGitShaShort(options.appRoot),
    pid: process.pid,
    startedAt: marker.startedAt,
    nodeEnv: String(source.NODE_ENV || "(unset)"),
    deploymentEnv:
      String(source.DEPLOYMENT_ENV || "").trim() ||
      deployment.environment ||
      "(unset)",
    deploymentCode: deployment.code || String(source.PLATFORM_DEPLOYMENT_CODE || "(unset)"),
    databaseIdentityExpected:
      deployment.expectedIdentityKey ||
      String(source.DATABASE_IDENTITY_EXPECTED || "(unset)"),
    databaseIdentityEnv:
      deployment.expectedDatabaseEnvironment ||
      String(source.DATABASE_IDENTITY_ENV || "(unset)"),
    databaseHost: fp.fingerprint.hostname || "(none)",
    databaseSourceVar: fp.sourceVar,
    databaseProtocol: fp.fingerprint.protocol || null,
    databasePort: fp.fingerprint.port || null,
    databaseName: fp.fingerprint.database || null,
    authoritativeProfile: hasAuthoritativeDeploymentProfile(source),
    productSelection: deployment.productSelection || null,
    dbUrlSourceKind: boot && boot.dbProvenance ? boot.dbProvenance.kind : null,
    earlyProductionEnvLoaded: boot ? Boolean(boot.earlyProductionEnvLoaded) : null,
    productionFileMergeSkipped: boot ? Boolean(boot.productionFileMergeSkipped) : null,
    envPresencePreFile: boot && boot.envPresencePreFile ? boot.envPresencePreFile : null,
    schemaCompatible: boot && boot.schemaCompatibility
      ? boot.schemaCompatibility.compatible === true
      : null,
    schemaCompatibility: boot && boot.schemaCompatibility
      ? {
          compatible: boot.schemaCompatibility.compatible === true,
          code: boot.schemaCompatibility.code || null,
          missing: Array.isArray(boot.schemaCompatibility.missing)
            ? boot.schemaCompatibility.missing
            : [],
        }
      : null,
  };
}

module.exports = {
  isPlatformRuntimeDiagnosticsEndpointAllowed,
  buildPlatformRuntimeSnapshot,
};
