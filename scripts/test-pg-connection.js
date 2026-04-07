#!/usr/bin/env node
"use strict";

/**
 * Optional connectivity check for PostgreSQL (Supabase). Safe to run in CI when URL is unset (exits 0, skip).
 * Does not touch SQLite or application data.
 *
 * Usage: npm run test:pg
 * Requires: DATABASE_URL or GETPRO_DATABASE_URL when you want an actual test.
 */

const { getPgPool, isPgConfigured, closePgPool } = require("../src/db/pg");

async function main() {
  if (!isPgConfigured()) {
    // eslint-disable-next-line no-console
    console.log(
      "[getpro] PostgreSQL: skip (set DATABASE_URL or GETPRO_DATABASE_URL to test Supabase/Postgres connectivity)."
    );
    process.exit(0);
  }

  const pool = getPgPool();
  const start = Date.now();
  const result = await pool.query("SELECT current_database() AS database, 1 AS ok");
  const ms = Date.now() - start;
  // eslint-disable-next-line no-console
  console.log("[getpro] PostgreSQL: OK", { ...result.rows[0], ms });
  await closePgPool();
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[getpro] PostgreSQL: FAILED —", err.message);
  closePgPool().finally(() => process.exit(1));
});
