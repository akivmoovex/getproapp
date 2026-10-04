"use strict";

/**
 * Public-safe application version / build metadata for About pages and similar surfaces.
 * Reuses the same short Git SHA source as /healthz (readGitShaShort).
 * Does not shell out to git on each call beyond the existing env/.git HEAD read.
 *
 * Canonical current product line (all deployments, including production):
 *   productVersion  → "2.07"
 *   versionBase     → "2.07"
 *   version         → "2.07" (Git SHA is shown separately as `build`; no invented build number)
 *
 * Legacy V7 catalogue labels (historical reference only; not selected for About):
 *   productVersion  → "1.3"
 *   versionBase     → "1.03"
 *   version         → "1.03.<12-char deployed SHA>"
 */

const { readGitShaShort } = require("../../startup/startupProcessMarker");
const { getDeploymentEnvMode } = require("../config/deploymentEnv");

/** System version base for V7 release 1.3 (historical). */
const VERSION_BASE_V7 = "1.03";

/** Human product version label for V7 release 1.3 (historical). */
const PRODUCT_VERSION_V7 = "1.3";

/** System / product version for the canonical GetPro V2.07 line. */
const VERSION_BASE_V8 = "2.07";
const PRODUCT_VERSION_V8 = "2.07";

/**
 * Canonical aliases — current product About/version source is V2.07.
 * Prefer getApplicationBuildInfo({ env }) for environment + build SHA.
 */
const VERSION_BASE = VERSION_BASE_V8;
const PRODUCT_VERSION = PRODUCT_VERSION_V8;

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
 *   platformLine: "v8",
 *   productVersion: string,
 *   versionBase: string,
 * }}
 */
function resolveVersionScheme(env) {
  // About/product version is canonical V2.07 for every deployment profile,
  // including production (moovex-platform-production / activeclinic-org-production).
  // Deployment isolation platformLine (v7 vs v8) is orthogonal and must not
  // pin About to the legacy 1.03 catalogue label.
  void env;
  return {
    platformLine: "v8",
    productVersion: PRODUCT_VERSION_V8,
    versionBase: VERSION_BASE_V8,
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
 *   platformLine: "v8",
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

  // Canonical V2.07: show product version alone; Git SHA lives in `build` only.
  const version = scheme.versionBase;

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
