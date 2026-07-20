"use strict";

/**
 * BLESSBOARD_INSTANT_FREE_PROVISIONING_ENABLED — emergency switch for automatic
 * Foundation (public `foundation` → DB `free`) and Growth (one-month trial)
 * self-service provisioning on /register-church.
 *
 * Default: **enabled** when unset. Explicit false/0/no/off disables and falls
 * back to enquiry-only for Foundation and Growth. Network always remains
 * support-contact only (never instant-provisioned).
 * Query/body cannot override this server flag.
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
    return { ok: true, enabled: true, reason: "default_enabled", raw: "" };
  }
  if (DISABLE_VALUES.includes(raw)) {
    return { ok: true, enabled: false, reason: "explicit_disable", raw };
  }
  if (ENABLE_VALUES.includes(raw)) {
    return { ok: true, enabled: true, reason: "explicit_enable", raw };
  }
  // Unsupported tokens fail closed to disabled (emergency-safe).
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
