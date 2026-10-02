"use strict";

/**
 * Narrow Hostinger V8 env compatibility.
 *
 * Evidence (V8 P0): LiteSpeed `lsnode.js` workers sometimes inherit
 * PLATFORM_DEPLOYMENT_CODE=moovex-platform-testing (V7 unified testing) at pre_file
 * while hPanel also sets BASE_DOMAIN=neuniversity.org for the V8 app. Profile validation
 * then fails closed: BASE_DOMAIN conflicts with moovex-platform-testing (expects pronline.org).
 *
 * This adapter remaps ONLY that exact stale combination to moovex-platform-v8-testing.
 * It never uses HTTP Host headers, never remaps production, and never overrides an
 * already-correct V8 deployment code.
 */

const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../config/deploymentProfiles");

const V8_CANONICAL_DOMAIN = "neuniversity.org";

/**
 * @param {unknown} value
 */
function trimLower(value) {
  return String(value == null ? "" : value)
    .trim()
    .toLowerCase();
}

/**
 * @param {unknown} host
 */
function normalizeHost(host) {
  return trimLower(host).replace(/\.$/, "");
}

/**
 * Decide whether the Hostinger-inherited V7 testing deployment code should be
 * treated as a stale value for an explicitly configured V8 testing app.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   eligible: boolean,
 *   reason: string,
 *   from?: string,
 *   to?: string,
 * }}
 */
function evaluateV8HostingerStaleDeploymentCodeCompat(env) {
  const source = env || process.env;
  const code = trimLower(source.PLATFORM_DEPLOYMENT_CODE);
  const baseDomain = normalizeHost(source.BASE_DOMAIN);
  const deploymentEnv = trimLower(source.DEPLOYMENT_ENV);
  const identityEnv = trimLower(source.DATABASE_IDENTITY_ENV);
  const identityExpected = trimLower(source.DATABASE_IDENTITY_EXPECTED);

  if (!code) {
    return { eligible: false, reason: "missing_deployment_code" };
  }
  if (code === CODE_MOOVEX_PLATFORM_V8_TESTING) {
    return { eligible: false, reason: "already_v8_testing" };
  }
  if (code !== CODE_MOOVEX_PLATFORM_TESTING) {
    return { eligible: false, reason: "not_stale_v7_testing_code" };
  }
  if (baseDomain !== V8_CANONICAL_DOMAIN) {
    return { eligible: false, reason: "base_domain_not_neuniversity" };
  }
  if (deploymentEnv === "production") {
    return { eligible: false, reason: "deployment_env_production" };
  }
  if (deploymentEnv && deploymentEnv !== "testing") {
    return { eligible: false, reason: "deployment_env_not_testing" };
  }
  if (identityEnv === "production") {
    return { eligible: false, reason: "identity_env_production" };
  }
  if (identityEnv && identityEnv !== "testing") {
    return { eligible: false, reason: "identity_env_not_testing" };
  }
  if (identityExpected && identityExpected !== MOOVEX_PLATFORM_IDENTITY_KEY) {
    return { eligible: false, reason: "identity_key_mismatch" };
  }

  return {
    eligible: true,
    reason: "stale_v7_testing_code_with_v8_base_domain",
    from: CODE_MOOVEX_PLATFORM_TESTING,
    to: CODE_MOOVEX_PLATFORM_V8_TESTING,
  };
}

/**
 * Apply the remapping onto `env` (defaults to process.env) when eligible.
 * Mutates only PLATFORM_DEPLOYMENT_CODE.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ log?: boolean, warnFn?: (msg: string) => void }} [opts]
 * @returns {{
 *   applied: boolean,
 *   reason: string,
 *   from?: string,
 *   to?: string,
 * }}
 */
function applyV8HostingerStaleDeploymentCodeCompat(env, opts) {
  const source = env || process.env;
  const decision = evaluateV8HostingerStaleDeploymentCodeCompat(source);
  if (!decision.eligible) {
    return { applied: false, reason: decision.reason };
  }

  source.PLATFORM_DEPLOYMENT_CODE = CODE_MOOVEX_PLATFORM_V8_TESTING;

  const logEnabled = !opts || opts.log !== false;
  if (logEnabled) {
    const warnFn = opts && typeof opts.warnFn === "function" ? opts.warnFn : null;
    const warn =
      warnFn ||
      ((msg) => {
        // eslint-disable-next-line no-console
        console.warn(msg);
      });
    warn(
      `[getpro] v8HostingerEnvCompat: remapped PLATFORM_DEPLOYMENT_CODE ` +
        `${decision.from} → ${decision.to} because BASE_DOMAIN=${V8_CANONICAL_DOMAIN} ` +
        `with DEPLOYMENT_ENV=testing (Hostinger stale V7 testing code on V8 app). ` +
        `reason=${decision.reason}`
    );
  }

  return {
    applied: true,
    reason: decision.reason,
    from: decision.from,
    to: decision.to,
  };
}

/**
 * True when production env-file candidates should prefer neuniversity and skip pronline.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [haystack]
 */
function shouldPreferNeuniversityProductionEnvFiles(env, haystack) {
  const source = env || process.env;
  if (normalizeHost(source.BASE_DOMAIN) === V8_CANONICAL_DOMAIN) return true;
  const hay = String(haystack || "").toLowerCase();
  return hay.includes("neuniversity");
}

module.exports = {
  V8_CANONICAL_DOMAIN,
  evaluateV8HostingerStaleDeploymentCodeCompat,
  applyV8HostingerStaleDeploymentCodeCompat,
  shouldPreferNeuniversityProductionEnvFiles,
};
