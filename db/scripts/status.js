#!/usr/bin/env node
"use strict";

/**
 * Report migration status for the clean foundation.
 * Uses DATABASE_URL only. Never prints credentials.
 *
 * Usage: DATABASE_URL=… node db/scripts/status.js
 */

const { status } = require("./lib/migrator");

async function main() {
  try {
    const report = await status();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
    if (report.drift > 0) process.exit(2);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:status] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
