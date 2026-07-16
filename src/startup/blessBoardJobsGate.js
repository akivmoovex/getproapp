"use strict";

/**
 * Shared gate for BlessBoard cron/ops job scripts.
 * When BLESSBOARD_JOBS_ENABLED is false, scripts exit 0 without running work.
 * Manual in-app workflows do not use this gate.
 */

const { areBlessBoardJobsEnabled } = require("../church/blessBoardEnv");

/**
 * @param {string} jobLabel
 * @returns {boolean} true if the job should run
 */
function shouldRunBlessBoardScheduledJob(jobLabel) {
  if (areBlessBoardJobsEnabled()) return true;
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      ok: true,
      skipped: true,
      reason: "BLESSBOARD_JOBS_ENABLED=false",
      job: String(jobLabel || "unknown"),
    })
  );
  return false;
}

module.exports = {
  shouldRunBlessBoardScheduledJob,
};
