#!/usr/bin/env node
"use strict";

/**
 * Expire enabled pilot feature flags past ends_at.
 *
 *   node scripts/run-church-pilot-feature-flag-jobs.js
 */

require("dotenv").config();
const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const churchPilotFeatureFlagService = require("../src/services/church/churchPilotFeatureFlagService");

async function main() {
  const { shouldRunBlessBoardScheduledJob } = require("../src/startup/blessBoardJobsGate");
  if (!shouldRunBlessBoardScheduledJob("pilot-feature-flag-jobs")) {
    return;
  }
  if (!isPgConfigured()) {
    console.error("PostgreSQL is not configured.");
    process.exit(1);
  }
  const pool = getPgPool();
  await ensureChurchSchema(pool);
  const result = await churchPilotFeatureFlagService.processExpiredPilotFlags(pool, {
    at: new Date(),
    limit: 100,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
