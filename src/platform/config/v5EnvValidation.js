"use strict";

/**
 * Pure BlessBoard V5 environment validation helpers (no process.exit).
 * Logs and diagnostics must never receive raw DATABASE_URL / SESSION_SECRET values.
 *
 * Runtime feature flags still fail closed via their get*Mode helpers; this module
 * exposes explicit parse results so invalid enums are detectable as rejected.
 */

const { COOKIE_ORG: DEFAULT_V5_SESSION_COOKIE } = require("./deploymentProfiles");
const {
  getPlatformDeploymentCode,
  DEPLOYMENT_CODE_PATTERN,
} = require("./platformDeploymentCode");
const {
  V5_FOUNDATION_DEPLOYMENT_CODE,
  isV5FoundationMode,
} = require("./v5FoundationMode");
const {
  MODE_OFF: ROUTING_OFF,
  MODE_SHADOW,
  MODE_AUTHORITATIVE,
  SUPPORTED_MODES: ROUTING_MODES,
} = require("../../blessboard/config/tenantRoutingMode");
const {
  MODE_OFF: HOST_OFF,
  MODE_DIAGNOSTIC,
  SUPPORTED_MODES: HOST_CONTEXT_MODES,
} = require("./platformHostContextMode");
const {
  IDENTITY_KEY_PATTERN,
  ALLOWED_ENVS: IDENTITY_ALLOWED_ENVS,
  validateIdentityKey,
  validateEnvironmentCode,
} = require("../../../db/scripts/lib/databaseIdentity");

const DEPLOYMENT_ENV_TESTING = "testing";
const DEPLOYMENT_ENV_PRODUCTION = "production";
const PUBLIC_SCHEMES = Object.freeze(["http", "https"]);
const JOBS_DISABLE_VALUES = Object.freeze(["0", "false", "no", "off"]);
const MIN_SESSION_SECRET_LENGTH = 32;
/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, value: string } | { ok: false, reason: string, raw: string }}
 */
function parseDeploymentEnvForV5(env) {
  const source = env || process.env;
  const raw = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  if (!raw) return { ok: false, reason: "missing", raw: "" };
  if (raw === DEPLOYMENT_ENV_TESTING || raw === DEPLOYMENT_ENV_PRODUCTION) {
    return { ok: true, value: raw };
  }
  return { ok: false, reason: "unsupported", raw };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, mode: string } | { ok: false, reason: string, raw: string, mode: string }}
 */
function parseTenantRoutingMode(env) {
  const source = env || process.env;
  const raw = String(source.BLESSBOARD_TENANT_ROUTING_MODE || "")
    .trim()
    .toLowerCase();
  if (!raw) return { ok: true, mode: ROUTING_OFF };
  if (ROUTING_MODES.includes(raw)) return { ok: true, mode: raw };
  return { ok: false, reason: "unsupported", raw, mode: ROUTING_OFF };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, mode: string } | { ok: false, reason: string, raw: string, mode: string }}
 */
function parsePlatformHostContextMode(env) {
  const source = env || process.env;
  const raw = String(source.PLATFORM_HOST_CONTEXT_MODE || "")
    .trim()
    .toLowerCase();
  if (!raw) return { ok: true, mode: HOST_OFF };
  if (HOST_CONTEXT_MODES.includes(raw)) return { ok: true, mode: raw };
  return { ok: false, reason: "unsupported", raw, mode: HOST_OFF };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, scheme: string } | { ok: false, reason: string, raw: string, scheme: string }}
 */
function parsePublicScheme(env) {
  const source = env || process.env;
  const raw = String(source.PUBLIC_SCHEME || "")
    .trim()
    .toLowerCase();
  if (!raw) return { ok: true, scheme: "https" };
  if (PUBLIC_SCHEMES.includes(raw)) return { ok: true, scheme: raw };
  return { ok: false, reason: "unsupported", raw, scheme: "https" };
}

/**
 * Jobs master switch.
 * - Authoritative V5 profile / foundation mode: always disabled (explicit enable is a startup fatal elsewhere).
 * - PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5: unset/invalid → disabled (fail-closed).
 * - Other deployments (V4): unset → enabled; invalid → enabled (legacy).
 * @param {NodeJS.ProcessEnv} [env]
 */
