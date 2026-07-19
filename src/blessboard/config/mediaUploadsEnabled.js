"use strict";

/**
 * BLESSBOARD_MEDIA_UPLOADS_ENABLED — deployment kill switch for media uploads.
 *
 * Default: disabled (fail-closed). External object storage / disk writes must be
 * explicitly opted in. Invalid tokens → disabled.
 *
 * Does not replace package entitlements or authz; only a process-wide off switch.
 */

const ENV_KEY = "BLESSBOARD_MEDIA_UPLOADS_ENABLED";
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
function parseMediaUploadsEnabled(env) {
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
function areMediaUploadsEnabled(env) {
  return parseMediaUploadsEnabled(env).enabled;
}

/**
 * Safe one-line diagnostic (no secrets).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function formatMediaUploadsEnabledLog(env) {
  const parsed = parseMediaUploadsEnabled(env);
  return `BLESSBOARD_MEDIA_UPLOADS_ENABLED=${parsed.enabled ? "1" : "0"} (${parsed.reason})`;
}

module.exports = {
  ENV_KEY,
  DISABLE_VALUES,
  ENABLE_VALUES,
  parseMediaUploadsEnabled,
  areMediaUploadsEnabled,
  formatMediaUploadsEnabledLog,
};
