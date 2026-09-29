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

require("../src/startup/localEnvSafety").loadRepoDotenvForCliOrExit();

const {
  prepareBlessBoardJobPool,
  closePgPool,
} = require("../src/startup/blessBoardJobPreflight");
const { runGrowthTrialJobs } = require("../src/services/church/churchGrowthTrialService");

async function main() {
  const pool = await prepareBlessBoardJobPool("growth-trial-jobs");
  if (!pool) return;
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