function parseBlessBoardJobsEnabled(env) {
  const source = env || process.env;
  const { isWriteMaintenanceEnabled } = require("../../blessboard/config/writeMaintenance");
  const {
    hasAuthoritativeDeploymentProfile,
    resolveJobsEnabled,
    getDeploymentProfile,
  } = require("./deploymentProfiles");
  if (isWriteMaintenanceEnabled(source)) {
    return { ok: true, enabled: false, reason: "write_maintenance" };
  }
  if (hasAuthoritativeDeploymentProfile(source)) {
    const profile = getDeploymentProfile(source);
    const raw = String(source.BLESSBOARD_JOBS_ENABLED || "")
      .trim()
      .toLowerCase();
    if (profile && profile.jobsEnabled === false) {
      if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
        return { ok: false, reason: "profile_forbid_enable", raw, enabled: false };
      }
      if (raw && !JOBS_DISABLE_VALUES.includes(raw)) {
        return { ok: false, reason: "unsupported", raw, enabled: false };
      }
      return { ok: true, enabled: false, reason: "deployment_profile" };
    }
    if (raw && !JOBS_DISABLE_VALUES.includes(raw) && !(raw === "1" || raw === "true" || raw === "yes" || raw === "on")) {
      return {
        ok: false,
        reason: "unsupported",
        raw,
        enabled: Boolean(resolveJobsEnabled(source)),
      };
    }
    const enabled = resolveJobsEnabled(source);
    return { ok: true, enabled: Boolean(enabled), reason: "deployment_profile" };
  }
  if (isV5FoundationMode(source)) {
    return { ok: true, enabled: false, reason: "v5_foundation_mode" };
  }
  const deploy = getPlatformDeploymentCode(source);
  const isV5DeploymentCode = Boolean(
    deploy.ok &&
      (deploy.code === V5_FOUNDATION_DEPLOYMENT_CODE ||
        deploy.code === "blessboard-org-staging")
  );
  const raw = String(source.BLESSBOARD_JOBS_ENABLED || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    if (isV5DeploymentCode) {
      return { ok: true, enabled: false, reason: "v5_default_disabled" };
    }
    return { ok: true, enabled: true, reason: "default_enabled" };
  }
  if (JOBS_DISABLE_VALUES.includes(raw)) {
    return { ok: true, enabled: false, reason: "explicit_disable" };
  }
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") {
    return { ok: true, enabled: true, reason: "explicit_enable" };
  }
  if (isV5DeploymentCode) {
    return { ok: false, reason: "unsupported", raw, enabled: false };
  }
  return { ok: false, reason: "unsupported", raw, enabled: true };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   ok: boolean,
 *   present: boolean,
 *   lengthOk: boolean,
 *   reason: string|null
 * }}
 */
