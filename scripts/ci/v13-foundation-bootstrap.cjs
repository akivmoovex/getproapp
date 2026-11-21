"use strict";

/**
 * V13 regression wrapper around the supported Foundation bootstrap.
 * The disposable-database guard runs before foundationBootstrap.js is loaded,
 * so pg is not imported when authorization or the target identity is rejected.
 *
 * Production bootstrap remains `npm run db:bootstrap:foundation`.
 * This file does not create a database and does not run unless invoked as the CLI.
 *
 * Supported sequence, unchanged inside bootstrapFoundation:
 * platform, blessboard, activeclinic, getpro, ngo migrations,
 * then platform.database_identity initialization, then seeds 001–011.
 */

const TARGET_DATABASE_NAME = "getpro_v13_e2e_regression213101";
const TARGET_IDENTITY_KEY = "moovex-platform-v7";

function assertV13RegressionBootstrapEnv(env) {
  const { resolveDisposableConnectionString } = require("../../tests/v13/helpers/v13CiDatabaseGuard");
  const {
    assertIsolatedBootstrapLaunch,
  } = require("../../tests/v13/helpers/v13IsolatedExecutionPlan");
  if (String(env.FOUNDATION_ALLOW_LOCALHOST || "") !== "1") {
    throw new Error("V13_CI_DB_GUARD: FOUNDATION_ALLOW_LOCALHOST=1 is required");
  }
  if (String(env.GETPRO_PG_SSL || "") !== "off") {
    throw new Error("V13_CI_DB_GUARD: GETPRO_PG_SSL=off is required");
  }
  if (String(env.DATABASE_IDENTITY_EXPECTED || "").trim() !== TARGET_IDENTITY_KEY) {
    throw new Error("V13_CI_DB_GUARD: DATABASE_IDENTITY_EXPECTED must be moovex-platform-v7");
  }
  const target = resolveDisposableConnectionString(env);
  if (target.database !== TARGET_DATABASE_NAME) {
    throw new Error(
      `V13_CI_DB_GUARD: refusing unexpected database name "${target.database}" (expected ${TARGET_DATABASE_NAME})`
    );
  }
  if (target.hostname !== "127.0.0.1" && target.hostname !== "localhost" && target.hostname !== "::1") {
    throw new Error("V13_CI_DB_GUARD: refusing non-local host");
  }
  const isolated = assertIsolatedBootstrapLaunch(env);
  if (isolated.database !== target.database || isolated.host !== "127.0.0.1") {
    throw new Error("V13_CI_DB_GUARD: isolated preflight disagreed with the disposable target");
  }
  return {
    connectionString: target.connectionString,
    database: target.database,
    hostname: target.hostname,
    port: isolated.port,
    instanceId: isolated.instanceId,
    dataDir: isolated.dataDir,
  };
}

function assertConfigurationUnchanged(env, locked) {
  const current = assertV13RegressionBootstrapEnv(env);
  if (
    current.connectionString !== locked.connectionString ||
    current.database !== locked.database ||
    current.hostname !== locked.hostname ||
    current.port !== locked.port ||
    current.instanceId !== locked.instanceId ||
    current.dataDir !== locked.dataDir
  ) {
    throw new Error("V13_CI_DB_GUARD: database configuration changed after validation");
  }
  return current;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, loadBootstrap?: Function, beforeLoad?: Function, log?: Function }} [options]
 */
async function runV13FoundationBootstrap(options = {}) {
  const env = options.env || process.env;
  const locked = assertV13RegressionBootstrapEnv(env);
  if (typeof options.beforeLoad === "function") options.beforeLoad(env);
  assertConfigurationUnchanged(env, locked);
  const load = options.loadBootstrap || (() => require("../../db/scripts/lib/foundationBootstrap"));
  const api = load();
  assertConfigurationUnchanged(env, locked);
  return api.bootstrapFoundation({
    env,
    connectionString: locked.connectionString,
    identityKey: TARGET_IDENTITY_KEY,
    environmentCode: "testing",
    log: options.log,
  });
}

async function main() {
  try {
    const result = await runV13FoundationBootstrap({ env: process.env });
    if (!result || result.ok !== true) {
      process.stderr.write("V13_FOUNDATION_BOOTSTRAP_FAILED\n");
      process.exit(1);
    }
    process.stdout.write("V13_FOUNDATION_BOOTSTRAP_OK\n");
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (/postgres(ql)?:\/\//i.test(message)) {
      process.stderr.write("V13_CI_DB_GUARD: bootstrap rejected without a printed connection string\n");
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  TARGET_DATABASE_NAME,
  TARGET_IDENTITY_KEY,
  assertV13RegressionBootstrapEnv,
  runV13FoundationBootstrap,
};
