"use strict";

/**
 * Read-only hosted testing website schema audit.
 * Aborts unless identity is moovex-platform-v7 / testing.
 * Optional: --apply-migrations via existing db:migrate after identity check.
 */

const { Client } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");

const EXPECTED = Object.freeze({
  identityKey: "moovex-platform-v7",
  environment: "testing",
  migrations: [
    { module: "platform", version: "027", filename: "027_website_engine.sql" },
    { module: "blessboard", version: "093", filename: "093_website_engine_permissions.sql" },
    { module: "activeclinic", version: "026", filename: "026_clinic_registration_provisioning.sql" },
  ],
  tables: [
    "platform.website_instances",
    "platform.website_content",
    "platform.website_media",
    "platform.website_media_usages",
    "platform.website_submissions",
    "platform.website_versions",
    "platform.website_audit_events",
    "platform.website_checklist_state",
  ],
});

async function main() {
  const url = requireDatabaseUrl();
  const client = new Client({ connectionString: url });
  await client.connect();
  const report = { identity: null, migrations: [], tables: {}, blockers: [] };
  try {
    const id = await client.query(
      `SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`
    );
    report.identity = id.rows[0] || null;
    if (
      !report.identity ||
      report.identity.identity_key !== EXPECTED.identityKey ||
      String(report.identity.environment_code) !== EXPECTED.environment
    ) {
      report.blockers.push("HOSTED_TEST_DB_IDENTITY_MISMATCH");
      console.log(JSON.stringify(report, null, 2));
      process.exitCode = 2;
      return;
    }
    const applied = await client.query(
      `SELECT module, version, filename FROM platform.schema_migrations
        WHERE (module, version) IN (('platform','027'),('blessboard','093'),('activeclinic','026'))
        ORDER BY module, version`
    );
    report.migrations = applied.rows;
    for (const wanted of EXPECTED.migrations) {
      if (!applied.rows.some((r) => r.module === wanted.module && r.version === wanted.version)) {
        report.blockers.push(`MIGRATION_MISSING_${wanted.module}_${wanted.version}`);
      }
    }
    for (const qualified of EXPECTED.tables) {
      const [schema, table] = qualified.split(".");
      const exists = await client.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2`,
        [schema, table]
      );
      report.tables[qualified] = exists.rowCount > 0;
      if (!exists.rowCount) report.blockers.push(`TABLE_MISSING_${qualified}`);
    }
    if (report.tables["platform.website_instances"]) {
      const cols = await client.query(
        `SELECT is_nullable FROM information_schema.columns
          WHERE table_schema = 'platform' AND table_name = 'website_instances' AND column_name = 'scope_ref'`
      );
      report.scopeRefNullable = cols.rows[0] && cols.rows[0].is_nullable === "YES";
      const counts = await client.query(
        `SELECT
            (SELECT count(*)::int FROM platform.organizations) AS organizations,
            (SELECT count(*)::int FROM platform.website_instances) AS instances,
            (SELECT count(*)::int FROM blessboard.permissions WHERE permission_key LIKE 'website.%') AS website_permissions,
            (SELECT count(*)::int FROM platform.website_audit_events) AS audit_events`
      );
      report.counts = counts.rows[0];
    }
    report.verdict = report.blockers.length
      ? report.blockers[0]
      : "HOSTED_TEST_DB_WEBSITE_SCHEMA_READY";
    console.log(JSON.stringify(report, null, 2));
    if (report.blockers.length) process.exitCode = 3;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err && err.message ? String(err.message) : String(err));
  process.exitCode = 1;
});
