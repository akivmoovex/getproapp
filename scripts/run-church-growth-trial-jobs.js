#!/usr/bin/env node
"use strict";

/**
 * Cron/ops entrypoint for BlessBoard Growth trial jobs (reminders, expiry, config retention).
 * Idempotent — safe to run twice.
 *
 * Usage:
 *   node scripts/run-church-growth-trial-jobs.js
 *
 * Requires DATABASE_URL (or GETPRO_DATABASE_URL). Does not use payment providers.
 */

require("dotenv").config({ quiet: true });

const { getPgPool, closePgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { runGrowthTrialJobs } = require("../src/services/church/churchGrowthTrialService");

async function main() {
  const { shouldRunBlessBoardScheduledJob } = require("../src/startup/blessBoardJobsGate");
  if (!shouldRunBlessBoardScheduledJob("growth-trial-jobs")) {
    return;
  }
  if (!isPgConfigured()) {
    console.error("PostgreSQL is not configured.");
    process.exitCode = 1;
    return;
  }
  const pool = getPgPool();
  await ensureChurchSchema(pool);
  const result = await runGrowthTrialJobs(pool, { at: new Date() });
  console.log(
    JSON.stringify(
      {
        ok: true,
        reminders: result.reminders.count,
        expiries: result.expiries.count,
        retention: result.retention.processed,
      },
      null,
      2
    )
  );
  await closePgPool();
}

main().catch(async (err) => {
  console.error(err && err.stack ? err.stack : err);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
