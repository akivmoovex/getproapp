"use strict";

/**
 * Shared preflight for BlessBoard cron/ops job scripts.
 * Verifies PostgreSQL is configured and database identity matches DEPLOYMENT_ENV
 * before any job claims or delivers work.
 */

const { getPgPool, closePgPool, isPgConfigured } = require("../db/pg/pool");
const { ensureChurchSchema } = require("../db/pg/ensureChurchSchema");
const { assertBlessBoardDatabaseIdentityOrExit } = require("../startup/blessBoardOrgDbGate");
const { shouldRunBlessBoardScheduledJob } = require("../startup/blessBoardJobsGate");

/**
 * @param {string} jobLabel
 * @returns {Promise<import("pg").Pool|null>} pool when the job should run; null when jobs are disabled
 */
async function prepareBlessBoardJobPool(jobLabel) {
  if (!shouldRunBlessBoardScheduledJob(jobLabel)) {
    return null;
  }
  if (!isPgConfigured()) {
    // eslint-disable-next-line no-console
    console.error(`[blessboard] FATAL: PostgreSQL is not configured for job "${jobLabel}".`);
    process.exit(1);
  }
  const pool = getPgPool();
  await ensureChurchSchema(pool);
  await assertBlessBoardDatabaseIdentityOrExit(pool);
  return pool;
}

module.exports = {
  prepareBlessBoardJobPool,
  closePgPool,
};
