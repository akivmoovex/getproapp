#!/usr/bin/env node
"use strict";

/**
 * Cron/ops entrypoint for BlessBoard Growth scheduled-report delivery.
 * Tenant-scoped; idempotent via job_key / delivery idempotency_key.
 *
 * Usage:
 *   node scripts/run-church-scheduled-report-jobs.js
 *
 * Requires DATABASE_URL (or GETPRO_DATABASE_URL / TEST_DATABASE_URL in test).
 */

require("dotenv").config({ quiet: true });

const {
  prepareBlessBoardJobPool,
  closePgPool,
} = require("../src/startup/blessBoardJobPreflight");
const { processDueScheduledReports } = require("../src/services/church/scheduledReportService");

async function main() {
  const pool = await prepareBlessBoardJobPool("scheduled-report-jobs");
  if (!pool) return;
  const result = await processDueScheduledReports(pool, { at: new Date(), limit: 50 });
  console.log(
    JSON.stringify(
      {
        ok: true,
        at: result.at,
        count: result.count,
        outcomes: (result.processed || []).map((p) => ({
          scheduleId: p.scheduleId,
          organizationId: p.organizationId,
          outcome: p.outcome,
          jobKey: p.jobKey,
        })),
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
