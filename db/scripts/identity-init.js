#!/usr/bin/env node
"use strict";

/**
 * Explicitly initialize platform.database_identity (singleton).
 * Never runs during migrate or server startup. Requires --confirm.
 * Uses DATABASE_URL only. Never prints credentials or full host URLs.
 *
 * Usage:
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=blessboard-platform-v5 \
 *     node db/scripts/identity-init.js --env testing --confirm
 */

const { Pool } = require("pg");
const { requireDatabaseUrl } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const {
  ALLOWED_ENVS,
  validateIdentityKey,
  ensureDatabaseIdentity,
} = require("./lib/databaseIdentity");

function parseArgs(argv) {
  const out = { env: "", confirm: false, identityKey: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--confirm") out.confirm = true;
    else if (arg === "--env") out.env = String(argv[++i] || "");
    else if (arg.startsWith("--env=")) out.env = arg.slice("--env=".length);
    else if (arg === "--identity-key") out.identityKey = String(argv[++i] || "");
    else if (arg.startsWith("--identity-key=")) out.identityKey = arg.slice("--identity-key=".length);
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

  const identityRaw = args.identityKey || process.env.DATABASE_IDENTITY_EXPECTED || "";
  const keyCheck = validateIdentityKey(identityRaw);
  if (!keyCheck.ok) {
    // eslint-disable-next-line no-console
    console.error(
      "[db:identity:init] Refusing: DATABASE_IDENTITY_EXPECTED (or --identity-key) is required, e.g. blessboard-platform-v5."
    );
    process.exit(1);
  }

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  try {
    const result = await ensureDatabaseIdentity(pool, {
      connectionString,
      identityKey: keyCheck.key,
      environmentCode: env,
    });
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`[db:identity:init] ${result.message}`);
      process.exit(result.code === "environment_mismatch" || result.code === "identity_key_mismatch" ? 2 : 1);
    }
    const row = result.row;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          result: result.result,
          database_instance_id: row.database_instance_id,
          identity_key: row.identity_key,
          environment_code: row.environment_code,
          database_name: row.database_name,
          host_fingerprint: row.host_fingerprint || sanitizeHostFingerprint(connectionString),
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
