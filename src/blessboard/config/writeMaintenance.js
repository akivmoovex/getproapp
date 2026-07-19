"use strict";

/**
 * BLESSBOARD_WRITE_MAINTENANCE — global write freeze for migrate/cutover.
 *
 * Default: off (unset). Explicit enable tokens turn maintenance on.
 * Invalid non-empty tokens → on (fail-closed for writes).
 * No platform-admin break-glass in v1.
 */

const ENV_KEY = "BLESSBOARD_WRITE_MAINTENANCE";
const DISABLE_VALUES = Object.freeze(["0", "false", "no", "off"]);
const ENABLE_VALUES = Object.freeze(["1", "true", "yes", "on"]);

/** Public machine code only — never include stack traces or env values in responses. */
const PUBLIC_REASON = "write_maintenance";

const USER_MESSAGE =
  "BlessBoard is temporarily unavailable for changes. Please try again soon.";

/**
 * Logout POSTs allowed during write maintenance (session revoke is safer than sticky sessions).
 * Exact path match after stripping query (no trailing slash except root).
 */
const ALLOWED_WRITE_PATHS = Object.freeze([
  "/logout",
  "/admin/logout",
  "/hq/logout",
  "/branch-admin/logout",
  "/member/logout",
]);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   ok: boolean,
 *   enabled: boolean,
 *   reason: string,
 *   raw: string,
 * }}
 */
function parseWriteMaintenance(env) {
  const source = env || process.env;
  const raw = String(source[ENV_KEY] || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return { ok: true, enabled: false, reason: "default_off", raw: "" };
  }
  if (DISABLE_VALUES.includes(raw)) {
    return { ok: true, enabled: false, reason: "explicit_disable", raw };
  }
  if (ENABLE_VALUES.includes(raw)) {
    return { ok: true, enabled: true, reason: "explicit_enable", raw };
  }
  // Non-empty unsupported → treat as ON (fail closed for writes during misconfig).
  return { ok: false, enabled: true, reason: "unsupported_fail_closed", raw };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isWriteMaintenanceEnabled(env) {
  return parseWriteMaintenance(env).enabled;
}

/**
 * @param {string} pathName
 * @returns {string}
 */
function normalizeMaintenancePath(pathName) {
  const raw = String(pathName || "/").split("?")[0] || "/";
  if (raw.length > 1 && raw.endsWith("/")) return raw.slice(0, -1);
  return raw;
}

/**
 * @param {string} method
 * @param {string} pathName
 * @returns {boolean}
 */
function isStateChangingMethod(method) {
  const m = String(method || "GET").toUpperCase();
  return m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE";
}

/**
 * @param {string} method
 * @param {string} pathName
 * @returns {boolean}
 */
function isWriteAllowedDuringMaintenance(method, pathName) {
  if (!isStateChangingMethod(method)) return true;
  const pathOnly = normalizeMaintenancePath(pathName);
  return ALLOWED_WRITE_PATHS.includes(pathOnly);
}

/**
 * Safe one-line diagnostic (no secrets).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function formatWriteMaintenanceLog(env) {
  const parsed = parseWriteMaintenance(env);
  return `BLESSBOARD_WRITE_MAINTENANCE=${parsed.enabled ? "1" : "0"} (${parsed.reason})`;
}

module.exports = {
  ENV_KEY,
  DISABLE_VALUES,
  ENABLE_VALUES,
  PUBLIC_REASON,
  USER_MESSAGE,
  ALLOWED_WRITE_PATHS,
  parseWriteMaintenance,
  isWriteMaintenanceEnabled,
  normalizeMaintenancePath,
  isStateChangingMethod,
  isWriteAllowedDuringMaintenance,
  formatWriteMaintenanceLog,
};
