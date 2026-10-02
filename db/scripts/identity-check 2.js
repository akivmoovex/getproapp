#!/usr/bin/env node
"use strict";

/**
 * Read and report platform.database_identity without mutating it.
 * Uses DATABASE_URL only. Never prints credentials.
 * When DATABASE_IDENTITY_EXPECTED is set, verifies identity_key match.
 *
 * Usage: DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… npm run db:identity:check
 */

const { Pool } = require("pg");
const { requireDatabaseUrl, parseDatabaseName, envStringIsSet } = require("./lib/databaseUrl");
const { sanitizeHostFingerprint } = require("./lib/hostFingerprint");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const { checkDatabaseIdentity, validateIdentityKey } = require("./lib/databaseIdentity");

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
  const expectedKeyRaw = process.env.DATABASE_IDENTITY_EXPECTED;
  let expectedKey = null;
  if (envStringIsSet(expectedKeyRaw)) {
    const keyCheck = validateIdentityKey(expectedKeyRaw);
    if (!keyCheck.ok) {
      // eslint-disable-next-line no-console
      console.error("[db:identity:check] DATABASE_IDENTITY_EXPECTED is invalid.");
      process.exit(1);
    }
    expectedKey = keyCheck.key;
  }

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));

  try {
    const result = await checkDatabaseIdentity(pool, { identityKey: expectedKey || undefined });
    if (result.code === "identity_table_missing") {
      // eslint-disable-next-line no-console
      console.error(
        "[db:identity:check] platform.database_identity does not exist. Run npm run db:migrate or db:bootstrap:foundation first."
      );
      process.exit(1);
    }

    if (!result.ok && result.code === "missing") {
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            ok: false,
            result: "missing",
            message:
              "Identity is not initialized. Run npm run db:bootstrap:foundation or db:identity:init.",
            current_database: expectedDbName || null,
            live_host_fingerprint: liveFingerprint,
            expected_identity_key: expectedKey,
          },
          null,
          2
        )
      );
      process.exit(2);
    }

    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.error(`[db:identity:check] ${result.message}`);
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify(
          {
            ok: false,
            result: result.code,
            message: result.message,
            identity_key: result.row && result.row.identity_key,
            environment_code: result.row && result.row.environment_code,
            expected_identity_key: expectedKey,
            current_database: expectedDbName || null,
            live_host_fingerprint: liveFingerprint,
          },
          null,
          2
        )
      );
      process.exit(2);
    }

    const row = result.row;
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          result: "present",
          database_instance_id: row.database_instance_id,
          identity_key: row.identity_key,
          environment_code: row.environment_code,
          database_name: row.database_name,
          host_fingerprint: row.host_fingerprint,
          current_database: expectedDbName || null,
          live_host_fingerprint: liveFingerprint,
          expected_identity_key: expectedKey,
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
