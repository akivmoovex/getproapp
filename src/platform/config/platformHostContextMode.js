"use strict";

/**
 * PLATFORM_HOST_CONTEXT_MODE feature flag.
 * Values: off | diagnostic. Default: off.
 * Unsupported values are treated as off (safe fail-closed for the diagnostic path).
 */

const MODE_OFF = "off";
const MODE_DIAGNOSTIC = "diagnostic";
const SUPPORTED_MODES = Object.freeze([MODE_OFF, MODE_DIAGNOSTIC]);

let warnedUnsupported = false;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'off'|'diagnostic'}
 */
function getPlatformHostContextMode(env) {
  const source = env || process.env;
  const raw = String(source.PLATFORM_HOST_CONTEXT_MODE || "")
    .trim()
    .toLowerCase();
  if (!raw) return MODE_OFF;
  if (raw === MODE_OFF) return MODE_OFF;
  if (raw === MODE_DIAGNOSTIC) return MODE_DIAGNOSTIC;
  if (!warnedUnsupported) {
    warnedUnsupported = true;
    // eslint-disable-next-line no-console
    console.warn(
      `[platform-host-context] Unsupported PLATFORM_HOST_CONTEXT_MODE=${JSON.stringify(raw)}; treating as "off".`
    );
  }
  return MODE_OFF;
}

/** @returns {boolean} */
function isPlatformHostContextDiagnostic(env) {
  return getPlatformHostContextMode(env) === MODE_DIAGNOSTIC;
}

module.exports = {
  MODE_OFF,
  MODE_DIAGNOSTIC,
  SUPPORTED_MODES,
  getPlatformHostContextMode,
  isPlatformHostContextDiagnostic,
};
