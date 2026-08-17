#!/usr/bin/env node
"use strict";

/**
 * Read-only BlessBoard V5 pilot operational readiness.
 *
 *   npm run church:pilot:readiness
 *
 * Does not print secrets. Does not mutate data.
 * Exit 1 when any check fails; warnings alone exit 0.
 */

require("../src/startup/localEnvSafety").loadRepoDotenvForCliOrExit();

const { closePgPool } = require("../src/db/pg/pool");
const {
  runPilotOperationalReadiness,
} = require("../src/services/church/churchPilotOperationalReadinessService");

async function main() {
  const result = await runPilotOperationalReadiness({});
  // eslint-disable-next-line no-console
  console.log(result.reportText);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exitCode = result.exitCode;
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err && err.stack ? err.stack : err);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exitCode = 1;
});
