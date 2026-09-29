#!/usr/bin/env node
"use strict";

/**
 * Repair demo-church publish readiness on the testing database.
 * Withdraws stale pending branch submissions that block HQ publish.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing node db/scripts/repair-demo-church-publish-readiness.js
 */

const { Pool } = require("pg");
const { requireDatabaseUrl } = require("./lib/databaseUrl");
const { buildFoundationPoolConfig } = require("./lib/foundationPool");
const { readIdentityRow } = require("./lib/databaseIdentity");
const {
  clearDemoChurchPublishBlockers,
} = require("../../src/blessboard/services/configureDemoChurch");
const {
  validateWebsitePublication,
} = require("../../src/blessboard/services/websitePublicationValidationService");

async function main() {
  if (String(process.env.DEPLOYMENT_ENV || "").toLowerCase() !== "testing") {
    console.error(
      JSON.stringify({ ok: false, reason: "DEPLOYMENT_ENV must be testing" }, null, 2)
    );
    process.exit(2);
  }

  const connectionString = requireDatabaseUrl();
  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 3 }));
  try {
    const identity = await readIdentityRow(pool);
    if (!identity || String(identity.environment_code || "").toLowerCase() !== "testing") {
      console.error(
        JSON.stringify({ ok: false, reason: "database_not_testing", identity }, null, 2)
      );
      process.exit(2);
    }

    const org = await pool.query(
      `SELECT o.id, o.organization_key, c.id AS church_id
         FROM platform.organizations o
         JOIN blessboard.churches c ON c.organization_id = o.id
        WHERE o.organization_key = 'demo-church'
        LIMIT 1`
    );
    if (!org.rows[0]) {
      console.error(JSON.stringify({ ok: false, reason: "demo_church_not_found" }, null, 2));
      process.exit(1);
    }

    const workflow = await clearDemoChurchPublishBlockers(pool, org.rows[0].id);
    const validation = await validateWebsitePublication(pool, {
      organizationId: org.rows[0].id,
      churchId: org.rows[0].church_id,
      deferServiceTimes: true,
      mobilePreviewConfirmed: true,
      relaxPreviewRequirement: true,
      relaxReadinessGaps: true,
    });

    const out = {
      ok: validation.publishable === true,
      organizationKey: org.rows[0].organization_key,
      workflow,
      publishable: validation.publishable,
      errorCodes: validation.errorCodes || [],
      errors: validation.errors || [],
      identity: {
        identityKey: identity.identity_key,
        environmentCode: identity.environment_code,
      },
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(out.ok ? 0 : 1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
  process.exit(1);
});
