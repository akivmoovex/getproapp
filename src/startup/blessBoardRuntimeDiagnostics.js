"use strict";

/**
 * Safe BlessBoard runtime-resource isolation diagnostics (no secrets).
 */

const {
  getBlessBoardCanonicalDomain,
  getDeploymentEnv,
  getSessionCookieName,
  getUploadRootLogLabel,
  areBlessBoardJobsEnabled,
} = require("../church/blessBoardEnv");

/**
 * Log deployment / cookie / upload / jobs configuration at startup.
 * Safe for all hosts (V4 defaults included).
 */
function logBlessBoardRuntimeIsolationDiagnostics() {
  const lines = [
    "[blessboard] runtime isolation:",
    `  deployment environment: ${getDeploymentEnv()}`,
    `  canonical domain: ${getBlessBoardCanonicalDomain()}`,
    `  session cookie name: ${getSessionCookieName()}`,
    `  upload root: ${getUploadRootLogLabel()}`,
    `  scheduled jobs enabled: ${areBlessBoardJobsEnabled() ? "yes" : "no"}`,
  ];
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

module.exports = {
  logBlessBoardRuntimeIsolationDiagnostics,
};
