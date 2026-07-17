#!/usr/bin/env node
"use strict";

/**
 * Cron/ops entrypoint for BlessBoard Growth scheduled HQ broadcasts.
 * Tenant-scoped; idempotent via job_key / delivery idempotency_key.
 *
 * Usage:
 *   node scripts/run-church-scheduled-broadcast-jobs.js
 */

require("dotenv").config({ quiet: true });

const {
  prepareBlessBoardJobPool,
  closePgPool,
} = require("../src/startup/blessBoardJobPreflight");
const { processDueScheduledBroadcasts } = require("../src/services/church/scheduledBroadcastService");

async function main() {
  const pool = await prepareBlessBoardJobPool("scheduled-broadcast-jobs");
  if (!pool) return;
  const result = await processDueScheduledBroadcasts(pool, { at: new Date(), limit: 50 });
  console.log(
    JSON.stringify(
      {
        ok: true,
        at: result.at,
        count: result.count,
        outcomes: (result.processed || []).map((p) => ({
          broadcastId: p.broadcastId,
          organizationId: p.organizationId,
          outcome: p.outcome,
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
