"use strict";

/**
 * Safe BlessBoard runtime-resource isolation diagnostics (no secrets).
 */

const {
  getBlessBoardDomainDiagnostics,
  getSessionCookieName,
  getUploadRootLogLabel,
  areBlessBoardJobsEnabled,
} = require("../church/blessBoardEnv");

/**
 * Log deployment / domain / cookie / upload / jobs configuration at startup.
 * Safe for all hosts (V4 defaults included).
 */
function logBlessBoardRuntimeIsolationDiagnostics() {
  const d = getBlessBoardDomainDiagnostics();
  const lines = [
    "[blessboard] runtime isolation:",
    `  deployment environment: ${d.deploymentEnv}`,
    `  canonical domain: ${d.canonicalDomain}`,
    `  apex domains: ${d.apexDomains}`,
    `  church host domain: ${d.churchHostDomain}`,
    `  public URL: ${d.publicUrl}`,
    `  canonical redirect enabled: ${d.canonicalRedirectEnabled ? "yes" : "no"}`,
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
