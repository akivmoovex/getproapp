"use strict";

/**
 * Explicit running-application deployment identity.
 * PLATFORM_DEPLOYMENT_CODE (e.g. blessboard-com-v4, blessboard-org-v5).
 *
 * Distinct from database identity, NODE_ENV, BASE_DOMAIN, hostname, DATABASE_URL,
 * Git branch, and session cookie names. Never inferred — read only here.
 */

const DEPLOYMENT_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const STATUS_OK = "ok";
const STATUS_UNAVAILABLE = "unavailable";
const STATUS_INVALID = "invalid";

let warnedDiagnosticUnavailable = false;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: boolean, status: 'ok'|'unavailable'|'invalid', code: string | null }}
 */
function getPlatformDeploymentCode(env) {
  const source = env || process.env;
  const raw = String(source.PLATFORM_DEPLOYMENT_CODE || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return { ok: false, status: STATUS_UNAVAILABLE, code: null };
  }
  if (!DEPLOYMENT_CODE_PATTERN.test(raw)) {
    return { ok: false, status: STATUS_INVALID, code: null };
  }
  return { ok: true, status: STATUS_OK, code: raw };
}

/**
 * One compact warning when diagnostic mode is on but deployment identity is missing/invalid.
 * @param {'off'|'diagnostic'} mode
 * @param {{ ok: boolean, status: string }} identity
 * @param {(msg: string) => void} [warnFn]
 */
function warnOnceIfDiagnosticDeploymentUnavailable(mode, identity, warnFn) {
  if (mode !== "diagnostic") return;
  if (identity && identity.ok) return;
  if (warnedDiagnosticUnavailable) return;
  warnedDiagnosticUnavailable = true;
  const status = identity && identity.status ? identity.status : STATUS_UNAVAILABLE;
  const out = typeof warnFn === "function" ? warnFn : (msg) => console.warn(msg);
  out(
    `[platform-deployment] PLATFORM_DEPLOYMENT_CODE is ${status} while PLATFORM_HOST_CONTEXT_MODE=diagnostic; ` +
      "hostname resolution continues without deployment_mismatch evaluation."
  );
}

/** Test helper */
function resetPlatformDeploymentCodeWarningForTests() {
  warnedDiagnosticUnavailable = false;
}

module.exports = {
  DEPLOYMENT_CODE_PATTERN,
  STATUS_OK,
  STATUS_UNAVAILABLE,
  STATUS_INVALID,
  getPlatformDeploymentCode,
  warnOnceIfDiagnosticDeploymentUnavailable,
  resetPlatformDeploymentCodeWarningForTests,
};
