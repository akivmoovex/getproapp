"use strict";

/**
 * V8 deployment isolation helpers (cookies, jobs, temp state, notifications).
 * V8 shares the V7 testing PostgreSQL database but must not share process state
 * or side-effects with the V7 pronline.org runtime.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  resolveDeploymentConfiguration,
  resolveJobsEnabled,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
} = require("../config/deploymentProfiles");

const V8_HOSTS = Object.freeze([
  "blessboard.neuniversity.org",
  "activeclinic.neuniversity.org",
  "neuniversity.org",
  "www.neuniversity.org",
]);

const V7_TESTING_HOSTS = Object.freeze([
  "blessboard.pronline.org",
  "activeclinic.pronline.org",
  "pronline.org",
  "www.pronline.org",
]);

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolvePlatformLine(env) {
  const deployment = resolveDeploymentConfiguration(env || process.env);
  return String(deployment.platformLine || "v7")
    .trim()
    .toLowerCase() || "v7";
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function isV8Deployment(env) {
  const source = env || process.env;
  const rawCode = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  // Detect V8 even when profile resolution fails closed (e.g. DEPLOYMENT_ENV=production).
  if (rawCode === CODE_MOOVEX_PLATFORM_V8_TESTING) return true;
  const deployment = resolveDeploymentConfiguration(source);
  if (deployment.platformLine === "v8") return true;
  return String(deployment.code || "").trim().toLowerCase() === CODE_MOOVEX_PLATFORM_V8_TESTING;
}

/**
 * Background jobs / notification fan-out must stay off on V8 testing.
 * @param {NodeJS.ProcessEnv} [env]
 */
function areOutboundSideEffectsAllowed(env) {
  const source = env || process.env;
  if (isV8Deployment(source)) return false;
  const jobs = resolveJobsEnabled(source);
  if (jobs === false) return false;
  if (jobs === true) return true;
  return false;
}

/**
 * Deployment-scoped temp directory (never shared across V7/V8 workers).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [purpose]
 */
function resolveIsolationTempDir(env, purpose) {
  const source = env || process.env;
  const deployment = resolveDeploymentConfiguration(source);
  const ns =
    String(deployment.isolationNamespace || (isV8Deployment(source) ? "v8-testing" : "v7-testing"))
      .trim()
      .replace(/[^a-z0-9_-]/gi, "") || "default";
  const purposeSafe = String(purpose || "tmp")
    .trim()
    .replace(/[^a-z0-9_-]/gi, "") || "tmp";
  const explicit = String(source.GETPRO_ISOLATION_TMP_ROOT || "").trim();
  const root = explicit
    ? path.resolve(explicit)
    : path.join(os.tmpdir(), "getpro", ns);
  const dir = path.join(root, purposeSafe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Cookie options for V8/V7 sessions — always host-only (no Domain attribute).
 * @param {NodeJS.ProcessEnv} [env]
 */
function buildHostOnlyCookieOptions(env) {
  const source = env || process.env;
  const secure = String(source.NODE_ENV || "") === "production";
  return Object.freeze({
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    // Intentionally omit `domain` so cookies are host-only and cannot cross
    // blessboard.pronline.org ↔ blessboard.neuniversity.org.
  });
}

/**
 * Fail-closed guard for missing or production-targeted V8 env.
 * @param {NodeJS.ProcessEnv} [env]
 */
function assertV8EnvironmentSafeOrError(env) {
  const source = env || process.env;
  if (!isV8Deployment(source)) {
    return { ok: true, skipped: true };
  }
  const required = [
    "NODE_ENV",
    "PLATFORM_DEPLOYMENT_CODE",
    "DEPLOYMENT_ENV",
    "DATABASE_URL",
    "SESSION_SECRET",
    "DATABASE_IDENTITY_EXPECTED",
    "DATABASE_IDENTITY_ENV",
  ];
  const missing = required.filter((k) => !String(source[k] || "").trim());
  if (missing.length) {
    return {
      ok: false,
      code: "v8_env_missing",
      message: `V8 deployment missing required env: ${missing.join(", ")}.`,
      missing,
    };
  }
  if (String(source.DEPLOYMENT_ENV || "").trim().toLowerCase() === "production") {
    return {
      ok: false,
      code: "v8_production_env_refused",
      message: "V8 deployment refuses DEPLOYMENT_ENV=production.",
    };
  }
  if (String(source.DATABASE_IDENTITY_ENV || "").trim().toLowerCase() === "production") {
    return {
      ok: false,
      code: "v8_production_identity_env_refused",
      message: "V8 deployment refuses DATABASE_IDENTITY_ENV=production.",
    };
  }
  if (areOutboundSideEffectsAllowed(source)) {
    return {
      ok: false,
      code: "v8_side_effects_enabled",
      message: "V8 deployment must keep jobs/notifications disabled.",
    };
  }
  return { ok: true, skipped: false };
}

module.exports = {
  V8_HOSTS,
  V7_TESTING_HOSTS,
  resolvePlatformLine,
  isV8Deployment,
  areOutboundSideEffectsAllowed,
  resolveIsolationTempDir,
  buildHostOnlyCookieOptions,
  assertV8EnvironmentSafeOrError,
};
