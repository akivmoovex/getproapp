#!/usr/bin/env node
"use strict";

/**
 * Apply clean-foundation migrations and seeds.
 * Uses DATABASE_URL only. Never prints credentials. Never initializes identity.
 *
 * Usage: DATABASE_URL=… node db/scripts/migrate.js
 */

const { migrate } = require("./lib/migrator");

async function main() {
  try {
    const summary = await migrate();
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          applied: summary.applied,
          skipped: summary.skipped,
          seeds_applied: summary.seedsApplied,
          seeds_skipped: summary.seedsSkipped,
        },
        null,
        2
      )
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[db:migrate] ${err && err.message ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
