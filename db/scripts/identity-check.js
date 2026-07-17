#!/usr/bin/env node
"use strict";

/**
 * Read and report platform.database_identity without mutating it.
 * Uses DATABASE_URL only. Never prints credentials.
 *
 * Usage: DATABASE_URL=… node db/scripts/identity-check.js
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");

async function main() {
  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:identity:check] ${err.message}`);
    process.exit(1);
  }

  const expectedDbName = parseDatabaseName(connectionString);
  const liveFingerprint = sanitizeHostFingerprint(connectionString);
  const pool = new Pool({ connectionString, max: 2 });

  try {
    const tableCheck = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_name = 'database_identity'`
    );
    if (tableCheck.rowCount === 0) {
      // eslint-disable-next-line no-console
      console.error(
        "[db:identity:check] platform.database_identity does not exist. Run npm run db:migrate first."
      );
      process.exit(1);
    }

    const r = await pool.query(
      `SELECT database_instance_id, environment_code, database_name, host_fingerprint, created_at, updated_at
         FROM platform.database_identity
        WHERE id = 1`
    );

    if (r.rowCount === 0) {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            ok: false,
            result: "missing",
            message: "Identity is not initialized. Run npm run db:identity:init -- --env <code> --confirm.",
            current_database: expectedDbName || null,
            live_host_fingerprint: liveFingerprint,
          },
          null,
          2
        )
      );
      process.exit(2);
    }

    const row = r.rows[0];
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          result: "present",
          database_instance_id: row.database_instance_id,
          environment_code: row.environment_code,
          database_name: row.database_name,
          host_fingerprint: row.host_fingerprint,
          current_database: expectedDbName || null,
          live_host_fingerprint: liveFingerprint,
          created_at: row.created_at,
          updated_at: row.updated_at,
        },
        null,
        2
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:identity:check] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
