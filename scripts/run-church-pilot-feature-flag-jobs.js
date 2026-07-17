#!/usr/bin/env node
"use strict";

/**
 * Expire enabled pilot feature flags past ends_at.
 *
 *   node scripts/run-church-pilot-feature-flag-jobs.js
 */

require("dotenv").config();

const {
  prepareBlessBoardJobPool,
  closePgPool,
} = require("../src/startup/blessBoardJobPreflight");
const churchPilotFeatureFlagService = require("../src/services/church/churchPilotFeatureFlagService");

async function main() {
  const pool = await prepareBlessBoardJobPool("pilot-feature-flag-jobs");
  if (!pool) return;
  const result = await churchPilotFeatureFlagService.processExpiredPlatformFlags(pool, {
    at: new Date(),
    limit: 100,
  });
  console.log(JSON.stringify(result, null, 2));
  await closePgPool();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
