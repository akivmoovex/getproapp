"use strict";

/**
 * Safe process identity marker for distinguishing stale vs fresh Hostinger workers.
 */

const fs = require("fs");
const path = require("path");
const {
  fingerprintEffectiveDatabaseUrl,
} = require("./databaseUrlFingerprint");

function readGitShaShort(appRoot) {
  const fromEnv =
    String(process.env.GETPRO_GIT_SHA || process.env.GIT_SHA || "").trim() ||
    String(process.env.COMMIT_SHA || "").trim();
  if (fromEnv) return fromEnv.slice(0, 12);
  try {
    const headPath = path.join(appRoot || process.cwd(), ".git", "HEAD");
    if (!fs.existsSync(headPath)) return "(unavailable)";
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.slice(4).trim();
      const refPath = path.join(appRoot || process.cwd(), ".git", ref);
      if (fs.existsSync(refPath)) {
        return fs.readFileSync(refPath, "utf8").trim().slice(0, 12);
      }
      return "(ref-unavailable)";
    }
    return head.slice(0, 12);
  } catch (_err) {
    return "(unavailable)";
  }
}

/**
 * @param {{
 *   appRoot?: string,
 *   env?: NodeJS.ProcessEnv,
 *   phase?: string,
 * }} [opts]
 */
function buildStartupProcessMarker(opts) {
  const options = opts || {};
  const env = options.env || process.env;
  const fp = fingerprintEffectiveDatabaseUrl(env);
  return {
    phase: options.phase || "bootstrap",
    gitSha: readGitShaShort(options.appRoot),
    pid: process.pid,
    ppid: typeof process.ppid === "number" ? process.ppid : null,
    startedAt: new Date().toISOString(),
    nodeEnv: String(env.NODE_ENV || "(unset)"),
    deploymentEnv: String(env.DEPLOYMENT_ENV || "(unset)"),
    deploymentCode: String(env.PLATFORM_DEPLOYMENT_CODE || "(unset)"),
    databaseIdentityExpected: String(env.DATABASE_IDENTITY_EXPECTED || "(unset)"),
    databaseIdentityEnv: String(env.DATABASE_IDENTITY_ENV || "(unset)"),
    databaseHost: fp.fingerprint.hostname || "(none)",
    databaseSourceVar: fp.sourceVar,
  };
}

/**
 * @param {ReturnType<typeof buildStartupProcessMarker>} marker
 */
function formatStartupProcessMarkerLog(marker) {
  return (
    `[getpro] processMarker phase=${marker.phase} gitSha=${marker.gitSha} ` +
    `pid=${marker.pid} ppid=${marker.ppid != null ? marker.ppid : "n/a"} ` +
    `startedAt=${marker.startedAt} NODE_ENV=${marker.nodeEnv} ` +
    `DEPLOYMENT_ENV=${marker.deploymentEnv} PLATFORM_DEPLOYMENT_CODE=${marker.deploymentCode} ` +
    `DATABASE_IDENTITY_EXPECTED=${marker.databaseIdentityExpected} ` +
    `DATABASE_IDENTITY_ENV=${marker.databaseIdentityEnv} ` +
    `databaseHost=${marker.databaseHost} databaseSourceVar=${marker.databaseSourceVar}`
  );
}

module.exports = {
  readGitShaShort,
  buildStartupProcessMarker,
  formatStartupProcessMarkerLog,
};
