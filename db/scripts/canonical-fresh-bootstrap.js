#!/usr/bin/env node
"use strict";

/**
 * V10 PL07 — Canonical fresh-DB bootstrap dry-run (ephemeral local only).
 *
 * Creates an empty local Postgres database, applies ordered migrations + seeds,
 * verifies the V2.03 canonical ceiling/schema, then drops the database.
 *
 * HARD REFUSALS:
 * - Does not read or mutate hosted QA / production DATABASE_URL
 * - Does not reset shared testing or production databases
 * - PL10 QA reset remains a separate authorized step
 *
 * Usage:
 *   npm run db:canonical-fresh-bootstrap
 */

const {
  resetFoundationDatabase,
  createFoundationPool,
  dropFoundationDatabaseByUrl,
} = require("../../tests/helpers/foundationDb");
const { migrate } = require("./lib/migrator");
const { ensureDatabaseIdentity } = require("./lib/databaseIdentity");
const {
  STRATEGY,
  CANONICAL_CEILING,
  FRESH_BOOTSTRAP_COMMAND,
  describeBaseline,
  verifyCanonicalFreshSchema,
  assertCeilingMatchesDisk,
  assertRequiredMigrationsOnDisk,
  scanCrossSchemaDdlSmells,
} = require("./lib/canonicalMigrationBaseline");
const { auditMigrationOwnership } = require("./lib/migrationOwnershipPolicy");

const IDENTITY_KEY = "moovex-platform-v7";

function assertNoSecrets(text) {
  const s = String(text || "");
  if (/postgres(ql)?:\/\//i.test(s)) {
    throw new Error("Refusing to print a postgres URL");
  }
  if (/password\s*=/i.test(s)) {
    throw new Error("Refusing to print password material");
  }
}

async function main() {
  const ownership = auditMigrationOwnership();
  const ceilingMismatches = assertCeilingMatchesDisk();
  const missingRequired = assertRequiredMigrationsOnDisk();
  const ddlSmells = scanCrossSchemaDdlSmells();

  if (ownership.orphans.length || ceilingMismatches.length || missingRequired.length || ddlSmells.length) {
    const report = {
      ok: false,
      code: "baseline_static_fail",
      ownership_orphans: ownership.orphans,
      ceiling_mismatches: ceilingMismatches,
      missing_required: missingRequired,
      ddl_smells: ddlSmells,
    };
    const out = JSON.stringify(report, null, 2);
    assertNoSecrets(out);
    console.log(out);
    process.exit(1);
  }

  let databaseUrl = null;
  let pool = null;
  try {
    databaseUrl = await resetFoundationDatabase();
    pool = createFoundationPool(databaseUrl);
    const migrateSummary = await migrate({ pool });
    await ensureDatabaseIdentity(pool, {
      connectionString: databaseUrl,
      identityKey: IDENTITY_KEY,
      environmentCode: "testing",
    });
    const verify = await verifyCanonicalFreshSchema(pool);

    const safe = {
      ok: verify.ok,
      code: verify.ok ? "V10_CANONICAL_FRESH_BOOTSTRAP_DRY_RUN_PASS" : "fresh_schema_verify_fail",
      strategy: STRATEGY.code,
      command: FRESH_BOOTSTRAP_COMMAND.ephemeral,
      identity_key: IDENTITY_KEY,
      environment_code: "testing",
      ceiling: CANONICAL_CEILING,
      migrate: {
        applied: migrateSummary.applied.length,
        skipped: migrateSummary.skipped.length,
        seeds_applied: migrateSummary.seedsApplied.length,
        seeds_skipped: migrateSummary.seedsSkipped.length,
      },
      verify_failures: verify.ok ? undefined : verify.failures,
      baseline: describeBaseline(),
      note: "Ephemeral local DB only. No QA/production reset.",
    };
    const out = JSON.stringify(safe, null, 2);
    assertNoSecrets(out);
    console.log(out);
    if (!verify.ok) process.exit(1);
  } finally {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
    if (databaseUrl) {
      try {
        await dropFoundationDatabaseByUrl(databaseUrl);
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error(
    `[db:canonical-fresh-bootstrap] ${err && err.message ? err.message : String(err)}`
  );
  process.exit(1);
});
