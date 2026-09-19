"use strict";

/**
 * Public-safe application version / build metadata for About pages and similar surfaces.
 * Reuses the same short Git SHA source as /healthz (readGitShaShort).
 * Does not shell out to git on each call beyond the existing env/.git HEAD read.
 *
 * Release numbering (V1.3):
 *   productVersion  → "1.3"   (human product label)
 *   versionBase     → "1.03"  (system version prefix)
 *   version         → "1.03.<12-char deployed SHA>" or "1.03.(unavailable)"
 */

const { readGitShaShort } = require("../../startup/startupProcessMarker");
const { getDeploymentEnvMode } = require("../../church/blessBoardEnv");

/** System version base for release 1.3 (About / diagnostics). */
const VERSION_BASE = "1.03";

/** Human product version label for release 1.3. */
const PRODUCT_VERSION = "1.3";

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
 * @param {{
 *   appRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} [options]
 * @returns {{
 *   productVersion: string,
 *   versionBase: string,
 *   build: string,
 *   version: string,
 *   available: boolean,
 *   environment: "testing"|"production",
 *   environmentLabel: string,
 * }}
 */
function getApplicationBuildInfo(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const rawBuild = resolveBuildSha(opts);
  const available = !isUnavailableSha(rawBuild);
  const build = available ? String(rawBuild).slice(0, 12) : UNAVAILABLE;
  const environment = getDeploymentEnvMode(env);
  const environmentLabel =
    environment.charAt(0).toUpperCase() + environment.slice(1);

  return {
    productVersion: PRODUCT_VERSION,
    versionBase: VERSION_BASE,
    build,
    version: `${VERSION_BASE}.${build}`,
    available,
    environment,
    environmentLabel,
  };
}

module.exports = {
  VERSION_BASE,
  PRODUCT_VERSION,
  UNAVAILABLE,
  getApplicationBuildInfo,
};
