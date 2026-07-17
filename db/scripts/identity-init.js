#!/usr/bin/env node
"use strict";

/**
 * Explicitly initialize platform.database_identity (singleton).
 * Never runs during migrate or server startup. Requires --confirm.
 * Uses DATABASE_URL only. Never prints credentials or full host URLs.
 *
 * Usage:
 *   DATABASE_URL=… node db/scripts/identity-init.js --env testing --confirm
 *   DATABASE_URL=… node db/scripts/identity-init.js --env production --confirm
 */

const crypto = require("crypto");
const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { ensureMigrationLedger } = require("./lib/migrator");

const ALLOWED_ENVS = ["preproduction", "shared", "production", "testing"];

function parseArgs(argv) {
  const out = { env: "", confirm: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm") out.confirm = true;
    else if (arg === "--env") out.env = String(argv[++i] || "");
    else if (arg.startsWith("--env=")) out.env = arg.slice("--env=".length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = String(args.env || "").trim().toLowerCase();

  if (!ALLOWED_ENVS.includes(env)) {
    // eslint-disable-next-line no-console
    console.error(
      `[db:identity:init] Refusing: --env is required and must be one of: ${ALLOWED_ENVS.join(", ")}.`
    );
    process.exit(2);
  }

  if (!args.confirm) {
    // eslint-disable-next-line no-console
    console.error(
      `[db:identity:init] Refusing: this writes a permanent database identity. Re-run with --confirm to mark this database as "${env}".`
    );
    process.exit(2);
  }

  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:identity:init] ${err.message}`);
    process.exit(1);
  }

  const databaseName = parseDatabaseName(connectionString);
  const hostFingerprint = sanitizeHostFingerprint(connectionString);
  if (!databaseName) {
    // eslint-disable-next-line no-console
    console.error("[db:identity:init] Refusing: could not parse database name from DATABASE_URL.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString, max: 2 });
  try {
    await ensureMigrationLedger(pool);

    const tableCheck = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_name = 'database_identity'`
    );
    if (tableCheck.rowCount === 0) {
      // eslint-disable-next-line no-console
      console.error(
        "[db:identity:init] Refusing: platform.database_identity does not exist. Run npm run db:migrate first."
      );
      process.exit(1);
    }

    const existing = await pool.query(
      `SELECT database_instance_id, environment_code, database_name, host_fingerprint, created_at, updated_at
         FROM platform.database_identity
        WHERE id = 1`
    );

    if (existing.rowCount > 0) {
      const row = existing.rows[0];
      if (row.environment_code === env) {
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify(
            {
              ok: true,
              result: "already_initialized",
              database_instance_id: row.database_instance_id,
              environment_code: row.environment_code,
              database_name: row.database_name,
              host_fingerprint: row.host_fingerprint,
            },
            null,
            2
          )
        );
        return;
      }
      // eslint-disable-next-line no-console
      console.error(
        `[db:identity:init] Refusing: identity already exists with environment_code=${row.environment_code}. ` +
          `Will not overwrite with ${env}.`
      );
      process.exit(2);
    }

    const databaseInstanceId = crypto.randomUUID();
    const inserted = await pool.query(
      `INSERT INTO platform.database_identity
         (id, database_instance_id, environment_code, database_name, host_fingerprint)
       VALUES (1, $1, $2, $3, $4)
       RETURNING database_instance_id, environment_code, database_name, host_fingerprint, created_at, updated_at`,
      [databaseInstanceId, env, databaseName, hostFingerprint]
    );
    const row = inserted.rows[0];
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          result: "initialized",
          database_instance_id: row.database_instance_id,
          environment_code: row.environment_code,
          database_name: row.database_name,
          host_fingerprint: row.host_fingerprint,
        },
        null,
        2
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:identity:init] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
