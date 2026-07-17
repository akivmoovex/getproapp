#!/usr/bin/env node
"use strict";

/**
 * Compact report for an existing controlled pilot (seed + flow status from last rehearse is not stored;
 * this re-seeds idempotently if needed and re-runs the rehearsal report path).
 *
 *   DEPLOYMENT_ENV=testing DATABASE_URL=… \
 *     npm run church:pilot:report -- --pilot-id=v5r1 --confirm
 */

require("dotenv").config({ quiet: true });

const { getPgPool, isPgConfigured, closePgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const {
  runControlledPilotRehearsal,
} = require("../src/services/church/churchControlledPilotRehearsalService");

function parseArgs(argv) {
  const out = { confirm: false, pilotId: null };
  for (const arg of argv) {
    if (arg === "--confirm") out.confirm = true;
    else if (arg.startsWith("--pilot-id=")) out.pilotId = arg.slice("--pilot-id=".length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPgConfigured()) {
    console.error("[church:pilot:report] PostgreSQL is not configured.");
    process.exit(1);
  }
  const pool = getPgPool();
  await ensureChurchSchema(pool);
  const result = await runControlledPilotRehearsal(pool, {
    pilotId: args.pilotId,
    confirm: args.confirm,
    requireConfirm: true,
  });
  console.log(result.reportText);
  await closePgPool();
  process.exitCode = result.report.readinessVerdict === "NOT_READY" ? 1 : 0;
}

main().catch(async (err) => {
  console.error(`[church:pilot:report] ${err && err.message ? err.message : err}`);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exit(err && err.code === "PRODUCTION_REFUSED" ? 2 : 1);
});
