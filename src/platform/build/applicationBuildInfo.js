"use strict";

/**
 * Public-safe application version / build metadata for About pages and similar surfaces.
 * Reuses the same short Git SHA source as /healthz (readGitShaShort).
 * Does not shell out to git on each call beyond the existing env/.git HEAD read.
 */

const { readGitShaShort } = require("../../startup/startupProcessMarker");
const { getDeploymentEnvMode } = require("../../church/blessBoardEnv");

const VERSION_BASE = "1.01";

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
 *   versionBase: string,
 *   build: string,
 *   version: string,
 *   environment: "testing"|"production",
 *   environmentLabel: string,
 * }}
 */
function getApplicationBuildInfo(options) {
  const opts = options || {};
  const env = opts.env || process.env;
  const build = resolveBuildSha(opts);
  const environment = getDeploymentEnvMode(env);
  const environmentLabel =
    environment.charAt(0).toUpperCase() + environment.slice(1);

  return {
    versionBase: VERSION_BASE,
    build,
    version: `${VERSION_BASE}.${build}`,
    environment,
    environmentLabel,
  };
}

module.exports = {
  VERSION_BASE,
  getApplicationBuildInfo,
};
