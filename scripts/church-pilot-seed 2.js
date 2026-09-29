#!/usr/bin/env node
"use strict";

/**
 * Seed deterministic Foundation + Growth controlled pilot tenants (testing only).
 *
 *   DEPLOYMENT_ENV=testing DATABASE_URL=… \
 *     npm run church:pilot:seed -- --pilot-id=v5r1 --confirm
 */

require("../src/startup/localEnvSafety").loadRepoDotenvForCliOrExit();

const { getPgPool, isPgConfigured, closePgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const {
  seedControlledPilot,
  redactSecrets,
} = require("../src/services/church/churchControlledPilotSeedService");

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
    console.error("[church:pilot:seed] PostgreSQL is not configured.");
    process.exit(1);
  }
  const pool = getPgPool();
  await ensureChurchSchema(pool);
  const result = await seedControlledPilot(pool, {
    pilotId: args.pilotId,
    confirm: args.confirm,
  });
  const safe = {
    ok: result.ok,
    idempotent: result.idempotent,
    pilotId: result.pilotId,
    marker: result.marker,
    foundation: {
      id: result.foundation.organization.id,
      slug: result.foundation.organization.slug,
      package: result.foundation.organization.plan_code,
      hosts: result.foundation.hosts,
      branches: result.foundation.branches.length,
    },
    growth: {
      id: result.growth.organization.id,
      slug: result.growth.organization.slug,
      package: result.growth.organization.plan_code,
      hosts: result.growth.hosts,
      branches: result.growth.branches.length,
    },
  };
  console.log(redactSecrets(JSON.stringify(safe, null, 2)));
  await closePgPool();
}

main().catch(async (err) => {
  console.error(`[church:pilot:seed] ${err && err.message ? err.message : err}`);
  try {
    await closePgPool();
  } catch {
    /* ignore */
  }
  process.exit(err && err.code === "PRODUCTION_REFUSED" ? 2 : 1);
});
