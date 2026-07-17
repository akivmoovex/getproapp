#!/usr/bin/env node
"use strict";

/**
 * Cleanup synthetic controlled-pilot tenants by exact pilot id (testing only).
 *
 * Preview:
 *   DEPLOYMENT_ENV=testing DATABASE_URL=… \
 *     npm run church:pilot:cleanup -- --pilot-id=v5r1 --preview
 *
 * Delete:
 *   DEPLOYMENT_ENV=testing DATABASE_URL=… \
 *     npm run church:pilot:cleanup -- --pilot-id=v5r1 --confirm
 */

require("dotenv").config({ quiet: true });

const { getPgPool, isPgConfigured, closePgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const {
  cleanupControlledPilot,
  previewPilotCleanup,
  assertControlledPilotSafety,
  redactSecrets,
} = require("../src/services/church/churchControlledPilotSeedService");

function parseArgs(argv) {
  const out = { confirm: false, preview: false, pilotId: null };
  for (const arg of argv) {
    if (arg === "--confirm") out.confirm = true;
    else if (arg === "--preview") out.preview = true;
    else if (arg.startsWith("--pilot-id=")) out.pilotId = arg.slice("--pilot-id=".length);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!isPgConfigured()) {
    console.error("[church:pilot:cleanup] PostgreSQL is not configured.");
    process.exit(1);
  }
  const pool = getPgPool();
  await ensureChurchSchema(pool);

  if (args.preview && !args.confirm) {
    await assertControlledPilotSafety(pool, {
      requireConfirm: false,
      confirmed: false,
    });
    const preview = await previewPilotCleanup(pool, args.pilotId);
    console.log(redactSecrets(JSON.stringify({ ok: true, previewOnly: true, ...preview }, null, 2)));
    await closePgPool();
    return;
  }

  const result = await cleanupControlledPilot(pool, {
    pilotId: args.pilotId,
    confirm: args.confirm,
    previewOnly: args.preview && args.confirm,
  });
  console.log(
    redactSecrets(
      JSON.stringify(
        {
          ok: result.ok,
          alreadyGone: result.alreadyGone || false,
          previewOnly: result.previewOnly || false,
          pilotId: result.pilotId,
          deleted: result.deleted,
          previewCounts: result.preview && result.preview.counts,
        },
        null,
        2
      )
    )
  );
  await closePgPool();
}

main().catch(async (err) => {
  console.error(`[church:pilot:cleanup] ${err && err.message ? err.message : err}`);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exit(err && err.code === "PRODUCTION_REFUSED" ? 2 : 1);
});
