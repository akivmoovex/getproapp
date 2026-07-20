#!/usr/bin/env node
"use strict";

/**
 * V5 Growth trial expiry maintenance: grace → Foundation downgrade.
 * Never runs on server boot or HTTP request. DATABASE_URL only.
 *
 * Dry-run is the default. Writes require --confirm.
 *
 * Preview:
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… \
 *     npm run blessboard:growth-trial:expiry -- --limit 50
 *
 * Apply:
 *   DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… \
 *     npm run blessboard:growth-trial:expiry -- --confirm --limit 50
 *
 * Hostinger cron (daily, dry-run first in staging):
 *   cd /path/to/app && DATABASE_URL=… DATABASE_IDENTITY_EXPECTED=… \
 *     /usr/bin/npm run blessboard:growth-trial:expiry -- --confirm --limit 100
 *
 * Options:
 *   --confirm              Perform writes (default is dry-run)
 *   --dry-run              Force dry-run even with --confirm
 *   --limit N              Max rows this run (default 50, max 500)
 *   --grace-days N         Calendar days of grace (default 7, range 1–30)
 *   --deployment CODE      Audit deployment_code (default blessboard-org-v5)
 *   --at ISO               Override clock (tests / replay only)
 */

const { Pool } = require("pg");
const {
  parseWriteMode,
  resolveDatabaseUrlSafe,
  requireMatchedIdentity,
  assertNoLegacyPublicTables,
  assertNoSecretsInText,
} = require("./lib/provisionCliSafety");
const {
  runGrowthTrialExpiryBatch,
  DEFAULT_BATCH_LIMIT,
  DEFAULT_GRACE_DAYS,
} = require("../../src/platform/services/growthTrialExpiryService");

function parseArgs(argv) {
  const out = {
    limit: DEFAULT_BATCH_LIMIT,
    graceDays: DEFAULT_GRACE_DAYS,
    deployment: "blessboard-org-v5",
    at: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => String(argv[++i] || "");
    const take = (prefix) => arg.slice(prefix.length);
    if (arg === "--limit") out.limit = next();
    else if (arg.startsWith("--limit=")) out.limit = take("--limit=");
    else if (arg === "--grace-days") out.graceDays = next();
    else if (arg.startsWith("--grace-days=")) out.graceDays = take("--grace-days=");
    else if (arg === "--deployment") out.deployment = next();
    else if (arg.startsWith("--deployment=")) out.deployment = take("--deployment=");
    else if (arg === "--at") out.at = next();
    else if (arg.startsWith("--at=")) out.at = take("--at=");
  }
  return out;
}

function finish(report) {
  const text = JSON.stringify(report, null, 2);
  assertNoSecretsInText(text);
  process.stdout.write(`${text}\n`);
}

async function main() {
  const { dryRun, rest } = parseWriteMode(process.argv.slice(2));
  const args = parseArgs(rest);

  const dbResolved = resolveDatabaseUrlSafe();
  if (!dbResolved.ok) {
    finish({
      ok: false,
      message: dbResolved.message,
      detail: dbResolved.detail || undefined,
      dryRun,
      exitCode: 2,
    });
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: dbResolved.connectionString,
    max: 2,
    ssl: process.env.GETPRO_PG_SSL === "off" ? false : undefined,
  });

  let exitCode = 0;
  try {
    const identity = await requireMatchedIdentity(pool);
    if (!identity.ok) {
      finish({
        ok: false,
        message: identity.message,
        code: identity.code,
        dryRun,
        databaseName: dbResolved.databaseName,
        hostFingerprint: dbResolved.hostFingerprint,
        exitCode: 2,
      });
      exitCode = 2;
      return;
    }

    const legacy = await assertNoLegacyPublicTables(pool);
    if (!legacy.ok) {
      finish({
        ok: false,
        message: legacy.message,
        tables: legacy.tables,
        dryRun,
        exitCode: 2,
      });
      exitCode = 2;
      return;
    }

    const result = await runGrowthTrialExpiryBatch(pool, {
      dryRun,
      limit: args.limit,
      graceDays: args.graceDays,
      deploymentCode: args.deployment,
      at: args.at || undefined,
    });

    const summary = result.summary || {};
    // Drop per-row organization UUIDs from default CLI stdout (keep counts).
    const publicSummary = {
      dryRun: summary.dryRun,
      at: summary.at,
      limit: summary.limit,
      graceDays: summary.graceDays,
      candidates: summary.candidates,
      enteredGrace: summary.enteredGrace,
      wouldEnterGrace: summary.wouldEnterGrace,
      downgraded: summary.downgraded,
      wouldDowngrade: summary.wouldDowngrade,
      skippedLocked: summary.skippedLocked,
      skippedNotExpired: summary.skippedNotExpired,
      skippedPaid: summary.skippedPaid,
      skippedOther: summary.skippedOther,
      failures: summary.failures,
    };

    exitCode = result.ok && summary.failures === 0 ? 0 : 1;
    finish({
      ok: result.ok,
      status: result.status,
      message: result.message || (dryRun ? "dry_run_complete" : "expiry_batch_complete"),
      dryRun,
      identityKey: identity.identityKey,
      databaseName: dbResolved.databaseName,
      hostFingerprint: dbResolved.hostFingerprint,
      summary: publicSummary,
      exitCode,
      notes: {
        grace:
          "Grace = past_due + ends_at extended by graceDays from trial ends_at; Growth entitlements apply until grace ends_at.",
        billing:
          "No V5 payment provider. Active Growth (open ends_at) is not selected for expiry/downgrade.",
        notifications: "No subscription email/SMS delivery in V5; audit events only.",
      },
    });
  } catch {
    finish({
      ok: false,
      message: "cli_failure",
      dryRun,
      databaseName: dbResolved.databaseName,
      hostFingerprint: dbResolved.hostFingerprint,
      exitCode: 1,
    });
    exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
    process.exit(exitCode);
  }
}

main();
