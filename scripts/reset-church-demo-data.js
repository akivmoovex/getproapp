#!/usr/bin/env node
"use strict";

/**
 * Reset BlessBoard demo organisation public/content data only.
 * Refuses production / pilot / test organisations.
 *
 * Usage: node scripts/reset-church-demo-data.js
 * Optional: DEMO_ORG_ID=123 node scripts/reset-church-demo-data.js
 */

const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const churchDemoDataService = require("../src/services/church/churchDemoDataService");

async function main() {
  if (!isPgConfigured()) {
    console.error("PostgreSQL is not configured.");
    process.exit(1);
  }
  const pool = getPgPool();
  await ensureChurchSchema(pool);

  const orgIdRaw = process.env.DEMO_ORG_ID;
  let result;
  if (orgIdRaw) {
    result = await churchDemoDataService.resetDemoOrganisationContent(pool, Number(orgIdRaw), {
      actorLabel: "cli:reset-church-demo-data",
    });
  } else {
    result = await churchDemoDataService.resetCanonicalDemoOrganisation(pool, {
      actorLabel: "cli:reset-church-demo-data",
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        organizationId: result.organizationId,
        slug: result.slug,
        dataEnvironment: result.dataEnvironment,
      },
      null,
      2
    )
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(err && err.code === "RESET_FORBIDDEN" ? 2 : 1);
});
