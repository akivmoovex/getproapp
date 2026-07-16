"use strict";

/**
 * BlessBoard.org (V5) database isolation gate.
 *
 * When DEPLOYMENT_ENV=testing and BLESSBOARD_CANONICAL_DOMAIN=blessboard.org:
 * - DATABASE_URL must be set explicitly
 * - GETPRO_DATABASE_URL must not be used as a silent fallback
 *
 * Logs never include credentials or full connection strings.
 */

const {
  getBlessBoardCanonicalDomain,
  getDeploymentEnv,
  isBlessBoardOrgTestingDeployment,
  validateExpectedDatabaseEnv,
} = require("../church/blessBoardEnv");
const {
  envStringIsSet,
  summarizeDatabaseUrlEnv,
  redactDatabaseHostFingerprint,
  getDatabaseUrl,
} = require("../db/pg/pool");

/**
 * Safe startup log for BlessBoard.org testing isolation (presence + redacted host only).
 */
function logBlessBoardOrgDbIsolationDiagnostics() {
  if (!isBlessBoardOrgTestingDeployment()) return;

  const hasDatabaseUrl = envStringIsSet(process.env.DATABASE_URL);
  const summary = summarizeDatabaseUrlEnv();
  let hostFingerprint = "(none)";
  if (hasDatabaseUrl) {
    hostFingerprint = redactDatabaseHostFingerprint(getDatabaseUrl());
  }

  const lines = [
    "[blessboard] V5 org testing DB isolation check:",
    `  deployment environment: ${getDeploymentEnv()}`,
    `  canonical domain: ${getBlessBoardCanonicalDomain()}`,
    `  database configuration present: ${hasDatabaseUrl ? "yes" : "no"}`,
    `  database host fingerprint: ${hostFingerprint}`,
    `  effective DB env source: ${summary.effectiveSource}`,
    `  GETPRO_DATABASE_URL fallback: disabled for this deployment`,
  ];
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

/**
 * Exit 1 when BlessBoard.org testing deployment is misconfigured.
 * No-op for V4 / non-testing deployments.
 * @param {object} [boot]
 */
function assertBlessBoardOrgDbIsolationOrExit(boot) {
  if (!isBlessBoardOrgTestingDeployment()) return;

  logBlessBoardOrgDbIsolationDiagnostics(boot);

  const expectedCheck = validateExpectedDatabaseEnv();
  if (!expectedCheck.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[blessboard] FATAL: EXPECTED_DATABASE_ENV=${expectedCheck.expected} does not match DEPLOYMENT_ENV=${expectedCheck.actual}. ` +
        `BlessBoard.org testing deployments require these markers to agree (application environment marker).`
    );
    process.exit(1);
  }

  if (!envStringIsSet(process.env.DATABASE_URL)) {
    const getproPresent = envStringIsSet(process.env.GETPRO_DATABASE_URL);
    // eslint-disable-next-line no-console
    console.error(
      "[blessboard] FATAL: BlessBoard.org testing deployment requires an explicit DATABASE_URL. " +
        "GETPRO_DATABASE_URL fallback is disabled for this deployment to protect the production database. " +
        `GETPRO_DATABASE_URL present: ${getproPresent ? "yes" : "no"} (ignored). ` +
        "Set DATABASE_URL to the dedicated testing database for blessboard.org / V5."
    );
    process.exit(1);
  }
}

module.exports = {
  logBlessBoardOrgDbIsolationDiagnostics,
  assertBlessBoardOrgDbIsolationOrExit,
};
