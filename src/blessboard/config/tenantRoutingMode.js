"use strict";

/**
 * BLESSBOARD_TENANT_ROUTING_MODE feature flag.
 * Values: off | shadow | authoritative. Default: off.
 * Never inferred from NODE_ENV, hostname, deployment code, or Git branch.
 */

const MODE_OFF = "off";
const MODE_SHADOW = "shadow";
const MODE_AUTHORITATIVE = "authoritative";
const SUPPORTED_MODES = Object.freeze([MODE_OFF, MODE_SHADOW, MODE_AUTHORITATIVE]);

let warnedUnsupported = false;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'off'|'shadow'|'authoritative'}
 */
function getBlessBoardTenantRoutingMode(env) {
  const source = env || process.env;
  const raw = String(source.BLESSBOARD_TENANT_ROUTING_MODE || "")
    .trim()
    .toLowerCase();
  if (!raw) return MODE_OFF;
  if (raw === MODE_OFF) return MODE_OFF;
  if (raw === MODE_SHADOW) return MODE_SHADOW;
  if (raw === MODE_AUTHORITATIVE) return MODE_AUTHORITATIVE;
  if (!warnedUnsupported) {
    warnedUnsupported = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[blessboard-tenant-routing] Unsupported BLESSBOARD_TENANT_ROUTING_MODE=${JSON.stringify(
        raw
      )}; treating as "off".`
    );
  }
  return MODE_OFF;
}

/** Test helper */
function resetTenantRoutingModeWarningForTests() {
  warnedUnsupported = false;
}

module.exports = {
  MODE_OFF,
  MODE_SHADOW,
  MODE_AUTHORITATIVE,
  SUPPORTED_MODES,
  getBlessBoardTenantRoutingMode,
  resetTenantRoutingModeWarningForTests,
};
