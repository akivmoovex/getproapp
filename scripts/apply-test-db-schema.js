#!/usr/bin/env node
"use strict";

/**
 * Apply canonical schema to a dedicated empty PostgreSQL database used for automated tests.
 *
 * Requires: GETPRO_TEST_DB=1 and TEST_DATABASE_URL (same semantics as src/db/pg/pool.js).
 * Does not use DATABASE_URL — avoids touching a dev database by mistake.
 *
 * Steps:
 * 1) db/postgres/000_full_schema.sql
 * 2) Remaining db/postgres/NNN_*.sql in order, excluding duplicate files named "* 2.sql"
 * 3) tenantsRepo.ensureCanonicalTenantsIfMissing (ids 1–8 for FKs)
 *
 * Safe to re-run on a DB that already has the schema (idempotent DDL in most files); for a clean slate,
 * drop/recreate the database first.
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const { runBootstrap } = require("../src/startup/bootstrap");
runBootstrap();

const tenantsRepo = require("../src/db/pg/tenantsRepo");
const { requireSafeTestDatabaseUrl } = require("../src/db/pg/requireSafeTestDatabase");

function requireTestUrl() {
  try {
    return requireSafeTestDatabaseUrl({ label: "apply-test-db-schema" }).connectionString;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e && e.message ? e.message : String(e));
    process.exit(1);
  }
}

function listIncrementalSqlFiles(dir) {
  const names = fs.readdirSync(dir);
  const out = [];
  for (const name of names) {
    if (!/^\d{3}_.*\.sql$/i.test(name)) continue;
    if (name.includes(" 2.sql")) continue;
    if (name === "000_full_schema.sql") continue;
    out.push(name);
  }
  out.sort((a, b) => a.localeCompare(b, "en"));
  return out;
}

async function main() {
  const connectionString = requireTestUrl();
  const pgDir = path.join(__dirname, "..", "db", "postgres");
  const pool = new Pool({ connectionString });

  const client = await pool.connect();
  try {
    const fullPath = path.join(pgDir, "000_full_schema.sql");
    // eslint-disable-next-line no-console
    console.log("[getpro] apply-test-db-schema: applying", path.basename(fullPath));
    const sql000 = fs.readFileSync(fullPath, "utf8");
    await client.query(sql000);

    const files = listIncrementalSqlFiles(pgDir);
    for (const name of files) {
      // eslint-disable-next-line no-console
      console.log("[getpro] apply-test-db-schema: applying", name);
      const sql = fs.readFileSync(path.join(pgDir, name), "utf8");
      await client.query(sql);
    }

    await tenantsRepo.ensureCanonicalTenantsIfMissing(pool);
    // eslint-disable-next-line no-console
    console.log("[getpro] apply-test-db-schema: done.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[getpro] apply-test-db-schema: FAILED —", err.message);
  process.exit(1);
});
