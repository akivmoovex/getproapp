"use strict";

/**
 * BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED — rollout switch for instant
 * Basic/Free self-service provisioning on /register-church.
 *
 * Default: disabled (fail-closed). When off, registration remains application-only.
 * Invalid tokens → disabled. Does not enable Growth/Network instant provisioning.
 */

const ENV_KEY = "BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED";
const DISABLE_VALUES = Object.freeze(["0", "false", "no", "off"]);
const ENABLE_VALUES = Object.freeze(["1", "true", "yes", "on"]);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   ok: boolean,
 *   enabled: boolean,
 *   reason: string,
 *   raw: string,
 * }}
 */
function parseInstantFreeProvisioningEnabled(env) {
  const source = env || process.env;
  const raw = String(source[ENV_KEY] || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return { ok: true, enabled: false, reason: "default_disabled", raw: "" };
  }
  if (DISABLE_VALUES.includes(raw)) {
    return { ok: true, enabled: false, reason: "explicit_disable", raw };
  }
  if (ENABLE_VALUES.includes(raw)) {
    return { ok: true, enabled: true, reason: "explicit_enable", raw };
  }
  return { ok: false, enabled: false, reason: "unsupported", raw };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isInstantFreeProvisioningEnabled(env) {
  return parseInstantFreeProvisioningEnabled(env).enabled;
}

/**
 * Safe one-line diagnostic (no secrets).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function formatInstantFreeProvisioningEnabledLog(env) {
  const parsed = parseInstantFreeProvisioningEnabled(env);
  return `${ENV_KEY}=${parsed.enabled ? "1" : "0"} (${parsed.reason})`;
}

module.exports = {
  ENV_KEY,
  DISABLE_VALUES,
  ENABLE_VALUES,
  parseInstantFreeProvisioningEnabled,
  isInstantFreeProvisioningEnabled,
  formatInstantFreeProvisioningEnabledLog,
};
