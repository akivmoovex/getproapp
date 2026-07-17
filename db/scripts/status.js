#!/usr/bin/env node
"use strict";

/**
 * Report migration status for the clean foundation (read-only).
 * Uses DATABASE_URL only. Never prints credentials. Never creates schemas/tables.
 *
 * Usage: DATABASE_URL=… node db/scripts/status.js
 */

const { status } = require("./lib/migrator");

async function main() {
  try {
    const report = await status();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, ...report }, null, 2));
    if (report.ledger_missing) process.exit(1);
    if (report.drift > 0) process.exit(2);
    if (report.pending > 0) process.exit(3);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:status] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
