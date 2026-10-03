#!/usr/bin/env node
"use strict";

/**
 * Destructive production reset followed by the repository migration chain.
 * Refuses by default. Never prints DATABASE_URL.
 */
const { Pool } = require("pg");
const { migrate, statusReadOnly } = require("./lib/migrator");
const {
  checkDatabaseIdentity,
  ensureDatabaseIdentity,
} = require("./lib/databaseIdentity");
const { verifyCanonicalFreshSchema } = require("./lib/canonicalMigrationBaseline");
const backupService = require("../../src/services/church/churchBackupVerificationService");

const EXPECTED_IDENTITY = "moovex-platform-v7";
const EXPECTED_ENVIRONMENT = "production";
const APPLICATION_SCHEMAS = ["platform", "blessboard", "activeclinic", "getpro", "ngo"];

function gateEnvironment(env = process.env) {
  const failures = [];
  if (env.PRODUCTION_RESET_CONFIRMED !== "YES") failures.push("missing_production_reset_confirmation");
  if (env.PROCEED_PRODUCTION_RESET !== "YES") failures.push("missing_destructive_confirmation");
  if (String(env.NODE_ENV || "").toLowerCase() !== "production") failures.push("node_env_not_production");
  if (String(env.DEPLOYMENT_ENV || "").toLowerCase() !== EXPECTED_ENVIRONMENT) {
    failures.push("deployment_env_not_production");
  }
  return failures;
}

function assertBackupStatus(status) {
  if (!status || status.status !== "recorded" || status.health !== "ok" ||
      !status.lastSuccessfulBackupAt || !status.lastSuccessfulBackupEvidence) {
    throw new Error("backup_verification_missing_or_stale");
  }
}

async function assertProductionTarget(pool) {
  const result = await checkDatabaseIdentity(pool, { identityKey: EXPECTED_IDENTITY });
  if (!result.ok || result.row.environment_code !== EXPECTED_ENVIRONMENT) {
    throw new Error("production_database_identity_or_environment_mismatch");
  }
  return result.row;
}

async function resetApplicationSchemas(pool) {
  for (const schema of APPLICATION_SCHEMAS) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  }
}

async function run({ pool: suppliedPool, env = process.env } = {}) {
  const failures = gateEnvironment(env);
  if (failures.length) throw new Error(`safety_gate_failed:${failures.join(",")}`);
  if (!env.DATABASE_URL) throw new Error("DATABASE_URL_required");

  const ownsPool = !suppliedPool;
  const db = suppliedPool || new Pool({ connectionString: env.DATABASE_URL, max: 2 });
  try {
    const identity = await assertProductionTarget(db);
    const backup = await backupService.getBackupVerificationStatus(db);
    assertBackupStatus(backup);
    console.log(JSON.stringify({
      ready: true,
      identity: identity.identity_key,
      environment: identity.environment_code,
      backup: "verified",
      reset: "executing",
    }));
    await resetApplicationSchemas(db);
    await migrate({ pool: db, phase: "migrations" });
    const initialized = await ensureDatabaseIdentity(db, {
      connectionString: env.DATABASE_URL,
      identityKey: EXPECTED_IDENTITY,
      environmentCode: EXPECTED_ENVIRONMENT,
    });
    if (!initialized.ok) throw new Error("production_identity_initialization_failed");
    await migrate({ pool: db, phase: "seeds" });
    await assertProductionTarget(db);
    const verify = await verifyCanonicalFreshSchema(db);
    const status = await statusReadOnly({ pool: db });
    if (!verify.ok || status.pending !== 0 || status.drift !== 0) {
      throw new Error("post_reset_schema_verification_failed");
    }
    console.log(JSON.stringify({ ok: true, pending: status.pending, drift: status.drift }));
  } finally {
    if (ownsPool) await db.end();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error(`[db:production-fresh-bootstrap] ${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  APPLICATION_SCHEMAS,
  EXPECTED_IDENTITY,
  EXPECTED_ENVIRONMENT,
  gateEnvironment,
  assertBackupStatus,
  assertProductionTarget,
  resetApplicationSchemas,
  run,
};
