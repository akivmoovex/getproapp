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
 * Explicit DEPLOYMENT_ENV (lowercased), or profile-derived environment when authoritative,
 * or "" when unset (legacy). Unlike getDeploymentEnvMode(), local development without a
 * profile leaves enforcement skipped when DEPLOYMENT_ENV is empty.
 */
function explicitDeploymentEnv() {
  const {
    getDeploymentProfile,
    hasAuthoritativeDeploymentProfile,
  } = require("../platform/config/deploymentProfiles");
  if (hasAuthoritativeDeploymentProfile()) {
    const profile = getDeploymentProfile();
    const raw = String(process.env.DEPLOYMENT_ENV || "").trim().toLowerCase();
    return raw || profile.deploymentEnvironment;
  }
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
  const {
    isBlessBoardV5PlatformDeployment,
  } = require("../church/blessBoardEnv");
  const enforce =
    isBlessBoardOrgTestingDeployment() || isBlessBoardV5PlatformDeployment();
  if (!enforce) return;

  if (isBlessBoardOrgTestingDeployment()) {
    logBlessBoardOrgDbIsolationDiagnostics(boot);
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `[blessboard] V5 platform DB isolation check: deployment environment=${getDeploymentEnv()} ` +
        `canonical=${getBlessBoardCanonicalDomain()} DATABASE_URL=${envStringIsSet(process.env.DATABASE_URL) ? "yes" : "no"}`
    );
  }

  const expectedCheck = validateExpectedDatabaseEnv();
  if (!expectedCheck.ok) {
    // eslint-disable-next-line no-console
    console.error(
      `[blessboard] FATAL: EXPECTED_DATABASE_ENV=${expectedCheck.expected} does not match DEPLOYMENT_ENV=${expectedCheck.actual}. ` +
        `BlessBoard V5 deployments require these markers to agree (application environment marker).`
    );
    process.exit(1);
  }

  if (!envStringIsSet(process.env.DATABASE_URL)) {
    const getproPresent = envStringIsSet(process.env.GETPRO_DATABASE_URL);
    // eslint-disable-next-line no-console
    console.error(
      "[blessboard] FATAL: BlessBoard V5 deployment requires an explicit DATABASE_URL. " +
        "GETPRO_DATABASE_URL fallback is disabled for this deployment to protect the wrong database. " +
        `GETPRO_DATABASE_URL present: ${getproPresent ? "yes" : "no"} (ignored). ` +
        "Set DATABASE_URL to the dedicated database for this deployment profile."
    );
    process.exit(1);
  }
}

/**
 * Verify platform.database_identity.environment_code matches the active profile
 * (or explicit DEPLOYMENT_ENV) for V5 foundation HTTP startup.
 * Pure logic + DB read — no process.exit (see assertPlatformDatabaseIdentityOrExit).
 * @param {import("pg").Pool|null} pool
 * @param {{ expectedEnvironment?: string }} [opts]
 * @returns {Promise<{ status: "skip"|"ok"|"fatal", reason: string, sanitizedMessage: string, expectedEnvironment?: string, identity?: object|null }>}
 */
