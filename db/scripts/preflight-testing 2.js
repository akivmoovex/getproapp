#!/usr/bin/env node
"use strict";

/**
 * Operator preflight before deploying V7 runtime against the testing database.
 * Does not run migrations. Does not print credentials.
 *
 * Required: DATABASE_URL, DATABASE_IDENTITY_EXPECTED=moovex-platform-v7,
 * DATABASE_IDENTITY_ENV=testing.
 *
 * Usage: scripts/local/run-with-blessboard-env.sh testing node db/scripts/preflight-testing.js
 */

const { Pool } = require("pg");
const { requireDatabaseUrl } = require("./lib/databaseUrl");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const { checkDatabaseIdentity, validateIdentityKey, validateEnvironmentCode } = require("./lib/databaseIdentity");
const { status } = require("./lib/migrator");
const {
  inspectV7RuntimeSchemaCompatibility,
  formatV7RuntimeSchemaCompatibilityLog,
  presentV7SchemaCompatibilityPublic,
} = require("../../src/platform/schema/v7RuntimeSchemaCompatibility");

const EXPECTED_KEY = "moovex-platform-v7";
const EXPECTED_ENV = "testing";

async function main() {
  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:preflight:testing] ${err.message}`);
    process.exit(1);
  }

  const expectedKeyRaw = process.env.DATABASE_IDENTITY_EXPECTED;
  const keyCheck = validateIdentityKey(expectedKeyRaw);
  if (!keyCheck.ok || keyCheck.key !== EXPECTED_KEY) {
    // eslint-disable-next-line no-console
    console.error(
      `[db:preflight:testing] DATABASE_IDENTITY_EXPECTED must be ${EXPECTED_KEY}.`
    );
    process.exit(2);
  }
  const envCheck = validateEnvironmentCode(process.env.DATABASE_IDENTITY_ENV);
  if (!envCheck.ok || envCheck.env !== EXPECTED_ENV) {
    // eslint-disable-next-line no-console
    console.error(
      `[db:preflight:testing] DATABASE_IDENTITY_ENV must be ${EXPECTED_ENV}.`
    );
    process.exit(2);
  }

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  try {
    const identity = await checkDatabaseIdentity(pool, { identityKey: EXPECTED_KEY });
    if (!identity.ok) {
      // eslint-disable-next-line no-console
      console.error(`[db:preflight:testing] identity check failed: ${identity.message || identity.code}`);
      process.exit(2);
    }
    const envCode = String((identity.row && identity.row.environment_code) || "").toLowerCase();
    if (envCode !== EXPECTED_ENV) {
      // eslint-disable-next-line no-console
      console.error(
        `[db:preflight:testing] Refusing: environment_code=${envCode || "(null)"} is not ${EXPECTED_ENV}.`
      );
      process.exit(2);
    }

    const ledger = await status({ pool });
    const report = await inspectV7RuntimeSchemaCompatibility(pool);
    const publicReport = presentV7SchemaCompatibilityPublic(report);
    // eslint-disable-next-line no-console
    console.log(formatV7RuntimeSchemaCompatibilityLog(report));
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: report.compatible === true && ledger.pending === 0 && ledger.drift === 0,
          identity_key: identity.row.identity_key,
          environment_code: envCode,
          pending: ledger.pending,
          drift: ledger.drift,
          applied: ledger.applied,
          total: ledger.total,
          schemaCompatibility: publicReport,
        },
        null,
        2
      )
    );

    if (ledger.drift > 0) {
      // eslint-disable-next-line no-console
      console.error("[db:preflight:testing] checksum drift present. Do not deploy.");
      process.exit(2);
    }
    if (ledger.pending > 0) {
      const pending = (ledger.rows || [])
        .filter((row) => row.state === "pending")
        .map((row) => `${row.module}/${row.filename}`);
      // eslint-disable-next-line no-console
      console.error(
        `[db:preflight:testing] ${ledger.pending} pending migration(s): ${pending.join(", ")}. ` +
          "Apply with npm run db:migrate:testing, then re-run preflight before deploying runtime."
      );
      process.exit(3);
    }
    if (!report.compatible) {
      // eslint-disable-next-line no-console
      console.error("[db:preflight:testing] schemaCompatibility is incompatible. Do not deploy runtime.");
      process.exit(3);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:preflight:testing] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
