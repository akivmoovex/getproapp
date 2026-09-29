#!/usr/bin/env node
"use strict";

/**
 * Read-only readiness probe for hosted TESTING website QA personas.
 *
 * Writes nothing. Refuses to run unless the connected database is the V7
 * testing identity, so it cannot be pointed at production by accident.
 *
 * Usage:
 *   scripts/local/run-with-blessboard-env.sh testing node scripts/local/qa-personas-probe.js
 */

const { Pool } = require("pg");
const { readIdentityRow } = require("../../db/scripts/lib/databaseIdentity");

function requireTestingEnv(env) {
  const problems = [];
  if (String(env.DEPLOYMENT_ENV || "") !== "testing") {
    problems.push(`DEPLOYMENT_ENV must be "testing" (got "${env.DEPLOYMENT_ENV || ""}")`);
  }
  if (String(env.DATABASE_IDENTITY_EXPECTED || "") !== "moovex-platform-v7") {
    problems.push(
      `DATABASE_IDENTITY_EXPECTED must be "moovex-platform-v7" (got "${env.DATABASE_IDENTITY_EXPECTED || ""}")`
    );
  }
  if (env.GETPRO_DATABASE_URL) {
    problems.push("GETPRO_DATABASE_URL must be unset");
  }
  if (!env.DATABASE_URL) problems.push("DATABASE_URL is required");
  return problems;
}

async function assertTestingIdentity(pool, env) {
  const row = await readIdentityRow(pool);
  if (!row) throw new Error("platform.database_identity row 1 is missing");
  if (row.identity_key !== String(env.DATABASE_IDENTITY_EXPECTED)) {
    throw new Error(
      `database identity mismatch: db="${row.identity_key}" expected="${env.DATABASE_IDENTITY_EXPECTED}"`
    );
  }
  if (String(row.environment_code) !== "testing") {
    throw new Error(`refusing to probe a non-testing database (environment_code=${row.environment_code})`);
  }
  return {
    identityKey: row.identity_key,
    environmentCode: row.environment_code,
    databaseName: row.database_name,
    hostFingerprint: row.host_fingerprint,
  };
}

async function main() {
  const env = process.env;
  const problems = requireTestingEnv(env);
  if (problems.length) {
    console.error("refusing to run:\n  - " + problems.join("\n  - "));
    process.exit(2);
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: env.GETPRO_PG_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined,
    max: 3,
    application_name: "qa-personas-probe",
  });

  const out = { ok: true, identity: null, deployments: [], blessboard: [], activeclinic: [] };
  try {
    out.identity = await assertTestingIdentity(pool, env);

    const deployments = await pool.query(
      `SELECT deployment_code, status, data_environment
         FROM platform.deployments
        ORDER BY deployment_code`
    );
    out.deployments = deployments.rows;

    // BlessBoard churches with their branch counts and website publication state.
    const bb = await pool.query(
      `SELECT o.organization_key,
              o.data_environment,
              c.church_key,
              c.display_name AS church_name,
              (SELECT count(*) FROM blessboard.branches b
                WHERE b.church_id = c.id AND b.status = 'active') AS active_branches,
              (SELECT string_agg(b.branch_key || ':' || b.display_name ||
                        CASE WHEN b.is_primary THEN ' (primary)' ELSE '' END, ', '
                        ORDER BY b.is_primary DESC, b.branch_key)
                 FROM blessboard.branches b
                WHERE b.church_id = c.id AND b.status = 'active') AS branches
         FROM blessboard.churches c
         JOIN platform.organizations o ON o.id = c.organization_id
        WHERE o.data_environment = 'testing'
        ORDER BY active_branches DESC, o.organization_key`
    );
    out.blessboard = bb.rows;

    const ac = await pool.query(
      `SELECT o.organization_key, o.data_environment, count(f.id) AS facilities
         FROM platform.organizations o
         LEFT JOIN activeclinic.facilities f ON f.organization_id = o.id
        WHERE o.data_environment = 'testing'
          AND EXISTS (SELECT 1 FROM activeclinic.facilities f2 WHERE f2.organization_id = o.id)
        GROUP BY o.organization_key, o.data_environment
        ORDER BY o.organization_key`
    );
    out.activeclinic = ac.rows;
  } catch (err) {
    out.ok = false;
    out.error = err.message;
  } finally {
    await pool.end();
  }

  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
