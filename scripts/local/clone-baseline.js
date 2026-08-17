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
  try {
    const q = (sql, params) => pool.query(sql, params);
    const status = await statusReadOnly({ pool });
    const tables = await q(
      `SELECT table_schema, count(*)::int AS n FROM information_schema.tables
        WHERE table_schema IN ('platform','blessboard','getpro','ngo','activeclinic')
        GROUP BY 1 ORDER BY 1`
    );
    const constraints = await q(
      `SELECT constraint_type, count(*)::int AS n
         FROM information_schema.table_constraints
        WHERE table_schema IN ('platform','blessboard')
        GROUP BY 1 ORDER BY 1`
    );
    const report = {
      host,
      identity: (await q(`SELECT identity_key, environment_code FROM platform.database_identity LIMIT 1`)).rows[0],
      migrations: { applied: status.applied, pending: status.pending, drift: status.drift },
      pending: status.rows.filter((r) => r.state === "pending").map((r) => `${r.module}/${r.filename}`),
      tables: tables.rows,
      constraints: constraints.rows,
      organizations: (await q(`SELECT organization_key, data_environment, status FROM platform.organizations ORDER BY 1`)).rows,
      churches: (await q(`SELECT church_key, data_environment, status FROM blessboard.churches ORDER BY 1`)).rows,
      users: (await q(`SELECT count(*)::int AS n FROM blessboard.users`)).rows[0].n,
      userRoles: (await q(`SELECT role_key, count(*)::int n FROM blessboard.user_roles GROUP BY 1 ORDER BY 1`)).rows,
      publicPages: (await q(`SELECT page_key, status FROM blessboard.public_pages ORDER BY 1`)).rows,
      deployments: (await q(`SELECT deployment_code, environment_code, status, canonical_domain, session_cookie_name FROM platform.deployments ORDER BY 1`)).rows,
      domains: (await q(`SELECT hostname, status, deployment_id FROM platform.domains ORDER BY 1`)).rows,
      sessions: (await q(`SELECT count(*)::int AS n FROM platform.deployment_sessions`)).rows[0].n,
      rolePermissionsTable:
        (await q(`SELECT 1 FROM information_schema.tables WHERE table_schema='blessboard' AND table_name='role_permissions'`)).rowCount > 0,
      activeclinic: (await q(`SELECT 1 FROM information_schema.schemata WHERE schema_name='activeclinic'`)).rowCount > 0,
      websiteTables: (
        await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='platform' AND table_name LIKE 'website_%'`)
      ).rows,
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
