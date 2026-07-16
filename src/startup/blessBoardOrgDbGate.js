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
const { getDatabaseIdentity } = require("../db/pg/church/databaseIdentityRepo");

const IDENTITY_ENFORCED_ENVS = Object.freeze(["testing", "production"]);

/**
 * Explicit DEPLOYMENT_ENV (lowercased), or "" when unset.
 * Unlike getDeploymentEnvMode(), this never derives production from NODE_ENV — the
 * database-identity gate only enforces when DEPLOYMENT_ENV is literally testing/production,
 * so local dev (development) and NODE_ENV=test are left untouched.
 */
function explicitDeploymentEnv() {
  return String(process.env.DEPLOYMENT_ENV || "").trim().toLowerCase();
}

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

/**
 * Verify the singleton database identity row matches the deployment environment.
 *
 * Only enforced when DEPLOYMENT_ENV is explicitly "testing" or "production".
 * Fails closed: a missing identity, a mismatched identity, or a database that cannot
 * be read all return a fatal verdict, so a testing deployment can never proceed against
 * a database marked production (and vice versa).
 *
 * Pure logic + a single DB read — no process.exit here (see assertBlessBoardDatabaseIdentityOrExit).
 * @param {import("pg").Pool|null} pool
 * @param {{ deploymentEnv?: string }} [opts]
 * @returns {Promise<{ status: "skip"|"ok"|"fatal", reason: string, sanitizedMessage: string, identity?: object|null, deploymentEnv?: string }>}
 */
async function verifyDatabaseIdentity(pool, opts = {}) {
  const deploymentEnv =
    opts.deploymentEnv != null ? String(opts.deploymentEnv).trim().toLowerCase() : explicitDeploymentEnv();

  if (!IDENTITY_ENFORCED_ENVS.includes(deploymentEnv)) {
    return {
      status: "skip",
      reason: "deployment-env-not-enforced",
      deploymentEnv,
      sanitizedMessage: `[blessboard] DB identity check skipped (DEPLOYMENT_ENV=${deploymentEnv || "(unset)"}; only testing/production are enforced).`,
    };
  }

  if (!pool) {
    return {
      status: "fatal",
      reason: "no-pool",
      deploymentEnv,
      sanitizedMessage:
        `[blessboard] FATAL: DEPLOYMENT_ENV=${deploymentEnv} requires a verified database identity, but no PostgreSQL pool is configured. ` +
        "Set an explicit database URL and run: npm run church:db-identity:init.",
    };
  }

  const hostFingerprint = redactDatabaseHostFingerprint(getDatabaseUrl());

  let identity;
  try {
    identity = await getDatabaseIdentity(pool);
  } catch (err) {
    const code = err && err.code ? String(err.code) : "unknown";
    return {
      status: "fatal",
      reason: "read-error",
      deploymentEnv,
      sanitizedMessage:
        `[blessboard] FATAL: could not read database identity to verify DEPLOYMENT_ENV=${deploymentEnv} ` +
        `(host ${hostFingerprint}, error code ${code}). Refusing to start unverified.`,
    };
  }

  if (!identity) {
    return {
      status: "fatal",
      reason: "missing",
      deploymentEnv,
      identity: null,
      sanitizedMessage:
        `[blessboard] FATAL: no database identity is set (host ${hostFingerprint}). ` +
        `DEPLOYMENT_ENV=${deploymentEnv} requires an initialized identity row. ` +
        "Run: npm run church:db-identity:init -- --env " + deploymentEnv + " --confirm.",
    };
  }

  if (identity.environmentCode !== deploymentEnv) {
    return {
      status: "fatal",
      reason: "mismatch",
      deploymentEnv,
      identity,
      sanitizedMessage:
        `[blessboard] FATAL: database identity mismatch (host ${hostFingerprint}). ` +
        `This database is marked environment_code=${identity.environmentCode}, but DEPLOYMENT_ENV=${deploymentEnv}. ` +
        "Refusing to start against the wrong database. Verify DATABASE_URL points at the correct environment.",
    };
  }

  return {
    status: "ok",
    reason: "verified",
    deploymentEnv,
    identity,
    sanitizedMessage:
      `[blessboard] Database identity verified: environment_code=${identity.environmentCode} ` +
      `deployment_name=${identity.deploymentName || "(none)"} instance=${identity.databaseInstanceId} host=${hostFingerprint}.`,
  };
}

/**
 * Enforce {@link verifyDatabaseIdentity} at startup, exiting the process on a fatal verdict.
 * No-op unless DEPLOYMENT_ENV is testing/production.
 * @param {import("pg").Pool|null} pool
 * @param {{ deploymentEnv?: string, exit?: (code:number)=>void, logger?: { log: Function, error: Function } }} [opts]
 */
async function assertBlessBoardDatabaseIdentityOrExit(pool, opts = {}) {
  const exit = typeof opts.exit === "function" ? opts.exit : (code) => process.exit(code);
  const logger = opts.logger || console;

  const result = await verifyDatabaseIdentity(pool, opts);
  if (result.status === "fatal") {
    // eslint-disable-next-line no-console
    logger.error(result.sanitizedMessage);
    exit(1);
    return result;
  }
  if (result.status === "ok") {
    // eslint-disable-next-line no-console
    logger.log(result.sanitizedMessage);
  }
  return result;
}

module.exports = {
  logBlessBoardOrgDbIsolationDiagnostics,
  assertBlessBoardOrgDbIsolationOrExit,
  verifyDatabaseIdentity,
  assertBlessBoardDatabaseIdentityOrExit,
};
