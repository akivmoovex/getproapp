"use strict";

/**
 * Product-neutral deployment environment mode gates (testing | production).
 *
 * Used by BlessBoard, ActiveClinic, and platform About/build metadata.
 * Does not own BlessBoard apex/domain config — that remains in church/blessBoardEnv.
 */

const {
  getDeploymentProfile,
  hasAuthoritativeDeploymentProfile,
} = require("./deploymentProfiles");

const DEPLOYMENT_ENV_TESTING = "testing";
const DEPLOYMENT_ENV_PRODUCTION = "production";

let deploymentEnvFallbackWarned = false;

function envTrim(name, env) {
  const source = env || process.env;
  const v = source[name];
  if (v == null) return "";
  let s = String(v).trim();
  if (s.includes(",")) return s;
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * Authoritative deployment mode for demo visibility and seed safety.
 * Authoritative profile → profile.deploymentEnvironment.
 * Otherwise reads DEPLOYMENT_ENV only (case-insensitive, trimmed). Does not use NODE_ENV.
 * Accepted: "testing" | "production". Missing or unknown → "production" (safe: hide demos).
 * Runtime callers must pass the explicit app `env`; process.env is bootstrap-only.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"testing"|"production"}
 */
function getDeploymentEnvMode(env) {
  if (hasAuthoritativeDeploymentProfile(env)) {
    const profile = getDeploymentProfile(env);
    return profile && profile.deploymentEnvironment === DEPLOYMENT_ENV_TESTING
      ? DEPLOYMENT_ENV_TESTING
      : DEPLOYMENT_ENV_PRODUCTION;
  }
  const raw = envTrim("DEPLOYMENT_ENV", env).toLowerCase();
  if (raw === DEPLOYMENT_ENV_TESTING) return DEPLOYMENT_ENV_TESTING;
  if (raw === DEPLOYMENT_ENV_PRODUCTION) return DEPLOYMENT_ENV_PRODUCTION;
  if (!deploymentEnvFallbackWarned) {
    deploymentEnvFallbackWarned = true;
    const reason = raw
      ? `unrecognised DEPLOYMENT_ENV value (expected testing|production)`
      : "DEPLOYMENT_ENV unset";
    // eslint-disable-next-line no-console
    console.warn(
      `[blessboard] ${reason}; using safe fallback mode=production (demo tenants hidden from directory/selector). NODE_ENV is not used for this gate.`
    );
  }
  return DEPLOYMENT_ENV_PRODUCTION;
}

/** True when DEPLOYMENT_ENV is testing (demo tenants may appear in directory/selector). */
function isTestingDeployment(env) {
  return getDeploymentEnvMode(env) === DEPLOYMENT_ENV_TESTING;
}

/**
 * True when DEPLOYMENT_ENV is production, or when missing/invalid (safe fallback).
 * @param {NodeJS.ProcessEnv} [env]
 */
function isProductionDeployment(env) {
  return getDeploymentEnvMode(env) === DEPLOYMENT_ENV_PRODUCTION;
}

module.exports = {
  DEPLOYMENT_ENV_TESTING,
  DEPLOYMENT_ENV_PRODUCTION,
  envTrim,
  getDeploymentEnvMode,
  isTestingDeployment,
  isProductionDeployment,
};
