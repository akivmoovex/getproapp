"use strict";

const { Pool } = require("pg");
const { parseDatabaseHost } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { statusReadOnly } = require("../../db/scripts/lib/migrator");

async function main() {
  const url = process.env.DATABASE_URL;
  const host = parseDatabaseHost(url);
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    console.error("ABORT: not local clone");
    process.exit(2);
  }
  const pool = new Pool(buildFoundationPoolConfig(url, { max: 2 }));
  const q = (sql, params) => pool.query(sql, params);
  try {
    const status = await statusReadOnly({ pool });
    const slow = [...status.rows]
      .filter((r) => r.execution_ms != null)
      .sort((a, b) => b.execution_ms - a.execution_ms)
      .slice(0, 15)
      .map((r) => ({ key: `${r.module}/${r.filename}`, ms: r.execution_ms }));

    const report = {
      host,
      identity: (await q(`SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`)).rows[0],
      migrations: { applied: status.applied, pending: status.pending, drift: status.drift },
      slowest: slow,
      tables: (
        await q(
          `SELECT table_schema, count(*)::int AS n FROM information_schema.tables
            WHERE table_schema IN ('platform','blessboard','getpro','ngo','activeclinic')
            GROUP BY 1 ORDER BY 1`
        )
      ).rows,
      organizations: (await q(`SELECT organization_key, data_environment, status FROM platform.organizations ORDER BY 1`)).rows,
      churches: (await q(`SELECT church_key, data_environment, status FROM blessboard.churches ORDER BY 1`)).rows,
      publicPages: (await q(`SELECT page_key, status FROM blessboard.public_pages ORDER BY 1`)).rows,
      deployments: (
        await q(
          `SELECT deployment_code, environment_code, status, canonical_domain, session_cookie_name
             FROM platform.deployments ORDER BY 1`
        )
      ).rows,
      deploymentDupes: (
        await q(
          `SELECT deployment_code, count(*)::int n FROM platform.deployments GROUP BY 1 HAVING count(*) > 1`
        )
      ).rows,
      domainDupes: (await q(`SELECT hostname, count(*)::int n FROM platform.domains GROUP BY 1 HAVING count(*) > 1`)).rows,
      domains: (await q(`SELECT hostname, status FROM platform.domains ORDER BY 1`)).rows,
      permissionDupes: (
        await q(
          `SELECT permission_key, count(*)::int n FROM blessboard.permissions GROUP BY 1 HAVING count(*) > 1`
        )
      ).rows,
      rolePermissionCount: (await q(`SELECT count(*)::int n FROM blessboard.role_permissions`)).rows[0].n,
      permissionCount: (await q(`SELECT count(*)::int n FROM blessboard.permissions`)).rows[0].n,
      clinics: (await q(`SELECT count(*)::int n FROM activeclinic.healthcare_organizations`)).rows[0].n,
      registrations: (await q(`SELECT count(*)::int n FROM activeclinic.clinic_registration_applications`)).rows[0].n,
      websiteTables: (
        await q(
          `SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'platform' AND table_name LIKE 'website_%' ORDER BY 1`
        )
      ).rows.map((r) => r.table_name),
      websiteInstances: (await q(`SELECT count(*)::int n FROM platform.website_instances`)).rows[0].n,
      websiteContent: (await q(`SELECT count(*)::int n FROM platform.website_content`)).rows[0].n,
      users: (await q(`SELECT count(*)::int n FROM blessboard.users`)).rows[0].n,
    };
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
