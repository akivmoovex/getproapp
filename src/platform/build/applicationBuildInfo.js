"use strict";

/**
 * Public-safe application version / build metadata for About pages and similar surfaces.
 * Reuses the same short Git SHA source as /healthz (readGitShaShort).
 * Does not shell out to git on each call beyond the existing env/.git HEAD read.
 *
 * V7 (production catalogue profile / legacy non-v8 platformLine):
 *   productVersion  → "1.3"   (human product label)
 *   versionBase     → "1.03"  (system version prefix)
 *   version         → "1.03.<12-char deployed SHA>" or "1.03.(unavailable)"
 *
 * V8 platform line (neuniversity moovex-platform-v8-testing AND V9 pronline
 * moovex-platform-testing with platformLine=v8):
 *   productVersion  → "2.02"
 *   versionBase     → "2.02"
 *   version         → "2.02" (Git SHA is shown separately as `build`; no invented build number)
 */

const { readGitShaShort } = require("../../startup/startupProcessMarker");
const { getDeploymentEnvMode } = require("../../church/blessBoardEnv");
const { isV8Deployment } = require("../config/v8DeploymentIsolation");

/** System version base for V7 release 1.3 (About / diagnostics). */
const VERSION_BASE_V7 = "1.03";

/** Human product version label for V7 release 1.3. */
const PRODUCT_VERSION_V7 = "1.3";

/** System / product version for V8 (GetPro V2.02 line). */
const VERSION_BASE_V8 = "2.02";
const PRODUCT_VERSION_V8 = "2.02";

/**
 * Backward-compatible aliases — default to V7 so existing imports keep working.
 * Prefer getApplicationBuildInfo({ env }) for deployment-aware values.
 */
const VERSION_BASE = VERSION_BASE_V7;
const PRODUCT_VERSION = PRODUCT_VERSION_V7;

const UNAVAILABLE = "(unavailable)";

function isUnavailableSha(value) {
  const s = String(value || "").trim().toLowerCase();
  return !s || s === UNAVAILABLE || s.includes("unavailable") || s === "(ref-unavailable)";
}

function resolveBuildSha(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const fromEnv =
    String(env.GETPRO_GIT_SHA || env.GIT_SHA || env.COMMIT_SHA || "").trim();
  if (fromEnv) return fromEnv.slice(0, 12);
  return readGitShaShort(opts.appRoot);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{
 *   platformLine: "v7"|"v8",
 *   productVersion: string,
 *   versionBase: string,
 * }}
 */
function resolveVersionScheme(env) {
  if (isV8Deployment(env || process.env)) {
    return {
      platformLine: "v8",
      productVersion: PRODUCT_VERSION_V8,
      versionBase: VERSION_BASE_V8,
    };
  }
  return {
    platformLine: "v7",
    productVersion: PRODUCT_VERSION_V7,
    versionBase: VERSION_BASE_V7,
  };
}

/**
 * @param {{
 *   appRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} [options]
 * @returns {{
 *   productVersion: string,
 *   versionBase: string,
 *   build: string,
 *   version: string,
 *   productVersionLabel: string,
 *   available: boolean,
 *   environment: "testing"|"production",
 *   environmentLabel: string,
 *   platformLine: "v7"|"v8",
 * }}
 */
function getApplicationBuildInfo(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const scheme = resolveVersionScheme(env);
  const rawBuild = resolveBuildSha(opts);
  const available = !isUnavailableSha(rawBuild);
  const build = available ? String(rawBuild).slice(0, 12) : UNAVAILABLE;
  const environment = getDeploymentEnvMode(env);
  const environmentLabel =
    environment.charAt(0).toUpperCase() + environment.slice(1);

  // V8: show product version alone; Git SHA lives in `build` only.
  // V7: preserve historical 1.03.<sha> compound format.
  const version =
    scheme.platformLine === "v8"
      ? scheme.versionBase
      : `${scheme.versionBase}.${build}`;

  return {
    productVersion: scheme.productVersion,
    versionBase: scheme.versionBase,
    build,
    version,
    productVersionLabel: `Version ${scheme.productVersion}`,
    available,
    environment,
    environmentLabel,
    platformLine: scheme.platformLine,
  };
}

module.exports = {
  VERSION_BASE,
  PRODUCT_VERSION,
  VERSION_BASE_V7,
  PRODUCT_VERSION_V7,
  VERSION_BASE_V8,
  PRODUCT_VERSION_V8,
  UNAVAILABLE,
  resolveVersionScheme,
  getApplicationBuildInfo,
};
