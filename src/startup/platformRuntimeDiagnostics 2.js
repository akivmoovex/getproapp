"use strict";

/**
 * Safe V7 platform runtime startup diagnostics (presence / resolved metadata only).
 * Never logs DATABASE_URL, SESSION_SECRET, or other secret values.
 */

const {
  resolveDeploymentConfiguration,
  hasAuthoritativeDeploymentProfile,
} = require("../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../platform/config/platformDeploymentCode");

function present(name, env) {
  const source = env || process.env;
  const v = source[name];
  return v != null && String(v).trim() !== "" ? "yes" : "no";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
function buildPlatformRuntimeDiagnosticLines(env) {
  const source = env || process.env;
  const deployment = resolveDeploymentConfiguration(source);
  const codeResult = getPlatformDeploymentCode(source);
  const code = (codeResult && codeResult.code) || "(unset)";
  const nodeEnv = String(source.NODE_ENV || "(unset)");
  const lines = [
    "[platform] runtime diagnostics:",
    `  NODE_ENV: ${nodeEnv}`,
    `  PLATFORM_DEPLOYMENT_CODE: ${code}`,
    `  DEPLOYMENT_ENV present: ${present("DEPLOYMENT_ENV", source)}` +
      (source.DEPLOYMENT_ENV ? ` value=${String(source.DEPLOYMENT_ENV).trim().toLowerCase()}` : ""),
    `  runtime environment = ${deployment.environment || "(unprofiled)"}`,
    `  deployment = ${deployment.code || "(unprofiled)"}`,
    `  database identity expected = ${deployment.expectedIdentityKey || "(none)"}`,
    `  DATABASE_IDENTITY_EXPECTED present: ${present("DATABASE_IDENTITY_EXPECTED", source)}`,
    `  DATABASE_IDENTITY_ENV present: ${present("DATABASE_IDENTITY_ENV", source)}` +
      (source.DATABASE_IDENTITY_ENV
        ? ` value=${String(source.DATABASE_IDENTITY_ENV).trim().toLowerCase()}`
        : ""),
    `  expected database environment = ${deployment.expectedDatabaseEnvironment || "(none)"}`,
    `  host resolution mode = ${deployment.productSelection || "(profile/legacy)"}`,
    `  product selection = ${deployment.productSelection || "(n/a)"}`,
    `  site type (profile) = ${deployment.siteType || "(n/a)"}`,
    `  session cookie (profile fallback) = ${deployment.sessionCookieName || "(legacy/default)"}`,
    `  DATABASE_URL present: ${present("DATABASE_URL", source)}`,
    `  GETPRO_DATABASE_URL present: ${present("GETPRO_DATABASE_URL", source)}`,
    `  DBURL_TEST present: ${present("DBURL_TEST", source)}`,
    `  SESSION_SECRET present: ${present("SESSION_SECRET", source)}`,
    `  BASE_DOMAIN present: ${present("BASE_DOMAIN", source)}`,
    `  GETPRO_PG_SSL: ${
      source.GETPRO_PG_SSL != null && String(source.GETPRO_PG_SSL).trim() !== ""
        ? String(source.GETPRO_PG_SSL).trim()
        : "(unset)"
    }`,
    `  authoritative profile: ${hasAuthoritativeDeploymentProfile(source) ? "yes" : "no"}`,
  ];
  try {
    const { fingerprintEffectiveDatabaseUrl } = require("./databaseUrlFingerprint");
    const fp = fingerprintEffectiveDatabaseUrl(source);
    lines.push(
      `  DATABASE_URL hostname: ${fp.fingerprint.hostname || "(none)"} ` +
        `(sourceVar=${fp.sourceVar}, protocol=${fp.fingerprint.protocol || "n/a"}, ` +
        `port=${fp.fingerprint.port || "default"}, database=${fp.fingerprint.database || "n/a"})`
    );
  } catch (_err) {
    lines.push("  DATABASE_URL hostname: (fingerprint unavailable)");
  }
  if (!hasAuthoritativeDeploymentProfile(source)) {
    lines.push(
      "  WARNING: no authoritative PLATFORM_DEPLOYMENT_CODE profile — legacy defaults may apply",
      "  (session cookie may fall back to getpro_sid; canonical domain may fall back to blessboard.com).",
      "  For Hostinger testing set PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing and DEPLOYMENT_ENV=testing."
    );
  }
  return lines;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ log?: (line: string) => void }} [opts]
 */
function logPlatformRuntimeDiagnostics(env, opts) {
  const log = (opts && opts.log) || ((line) => console.log(line));
  for (const line of buildPlatformRuntimeDiagnosticLines(env)) {
    log(line);
  }
}

module.exports = {
  buildPlatformRuntimeDiagnosticLines,
  logPlatformRuntimeDiagnostics,
};
