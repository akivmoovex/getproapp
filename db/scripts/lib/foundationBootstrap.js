"use strict";

/**
 * Human-run foundation bootstrap orchestration.
 * Never invoked from application startup.
 */

const { Pool } = require("pg");
const { envStringIsSet } = require("./databaseUrl");
const { sanitizeHostFingerprint } = require("./hostFingerprint");
const { assertSafeFoundationDatabaseHost } = require("./foundationHostSafety");
const { buildFoundationPoolConfig, getFoundationPoolOptions } = require("./foundationPool");
const { migrate, statusReadOnly } = require("./migrator");
const {
  ALLOWED_ENVS,
  validateIdentityKey,
  validateEnvironmentCode,
  ensureDatabaseIdentity,
} = require("./databaseIdentity");
const { verifyFoundation } = require("./foundationVerify");

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @param {{ connectionString?: string, identityKey?: string, environmentCode?: string }} [overrides]
 */
function resolveBootstrapInputs(env, overrides = {}) {
  const source = env || process.env;
  const errors = [];

  let connectionString = overrides.connectionString
    ? String(overrides.connectionString).trim()
    : envStringIsSet(source.DATABASE_URL)
      ? String(source.DATABASE_URL).trim()
      : "";
  if (!connectionString) {
    errors.push("DATABASE_URL is required");
  }

  const identityRaw =
    overrides.identityKey != null
      ? overrides.identityKey
      : source.DATABASE_IDENTITY_EXPECTED;
  const identityCheck = validateIdentityKey(identityRaw);
  if (!identityCheck.ok) {
    errors.push("DATABASE_IDENTITY_EXPECTED is required (e.g. blessboard-platform-v5)");
  }

  const envRaw =
    overrides.environmentCode != null
      ? overrides.environmentCode
      : source.DATABASE_IDENTITY_ENV || "testing";
  const envCheck = validateEnvironmentCode(envRaw);
  if (!envCheck.ok) {
    errors.push(`DATABASE_IDENTITY_ENV must be one of: ${ALLOWED_ENVS.join(", ")}`);
  }

  let hostFingerprint = "(none)";
  let sslLabel = "(n/a)";
  if (connectionString) {
    hostFingerprint = sanitizeHostFingerprint(connectionString);
    sslLabel = getFoundationPoolOptions(connectionString).sslLabel;
    const hostCheck = assertSafeFoundationDatabaseHost(connectionString, source);
    if (!hostCheck.ok) {
      errors.push(
        `Refusing DATABASE_URL host "${hostCheck.host || "(empty)"}" (${hostCheck.reason}). ` +
          "Use the real Supabase host, or set FOUNDATION_ALLOW_LOCALHOST=1 for local tests."
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    connectionString,
    identityKey: identityCheck.ok ? identityCheck.key : null,
    environmentCode: envCheck.ok ? envCheck.env : null,
    hostFingerprint,
    sslLabel,
  };
}

/**
 * @param {{
 *   connectionString?: string,
 *   identityKey?: string,
 *   environmentCode?: string,
 *   env?: NodeJS.ProcessEnv,
 *   log?: (line: string) => void,
 * }} [opts]
 */
async function bootstrapFoundation(opts = {}) {
  const env = opts.env || process.env;
  const log = typeof opts.log === "function" ? opts.log : (line) => console.log(line);
  const inputs = resolveBootstrapInputs(env, {
    connectionString: opts.connectionString,
    identityKey: opts.identityKey,
    environmentCode: opts.environmentCode,
  });

  if (!inputs.ok) {
    return { ok: false, code: "invalid_inputs", errors: inputs.errors, host_fingerprint: inputs.hostFingerprint };
  }

  log(`[db:bootstrap:foundation] host_fingerprint=${inputs.hostFingerprint}`);
  log(`[db:bootstrap:foundation] ssl=${inputs.sslLabel}`);
  log(
    `[db:bootstrap:foundation] identity_key=${inputs.identityKey} environment_code=${inputs.environmentCode}`
  );

  const pool = new Pool(buildFoundationPoolConfig(inputs.connectionString, { max: 2 }));
  try {
    await pool.query("SELECT 1 AS ok");

    const migrateSummary = await migrate({ pool });
    log(
      `[db:bootstrap:foundation] migrate applied=${migrateSummary.applied.length} skipped=${migrateSummary.skipped.length} seeds_applied=${migrateSummary.seedsApplied.length} seeds_skipped=${migrateSummary.seedsSkipped.length}`
    );

    const identityResult = await ensureDatabaseIdentity(pool, {
      connectionString: inputs.connectionString,
      identityKey: inputs.identityKey,
      environmentCode: inputs.environmentCode,
    });
    if (!identityResult.ok) {
      return {
        ok: false,
        code: identityResult.code,
        errors: [identityResult.message],
        host_fingerprint: inputs.hostFingerprint,
        migrate: migrateSummary,
        identity: identityResult,
      };
    }
    log(`[db:bootstrap:foundation] identity result=${identityResult.result}`);

    const verify = await verifyFoundation(pool, { identityKey: inputs.identityKey });
    if (!verify.ok) {
      return {
        ok: false,
        code: "verify_failed",
        errors: verify.failures,
        host_fingerprint: inputs.hostFingerprint,
        migrate: migrateSummary,
        identity: identityResult,
        verify,
      };
    }

    const migStatus = await statusReadOnly({ pool });
    if (migStatus.drift > 0 || migStatus.pending > 0) {
      return {
        ok: false,
        code: "migration_status_failed",
        errors: [
          migStatus.drift > 0 ? "checksum_drift" : null,
          migStatus.pending > 0 ? "migrations_pending" : null,
        ].filter(Boolean),
        host_fingerprint: inputs.hostFingerprint,
        migrate: migrateSummary,
        identity: identityResult,
        verify,
        status: migStatus,
      };
    }

    return {
      ok: true,
      host_fingerprint: inputs.hostFingerprint,
      identity_key: inputs.identityKey,
      environment_code: inputs.environmentCode,
      migrate: migrateSummary,
      identity: {
        result: identityResult.result,
        identity_key: identityResult.row && identityResult.row.identity_key,
        environment_code: identityResult.row && identityResult.row.environment_code,
        database_name: identityResult.row && identityResult.row.database_name,
        host_fingerprint: identityResult.row && identityResult.row.host_fingerprint,
      },
      verify: { ok: true, failures: [] },
      status: {
        applied: migStatus.applied,
        pending: migStatus.pending,
        drift: migStatus.drift,
        total: migStatus.total,
      },
    };
  } finally {
    await pool.end();
  }
}

module.exports = {
  resolveBootstrapInputs,
  bootstrapFoundation,
};
