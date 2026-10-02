#!/usr/bin/env node
"use strict";

/**
 * Configure Demo Church on the BlessBoard V5 testing database.
 *
 * Safety:
 * - Requires DATABASE_URL
 * - Verifies platform.database_identity (blessboard-platform-v5 / testing)
 * - Never truncates, deletes orgs, or touches production identity
 *
 * Usage:
 *   DEPLOYMENT_ENV=testing node db/scripts/configure-demo-church.js
 *   DEPLOYMENT_ENV=testing node db/scripts/configure-demo-church.js --dry-run
 */

const { Pool } = require("pg");
const { requireDatabaseUrl } = require("./lib/databaseUrl");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const {
  configureDemoChurch,
  assertTestingIdentity,
} = require("../../src/blessboard/services/configureDemoChurch");

function parseArgs(argv) {
  const out = { dryRun: false, publish: true };
  for (const arg of argv) {
    if (arg === "--dry-run") out.dryRun = true;
    if (arg === "--no-publish") out.publish = false;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let connectionString;
  try {
    connectionString = requireDatabaseUrl();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exit(1);
  }

  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 4 }));
  try {
    const gate = await assertTestingIdentity(pool);
    if (!gate.ok) {
      console.error(JSON.stringify({ ok: false, stage: "identity", ...gate }, null, 2));
      process.exit(2);
    }

    if (args.dryRun) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "dry-run",
            identity: gate.identity,
            message: "Identity verified. Re-run without --dry-run to apply.",
          },
          null,
          2
        )
      );
      return;
    }

    // Prefer HQ admin fixture as actor when present.
    const actor = await pool.query(
      `SELECT u.id
         FROM blessboard.users u
         JOIN blessboard.user_roles ur ON ur.user_id = u.id
        WHERE u.email_normalized = 'church-hq-admin@example.test'
          AND ur.role_key = 'church_hq_admin'
          AND ur.status = 'active'
        LIMIT 1`
    );
    const actorUserId = actor.rows[0] ? actor.rows[0].id : null;

    const result = await configureDemoChurch(pool, {
      actorUserId,
      publish: args.publish,
    });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.ok ? 0 : 3);
  } catch (err) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          error: err && err.message ? String(err.message) : "unknown",
        },
        null,
        2
      )
    );
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
