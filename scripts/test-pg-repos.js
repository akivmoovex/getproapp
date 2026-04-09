#!/usr/bin/env node
"use strict";

/**
 * Optional smoke test: run a few read-only queries via repository modules.
 * Exits 0 if Postgres is unset (skip). Exits 1 if the pool works but tables are missing — apply db/postgres/000_full_schema.sql.
 *
 * Usage: npm run test:pg:repos
 */

const { runBootstrap } = require("../src/startup/bootstrap");
const boot = runBootstrap();

const {
  getPgPool,
  isPgConfigured,
  closePgPool,
  logDatabaseEnvMissingDiagnostics,
  tenantsRepo,
  categoriesRepo,
} = require("../src/db/pg");

async function main() {
  if (!isPgConfigured()) {
    logDatabaseEnvMissingDiagnostics({
      label: "scripts/test-pg-repos.js",
      envPath: boot.envPath,
      dotenvKeyCount: boot.dotenvKeyCount,
      dotenvErrorMessage: boot.dotenvErrorMessage,
      startupEntry: boot.startupEntry,
      beforeDbSnapshot: boot.beforeDb,
      envFileExists: boot.envFileExists,
      dotenvSkipped: boot.skipDotenv,
      dbProvenanceLogLine: boot.dbProvenance.logLine,
      liteSpeedLsnode: boot.liteSpeedLsnode,
    });
    // eslint-disable-next-line no-console
    console.log(
      "[getpro] test:pg:repos — skip (set DATABASE_URL or GETPRO_DATABASE_URL to exercise repositories)."
    );
    process.exit(0);
  }

  const pool = getPgPool();
  const start = Date.now();
  try {
    const tenants = await tenantsRepo.listOrderedById(pool);
    const zm = tenants.find((t) => t.slug === "zm");
    let categories = [];
    if (zm) {
      categories = await categoriesRepo.listByTenantId(pool, zm.id);
    }
    const ms = Date.now() - start;
    // eslint-disable-next-line no-console
    console.log("[getpro] PostgreSQL repos: OK", {
      tenants: tenants.length,
      zmCategories: categories.length,
      ms,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[getpro] PostgreSQL repos: FAILED —", err.message);
    // eslint-disable-next-line no-console
    console.error(
      "[getpro] If the error mentions a missing relation, apply schema: db/postgres/000_full_schema.sql"
    );
    process.exit(1);
  } finally {
    await closePgPool();
  }
}

main();