function parseSessionSecret(env) {
  const source = env || process.env;
  const secret = String(source.SESSION_SECRET || "").trim();
  if (!secret) {
    return { ok: false, present: false, lengthOk: false, reason: "missing" };
  }
  if (secret.length < MIN_SESSION_SECRET_LENGTH) {
    return { ok: false, present: true, lengthOk: false, reason: "too_short" };
  }
  return { ok: true, present: true, lengthOk: true, reason: null };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function parseSessionCookieName(env) {
  const source = env || process.env;
  const {
    getDeploymentProfile,
    hasAuthoritativeDeploymentProfile,
  } = require("./deploymentProfiles");
  const raw = String(source.SESSION_COOKIE_NAME || "").trim();
  if (hasAuthoritativeDeploymentProfile(source)) {
    const profile = getDeploymentProfile(source);
    if (!raw) {
      return { ok: true, name: profile.sessionCookieName, usedDefault: true, fromProfile: true };
    }
    return {
      ok: raw === profile.sessionCookieName,
      name: profile.sessionCookieName,
      usedDefault: false,
      fromProfile: true,
    };
  }
  return { ok: true, name: raw || DEFAULT_V5_SESSION_COOKIE, usedDefault: !raw };
}

/**
 * Presence-only DB URL summary — never returns connection string values.
 * @param {NodeJS.ProcessEnv} [env]
 */
function summarizeV5DatabaseEnv(env) {
  const source = env || process.env;
  const hasDatabaseUrl = Boolean(String(source.DATABASE_URL || "").trim());
  const hasGetpro = Boolean(String(source.GETPRO_DATABASE_URL || "").trim());
  const foundation = isV5FoundationMode(source);
  return {
    DATABASE_URL: hasDatabaseUrl ? "yes" : "no",
    GETPRO_DATABASE_URL: hasGetpro ? "yes" : "no",
    getproFallbackDisabled: foundation,
    getproMustRemainUnused: foundation,
    effectiveSource: hasDatabaseUrl ? "DATABASE_URL" : foundation ? "(none)" : hasGetpro ? "GETPRO_DATABASE_URL" : "(none)",
  };
}

/**
 * Pairing rule: V5-foundation profiles must not silently fall through to the legacy server
 * when DEPLOYMENT_ENV explicitly conflicts. Unset DEPLOYMENT_ENV is derived from the profile.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function checkV5FoundationDeploymentPairing(env) {
  const source = env || process.env;
  const {
    getDeploymentProfile,
    resolveDeploymentProfileOrError,
    RUNTIME_V5_FOUNDATION,
  } = require("./deploymentProfiles");
  const resolved = resolveDeploymentProfileOrError(source);
  if (!resolved.ok) return { ok: true }; // assertDeploymentProfileOrExit handles unknown codes
  const profile = resolved.profile;
  if (!profile || profile.runtimeMode !== RUNTIME_V5_FOUNDATION) {
    return { ok: true };
  }
  const depEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  if (!depEnv || depEnv === profile.deploymentEnvironment) {
    return { ok: true };
  }
  return {
    ok: false,
    code: "v5_deployment_pairing_mismatch",
    message:
      `PLATFORM_DEPLOYMENT_CODE=${profile.deploymentCode} requires DEPLOYMENT_ENV=${profile.deploymentEnvironment} ` +
      `or unset (derived from deployment profile); got ${JSON.stringify(depEnv)}. ` +
      "Refusing legacy server path.",
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(msg: string) => void} [errorFn]
 */
function assertV5FoundationDeploymentPairingOrExit(env, errorFn) {
  const check = checkV5FoundationDeploymentPairing(env);
  if (check.ok) return;
  const out = typeof errorFn === "function" ? errorFn : (msg) => console.error(msg);
  out(`[blessboard] FATAL: ${check.message}`);
  process.exit(1);
}

/**
 * Production V5 CSRF/session require a long secret. Non-production may use shorter/dev secrets.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function checkV5SessionSecretPolicy(env) {
  const source = env || process.env;
  const nodeEnv = String(source.NODE_ENV || "")
    .trim()
    .toLowerCase();
  const parsed = parseSessionSecret(source);
  if (nodeEnv !== "production") {
    return { ok: true };
  }
  if (!parsed.ok) {
    return {
      ok: false,
      code: "session_secret_invalid",
      message:
        parsed.reason === "too_short"
          ? `SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} characters in production.`
          : "SESSION_SECRET is required in production for V5 sessions/CSRF.",
    };
  }
  return { ok: true };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(msg: string) => void} [errorFn]
 */
function assertV5SessionSecretPolicyOrExit(env, errorFn) {
  const check = checkV5SessionSecretPolicy(env);
  if (check.ok) return;
  const out = typeof errorFn === "function" ? errorFn : (msg) => console.error(msg);
  out(`[blessboard] FATAL: ${check.message}`);
  process.exit(1);
}

module.exports = {
  DEPLOYMENT_ENV_TESTING,
  DEPLOYMENT_ENV_PRODUCTION,
  PUBLIC_SCHEMES,
  ROUTING_MODES,
  HOST_CONTEXT_MODES,
  IDENTITY_KEY_PATTERN,
  IDENTITY_ALLOWED_ENVS,
  DEPLOYMENT_CODE_PATTERN,
  MIN_SESSION_SECRET_LENGTH,
  DEFAULT_V5_SESSION_COOKIE,
  V5_FOUNDATION_DEPLOYMENT_CODE,
  parseDeploymentEnvForV5,
  parseTenantRoutingMode,
  parsePlatformHostContextMode,
  parsePublicScheme,
  parseBlessBoardJobsEnabled,
  parseSessionSecret,
  parseSessionCookieName,
  summarizeV5DatabaseEnv,
  validateIdentityKey,
  validateEnvironmentCode,
  getPlatformDeploymentCode,
  isV5FoundationMode,
  checkV5FoundationDeploymentPairing,
  assertV5FoundationDeploymentPairingOrExit,
  checkV5SessionSecretPolicy,
  assertV5SessionSecretPolicyOrExit,
};
