#!/usr/bin/env node
"use strict";

/**
 * Explicit backfill of shared-engine version history for BlessBoard websites.
 *
 * Non-destructive and idempotent: it never writes blessboard.public_pages,
 * never changes website_status, and skips any site that already has history.
 *
 * Usage:
 *   npm run blessboard:website-engine:backfill -- --dry-run
 *   npm run blessboard:website-engine:backfill
 *
 * Options:
 *   --dry-run        report planned work without writing
 *   --limit=<n>      process at most n sites
 *   --verbose        print one line per site
 *
 * Requires DATABASE_URL. Refuses to run against a production deployment unless
 * ALLOW_PRODUCTION_BACKFILL=1 is set explicitly.
 */

const { Pool } = require("pg");
const {
  backfillBlessBoardWebsiteVersions,
} = require("../../src/platform/website-engine/blessboardBackfillService");

function parseArgs(argv) {
  const args = { dryRun: false, limit: null, verbose: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--dry-run") args.dryRun = true;
    else if (raw === "--verbose") args.verbose = true;
    else if (raw.startsWith("--limit=")) args.limit = Number(raw.slice("--limit=".length));
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL || process.env.BLESSBOARD_DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(2);
  }

  const deployment = String(process.env.DEPLOYMENT_CODE || process.env.APP_ENV || "");
  if (/prod/i.test(deployment) && process.env.ALLOW_PRODUCTION_BACKFILL !== "1") {
    console.error(
      `Refusing to run against deployment "${deployment}". Set ALLOW_PRODUCTION_BACKFILL=1 to override.`
    );
    process.exit(3);
  }

  const pool = new Pool({ connectionString });
  try {
    const summary = await backfillBlessBoardWebsiteVersions(pool, {
      dryRun: args.dryRun,
      limit: args.limit,
      onSite: args.verbose
        ? (detail) =>
            console.log(
              `${detail.outcome}\tchurch=${detail.churchId}\tbranch=${
                detail.branchId || "-"
              }\tstatus=${detail.websiteStatus}${detail.reason ? `\t${detail.reason}` : ""}`
            )
        : undefined,
    });

    console.log("");
    console.log(`MIGRATION_ORIGIN = ${summary.migrationOrigin}`);
    console.log(`DRY_RUN = ${summary.dryRun ? "YES" : "NO"}`);
    console.log(`WEBSITES_SCANNED = ${summary.websitesScanned}`);
    console.log(`VERSIONS_CREATED = ${summary.versionsCreated}`);
    console.log(`ALREADY_CURRENT = ${summary.alreadyCurrent}`);
    console.log(`DRAFTS_SEEDED = ${summary.draftsSeeded}`);
    console.log(`ERRORS = ${summary.errors}`);

    if (summary.errors > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
