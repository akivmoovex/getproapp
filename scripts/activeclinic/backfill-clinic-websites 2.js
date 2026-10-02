"use strict";

/**
 * Testing-safe ActiveClinic website backfill CLI.
 * Usage:
 *   node scripts/activeclinic/backfill-clinic-websites.js --dry-run
 *   node scripts/activeclinic/backfill-clinic-websites.js --apply
 * Requires DATABASE_URL and identity moovex-platform-v7 / testing.
 */

const { Pool } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const {
  backfillActiveClinicWebsites,
} = require("../../src/activeclinic/website/backfillActiveClinicWebsites");

async function readIdentity(client) {
  const rows = await client.query(
    `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
  );
  return rows.rows[0] || null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = !apply || process.argv.includes("--dry-run");
  const url = requireDatabaseUrl();
  const pool = new Pool({ connectionString: url, max: 4 });
  try {
    const identity = await readIdentity(pool);
    if (
      !identity ||
      identity.identity_key !== "moovex-platform-v7" ||
      String(identity.environment_code) !== "testing"
    ) {
      console.error("ABORT: database identity is not moovex-platform-v7 / testing");
      process.exitCode = 2;
      return;
    }
    const result = await backfillActiveClinicWebsites(pool, { dryRun });
    console.log(JSON.stringify({ dryRun, identity, result }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.message ? err.message : String(err));
  process.exitCode = 1;
});
