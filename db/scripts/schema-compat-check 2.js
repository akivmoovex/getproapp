#!/usr/bin/env node
"use strict";

/**
 * Read-only V7 schema compatibility inspect. Never runs migrations.
 * Uses DATABASE_URL only. Never prints credentials.
 *
 * Usage: DATABASE_URL=… node db/scripts/schema-compat-check.js
 */

const { Pool } = require("pg");
const { requireDatabaseUrl } = require("./lib/databaseUrl");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const { checkDatabaseIdentity } = require("./lib/databaseIdentity");
const {
  inspectV7RuntimeSchemaCompatibility,
  formatV7RuntimeSchemaCompatibilityLog,
  presentV7SchemaCompatibilityPublic,
} = require("../../src/platform/schema/v7RuntimeSchemaCompatibility");

async function main() {
  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:schema:compat] ${err.message}`);
    process.exit(1);
  }

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  try {
    const identity = await checkDatabaseIdentity(pool, {});
    const report = await inspectV7RuntimeSchemaCompatibility(pool);
    const publicReport = presentV7SchemaCompatibilityPublic(report);
    // eslint-disable-next-line no-console
    console.log(formatV7RuntimeSchemaCompatibilityLog(report));
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: report.compatible === true,
          identity_key: identity.row && identity.row.identity_key,
          environment_code: identity.row && identity.row.environment_code,
          schemaCompatibility: publicReport,
        },
        null,
        2
      )
    );
    process.exit(report.compatible === true ? 0 : 3);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:schema:compat] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
