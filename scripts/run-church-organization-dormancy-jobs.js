#!/usr/bin/env node
"use strict";

/**
 * Cron/ops entrypoint for Foundation inactivity warnings and dormancy.
 * Growth organisations are excluded. Idempotent — safe to run twice.
 * Does not delete or anonymise tenant data.
 *
 * Usage:
 *   node scripts/run-church-organization-dormancy-jobs.js
 *
 * Requires DATABASE_URL (or GETPRO_DATABASE_URL).
 */

require("dotenv").config({ quiet: true });

const { getPgPool, closePgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { processFoundationInactivityJobs } = require("../src/services/church/churchDormancyService");

async function main() {
  const { shouldRunBlessBoardScheduledJob } = require("../src/startup/blessBoardJobsGate");
  if (!shouldRunBlessBoardScheduledJob("organization-dormancy-jobs")) {
    return;
  }
  if (!isPgConfigured()) {
    console.error("PostgreSQL is not configured.");
    process.exitCode = 1;
    return;
  }
  const pool = getPgPool();
  await ensureChurchSchema(pool);
  const result = await processFoundationInactivityJobs(pool, { at: new Date() });
  const summary = {
    ok: true,
    count: result.count,
    active_ok: 0,
    first_warning: 0,
    final_warning: 0,
    dormant: 0,
    skipped_growth: 0,
    skipped_uncertain: 0,
    duplicate_job: 0,
    other: 0,
  };
  for (const row of result.processed || []) {
    if (row.outcome === "active_ok") summary.active_ok += 1;
    else if (row.outcome === "recorded" && row.stage === "first") summary.first_warning += 1;
    else if (row.outcome === "recorded" && row.stage === "final") summary.final_warning += 1;
    else if (row.outcome === "dormant") summary.dormant += 1;
    else if (row.outcome === "skipped_growth") summary.skipped_growth += 1;
    else if (row.outcome === "skipped_uncertain") summary.skipped_uncertain += 1;
    else if (row.outcome === "duplicate_job") summary.duplicate_job += 1;
    else summary.other += 1;
  }
  console.log(JSON.stringify(summary, null, 2));
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
