#!/usr/bin/env node
"use strict";

/**
 * TESTING-ONLY migrate wrapper.
 * Loads no secrets into logs. Refuses production. Identity check runs before writes.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing node db/scripts/migrate-testing.js
 */

const { Pool } = require("pg");
const { envStringIsSet, requireDatabaseUrl } = require("./lib/databaseUrl");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const {
  checkDatabaseIdentity,
  validateIdentityKey,
  validateEnvironmentCode,
} = require("./lib/databaseIdentity");
const { migrate } = require("./lib/migrator");

const EXPECTED_KEY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";

/**
 * Env-only gate. Never prints DATABASE_URL or credentials.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function assertTestingMigrateTarget(env) {
  const source = env || process.env;
  if (envStringIsSet(source.GETPRO_DATABASE_URL)) {
    return {
      ok: false,
      code: "getpro_database_url_present",
      message:
        "[db:migrate:testing] Refusing: GETPRO_DATABASE_URL is set. Unset it and use DATABASE_URL (testing) only.",
    };
  }
  const keyCheck = validateIdentityKey(source.DATABASE_IDENTITY_EXPECTED);
  if (!keyCheck.ok || keyCheck.key !== EXPECTED_KEY) {
    return {
      ok: false,
      code: "expected_identity_not_testing",
      message: `[db:migrate:testing] DATABASE_IDENTITY_EXPECTED must be ${EXPECTED_KEY}.`,
    };
  }
  const envCheck = validateEnvironmentCode(source.DATABASE_IDENTITY_ENV);
  if (!envCheck.ok || envCheck.env !== EXPECTED_ENV) {
    return {
      ok: false,
      code: "expected_env_not_testing",
      message: `[db:migrate:testing] DATABASE_IDENTITY_ENV must be ${EXPECTED_ENV}.`,
    };
  }
  const deploymentEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  if (deploymentEnv && deploymentEnv !== EXPECTED_ENV) {
    return {
      ok: false,
      code: "deployment_env_not_testing",
      message: `[db:migrate:testing] DEPLOYMENT_ENV must be ${EXPECTED_ENV} when set.`,
    };
  }
  return { ok: true };
}

async function assertTestingDatabaseIdentity(pool) {
  const identity = await checkDatabaseIdentity(pool, { identityKey: EXPECTED_KEY });
  if (!identity.ok) {
    return {
      ok: false,
      code: identity.code || "identity_failed",
      message: `[db:migrate:testing] ${identity.message || identity.code || "identity check failed"}`,
    };
  }
  const envCode = String((identity.row && identity.row.environment_code) || "")
    .trim()
    .toLowerCase();
  if (envCode === "production") {
    return {
      ok: false,
      code: "production_rejected",
      message:
        "[db:migrate:testing] Refusing: connected database environment_code=production.",
    };
  }
  if (envCode !== EXPECTED_ENV) {
    return {
      ok: false,
      code: "environment_mismatch",
      message: `[db:migrate:testing] Refusing: environment_code=${envCode || "(null)"} is not ${EXPECTED_ENV}.`,
    };
  }
  return {
    ok: true,
    identity_key: identity.row.identity_key,
    environment_code: envCode,
  };
}

async function main() {
  const envGate = assertTestingMigrateTarget(process.env);
  if (!envGate.ok) {
    // eslint-disable-next-line no-console
    console.error(envGate.message);
    process.exit(2);
  }

  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:migrate:testing] ${err.message}`);
    process.exit(1);
  }

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  try {
    const identity = await assertTestingDatabaseIdentity(pool);
    if (!identity.ok) {
      // eslint-disable-next-line no-console
      console.error(identity.message);
      process.exit(2);
    }
    const summary = await migrate({ pool });
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          identity_key: identity.identity_key,
          environment_code: identity.environment_code,
          applied: summary.applied,
          skipped: summary.skipped.length,
          seeds_applied: summary.seedsApplied,
          seeds_skipped: summary.seedsSkipped,
        },
        null,
        2
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:migrate:testing] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  EXPECTED_KEY,
  EXPECTED_ENV,
  assertTestingMigrateTarget,
  assertTestingDatabaseIdentity,
};
