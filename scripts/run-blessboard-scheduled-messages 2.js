#!/usr/bin/env node
"use strict";

/**
 * Process due scheduled BlessBoard V5 messages.
 * Honors BLESSBOARD_JOBS_ENABLED via blessBoardJobsGate.
 */

const { Pool } = require("pg");
const { shouldRunBlessBoardScheduledJob } = require("../src/startup/blessBoardJobsGate");
const { processDueScheduledMessages } = require("../src/blessboard/services/messageService");

async function main() {
  if (!shouldRunBlessBoardScheduledJob("blessboard_scheduled_messages")) {
    process.exit(0);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL || process.env.FOUNDATION_DATABASE_URL;
  if (!databaseUrl) {
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ ok: false, error: "DATABASE_URL required" }));
    process.exit(1);
    return;
  }

  const livePool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await processDueScheduledMessages(livePool, {
      env: process.env,
      limit: 50,
    });
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, ...result }));
  } finally {
    await livePool.end();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ ok: false, error: String(err && err.message ? err.message : err) }));
  process.exit(1);
});
