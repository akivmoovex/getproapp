"use strict";

/**
 * Read-only platform deployment registry for platform-admin.
 * Safe catalogue fields only — never session cookie names or secrets.
 */

const repo = require("../repositories/platformAdminRepository");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");

const STATUS = Object.freeze({
  OK: "ok",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * @param {object} row
 */
function presentDeployment(row) {
  if (!row) return null;
  return {
    deploymentCode: String(row.deployment_code || ""),
    applicationCode: String(row.application_code || ""),
    releaseVersion: String(row.release_version || ""),
    canonicalDomain: String(row.canonical_domain || ""),
    environmentCode: String(row.environment_code || ""),
    status: String(row.status || ""),
    jobsEnabled: Boolean(row.jobs_enabled),
    databaseAccessMode: String(row.database_access_mode || ""),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {NodeJS.ProcessEnv} [env]
 */
async function listPlatformDeployments(db, env) {
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      deployments: [],
      currentDeploymentCode: null,
    };
  }
  try {
    const rows = await repo.listDeploymentsSafe(db);
    const current = getPlatformDeploymentCode(env || process.env);
    return {
      ok: true,
      status: STATUS.OK,
      deployments: (rows || []).map(presentDeployment).filter(Boolean),
      currentDeploymentCode: current && current.ok ? current.code : null,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      deployments: [],
      currentDeploymentCode: null,
    };
  }
}

module.exports = {
  STATUS,
  presentDeployment,
  listPlatformDeployments,
};