async function verifyPlatformDatabaseIdentity(pool, opts = {}) {
  const {
    getDeploymentProfile,
    hasAuthoritativeDeploymentProfile,
  } = require("../platform/config/deploymentProfiles");
  const { isV5FoundationMode } = require("../platform/config/v5FoundationMode");
  const {
    normalizeIdentityKey,
    validateIdentityKey,
  } = require("../../db/scripts/lib/databaseIdentity");

  let expected =
    opts.expectedEnvironment != null
      ? String(opts.expectedEnvironment).trim().toLowerCase()
      : "";
  const profile = hasAuthoritativeDeploymentProfile()
    ? getDeploymentProfile()
    : null;
  if (!expected && profile) {
    expected = profile.expectedDatabaseEnvironment
      ? String(profile.expectedDatabaseEnvironment).trim().toLowerCase()
      : "";
  }
  if (!expected) {
    expected = explicitDeploymentEnv();
  }

  let expectedIdentityKey =
    opts.expectedIdentityKey != null
      ? String(opts.expectedIdentityKey).trim().toLowerCase()
      : "";
  if (!expectedIdentityKey && profile && profile.expectedIdentityKey) {
    expectedIdentityKey = String(profile.expectedIdentityKey).trim().toLowerCase();
  }
  if (!expectedIdentityKey) {
    expectedIdentityKey = String(process.env.DATABASE_IDENTITY_EXPECTED || "")
      .trim()
      .toLowerCase();
  }

  if (!isV5FoundationMode() && !hasAuthoritativeDeploymentProfile()) {
    return {
      status: "skip",
      reason: "not-v5-foundation",
      sanitizedMessage: "[blessboard] Platform DB identity check skipped (not V5 foundation).",
    };
  }

  if (!IDENTITY_ENFORCED_ENVS.includes(expected)) {
    return {
      status: "skip",
      reason: "deployment-env-not-enforced",
      expectedEnvironment: expected,
      sanitizedMessage: `[blessboard] Platform DB identity check skipped (expected env=${expected || "(unset)"}).`,
    };
  }

  if (!pool) {
    return {
      status: "fatal",
      reason: "no-pool",
      expectedEnvironment: expected,
      expectedIdentityKey: expectedIdentityKey || null,
      sanitizedMessage:
        `[blessboard] FATAL: V5 foundation requires a verified platform.database_identity ` +
        `(expected environment_code=${expected}` +
        `${expectedIdentityKey ? `, identity_key=${expectedIdentityKey}` : ""}), ` +
        `but no PostgreSQL pool is configured.`,
    };
  }

  const hostFingerprint = redactDatabaseHostFingerprint(getDatabaseUrl());
  const { readIdentityRow, identityTableExists } = require("../../db/scripts/lib/databaseIdentity");

  try {
    if (!(await identityTableExists(pool))) {
      return {
        status: "fatal",
        reason: "identity-table-missing",
        expectedEnvironment: expected,
        expectedIdentityKey: expectedIdentityKey || null,
        sanitizedMessage:
          `[blessboard] FATAL: platform.database_identity is missing (host ${hostFingerprint}). ` +
          `Expected environment_code=${expected}` +
          `${expectedIdentityKey ? ` identity_key=${expectedIdentityKey}` : ""}. ` +
          `Run foundation migrations / identity init before serving traffic.`,
      };
    }
  } catch (err) {
    const code = err && err.code ? String(err.code) : "unknown";
    return {
      status: "fatal",
      reason: "read-error",
      expectedEnvironment: expected,
      sanitizedMessage:
        `[blessboard] FATAL: could not inspect platform.database_identity ` +
        `(host ${hostFingerprint}, error code ${code}). Refusing to start unverified.`,
    };
  }

  let row;
  try {
    row = await readIdentityRow(pool);
  } catch (err) {
    const code = err && err.code ? String(err.code) : "unknown";
    return {
      status: "fatal",
      reason: "read-error",
      expectedEnvironment: expected,
      sanitizedMessage:
        `[blessboard] FATAL: could not read platform.database_identity ` +
        `(host ${hostFingerprint}, error code ${code}). Refusing to start unverified.`,
    };
  }

  if (!row) {
    return {
      status: "fatal",
      reason: "missing",
      expectedEnvironment: expected,
      expectedIdentityKey: expectedIdentityKey || null,
      identity: null,
      sanitizedMessage:
        `[blessboard] FATAL: no platform.database_identity row (host ${hostFingerprint}). ` +
        `Expected environment_code=${expected}` +
        `${expectedIdentityKey ? ` identity_key=${expectedIdentityKey}` : ""}. ` +
        `Run: npm run db:identity:init.`,
    };
  }

  const actual = String(row.environment_code || "")
    .trim()
    .toLowerCase();
  if (actual !== expected) {
    return {
      status: "fatal",
      reason: "mismatch",
      expectedEnvironment: expected,
      expectedIdentityKey: expectedIdentityKey || null,
      identity: row,
      sanitizedMessage:
        `[blessboard] FATAL: DATABASE_IDENTITY_MISMATCH (host ${hostFingerprint}). ` +
        `This database is marked environment_code=${actual}, but the deployment profile expects ${expected}. ` +
        "Refusing to start against the wrong database.",
    };
  }

  if (expectedIdentityKey) {
    const keyCheck = validateIdentityKey(expectedIdentityKey);
    if (!keyCheck.ok) {
      return {
        status: "fatal",
        reason: "invalid-expected-identity-key",
        expectedEnvironment: expected,
        expectedIdentityKey,
        identity: row,
        sanitizedMessage:
          `[blessboard] FATAL: expected identity_key ${JSON.stringify(expectedIdentityKey)} is invalid.`,
      };
    }
    const actualKey = row.identity_key ? normalizeIdentityKey(row.identity_key) : "";
    if (actualKey !== keyCheck.key) {
      return {
        status: "fatal",
        reason: "identity-key-mismatch",
        expectedEnvironment: expected,
        expectedIdentityKey: keyCheck.key,
        identity: row,
        sanitizedMessage:
          `[blessboard] FATAL: DATABASE_IDENTITY_MISMATCH (host ${hostFingerprint}). ` +
          `identity_key database=${actualKey || "(null)"} expected=${keyCheck.key} ` +
          `with environment_code=${actual}. Both identity_key and environment_code must match.`,
      };
    }
  }

  return {
    status: "ok",
    reason: "verified",
    expectedEnvironment: expected,
    expectedIdentityKey: expectedIdentityKey || null,
    identity: row,
    sanitizedMessage:
      `[blessboard] Platform database identity verified: environment_code=${actual}` +
      `${expectedIdentityKey ? ` identity_key=${expectedIdentityKey}` : ""} ` +
      `host=${hostFingerprint}.`,
  };
}

/**
 * Enforce {@link verifyPlatformDatabaseIdentity} at V5 foundation startup.
 * @param {import("pg").Pool|null} pool
 * @param {{ expectedEnvironment?: string, exit?: (code:number)=>void, logger?: { log: Function, error: Function } }} [opts]
 */
async function assertPlatformDatabaseIdentityOrExit(pool, opts = {}) {
  const exit = typeof opts.exit === "function" ? opts.exit : (code) => process.exit(code);
  const logger = opts.logger || console;
  const result = await verifyPlatformDatabaseIdentity(pool, opts);
  if (result.status === "fatal") {
    logger.error(result.sanitizedMessage);
    exit(1);
    return result;
  }
  if (result.status === "ok") {
    logger.log(result.sanitizedMessage);
  }
  return result;
}

/**
 * Verify the singleton church_database_identity row matches the deployment environment.
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
  verifyPlatformDatabaseIdentity,
  assertPlatformDatabaseIdentityOrExit,
};
