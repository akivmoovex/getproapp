#!/usr/bin/env node
"use strict";

/**
 * READ-ONLY production vs testing schema compatibility audit.
 * No DDL/DML. Does not print secrets.
 *
 *   scripts/local/run-with-blessboard-env.sh production \
 *     node scripts/local/v7-prod-schema-compat-audit.js
 *
 * Optionally set TESTING_DATABASE_URL for side-by-side compare.
 *
 * Known false-positive identifiers (do NOT query these; they are not V7 defects):
 *   blessboard.registration_applications  → blessboard.platform_church_registration_applications
 *   blessboard.memberships                → blessboard.member_branch_memberships
 *   blessboard.users.organization_id      → blessboard.user_roles.organization_id
 *   blessboard.users.church_id            → blessboard.user_roles.church_id
 *   apps.public_reference                 → public_registration_reference
 *   apps.organization_key                 → join platform.organizations via organization_id
 *   deployments.primary_domain            → canonical_domain
 *   information_schema filters must use 'blessboard' (single quotes), never "blessboard"
 */

const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("../../db/scripts/lib/databaseUrl");
const { buildFoundationPoolConfig } = require("../../db/scripts/lib/foundationPool");
const { checkDatabaseIdentity } = require("../../db/scripts/lib/databaseIdentity");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

async function audit(label, connectionString) {
  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  const out = { label };
  try {
    const identity = await checkDatabaseIdentity(pool, {
      identityKey: "moovex-platform-v7",
    });
    out.identity = {
      ok: identity.ok,
      key: identity.row && identity.row.identity_key,
      env: identity.row && identity.row.environment_code,
    };

    out.migrationCount = Number(
      (await pool.query(`SELECT count(*)::int AS n FROM platform.schema_migrations`)).rows[0].n
    );
    out.latestMigrations = (
      await pool.query(
        `SELECT filename, applied_at
           FROM platform.schema_migrations
          ORDER BY applied_at DESC
          LIMIT 12`
      )
    ).rows;

    out.schemas = (
      await pool.query(
        `SELECT schema_name FROM information_schema.schemata
          WHERE schema_name IN ('blessboard','platform','activeclinic','public','identity')
          ORDER BY 1`
      )
    ).rows.map((r) => r.schema_name);

    out.regclasses = (
      await pool.query(
        `SELECT to_regclass('blessboard.memberships') AS memberships,
                to_regclass('blessboard.member_branch_memberships') AS member_branch_memberships,
                to_regclass('blessboard.ministry_memberships') AS ministry_memberships,
                to_regclass('blessboard.cell_memberships') AS cell_memberships,
                to_regclass('blessboard.department_memberships') AS department_memberships,
                to_regclass('blessboard.members') AS members,
                to_regclass('blessboard.users') AS users,
                to_regclass('blessboard.user_roles') AS user_roles,
                to_regclass('platform.organizations') AS organizations,
                to_regclass('platform.identities') AS identities,
                to_regclass('platform.organization_memberships') AS platform_organization_memberships,
                to_regclass('public.users') AS public_users,
                to_regclass('activeclinic.staff_members') AS staff_members`
      )
    ).rows[0];

    out.blessboardUsersColumns = (
      await pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema='blessboard' AND table_name='users'
          ORDER BY ordinal_position`
      )
    ).rows.map((r) => r.column_name);
    out.usersHasOrganizationId = out.blessboardUsersColumns.includes("organization_id");

    out.userRolesColumns = (
      await pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema='blessboard' AND table_name='user_roles'
          ORDER BY ordinal_position`
      )
    ).rows.map((r) => r.column_name);

    out.membershipLikeTables = (
      await pool.query(
        `SELECT table_schema, table_name
           FROM information_schema.tables
          WHERE table_schema IN ('blessboard','platform','activeclinic','public')
            AND table_name ILIKE '%membership%'
          ORDER BY 1,2`
      )
    ).rows;

    out.keyMigrations = (
      await pool.query(
        `SELECT filename, applied_at
           FROM platform.schema_migrations
          WHERE filename LIKE '%004_create_users%'
             OR filename LIKE '%005_create_user_roles%'
             OR filename LIKE '%020_create_members%'
             OR filename LIKE '%061_member_journey_memberships%'
             OR filename LIKE '%076_users_platform_identity%'
          ORDER BY filename`
      )
    ).rows;

    out.appliedByPrefix = {
      blessboard: Number(
        (
          await pool.query(
            `SELECT count(*)::int AS n FROM platform.schema_migrations
              WHERE filename LIKE 'db/migrations/blessboard/%'
                 OR filename LIKE 'blessboard/%'`
          )
        ).rows[0].n
      ),
      platform: Number(
        (
          await pool.query(
            `SELECT count(*)::int AS n FROM platform.schema_migrations
              WHERE filename LIKE 'db/migrations/platform/%'
                 OR filename LIKE 'platform/%'`
          )
        ).rows[0].n
      ),
      activeclinic: Number(
        (
          await pool.query(
            `SELECT count(*)::int AS n FROM platform.schema_migrations
              WHERE filename LIKE 'db/migrations/activeclinic/%'
                 OR filename LIKE 'activeclinic/%'`
          )
        ).rows[0].n
      ),
    };

    // Optional negative probes (off by default — they intentionally error and
    // appear in Supabase logs). Set SCHEMA_AUDIT_NEGATIVE_PROBES=1 to enable.
    out.probes = [];
    if (String(process.env.SCHEMA_AUDIT_NEGATIVE_PROBES || "") === "1") {
      const probes = [];
      try {
        await pool.query(`SELECT 1 FROM blessboard.memberships LIMIT 1`);
        probes.push({ sql: "SELECT 1 FROM blessboard.memberships LIMIT 1", ok: true });
      } catch (err) {
        probes.push({
          sql: "SELECT 1 FROM blessboard.memberships LIMIT 1",
          ok: false,
          code: err.code,
          message: String(err.message || "").slice(0, 200),
        });
      }
      try {
        await pool.query(`SELECT u.organization_id FROM blessboard.users u LIMIT 1`);
        probes.push({
          sql: "SELECT u.organization_id FROM blessboard.users u LIMIT 1",
          ok: true,
        });
      } catch (err) {
        probes.push({
          sql: "SELECT u.organization_id FROM blessboard.users u LIMIT 1",
          ok: false,
          code: err.code,
          message: String(err.message || "").slice(0, 200),
        });
      }
      try {
        await pool.query(
          `SELECT u.organization_id FROM blessboard.user_roles u LIMIT 1`
        );
        probes.push({
          sql: "SELECT u.organization_id FROM blessboard.user_roles u LIMIT 1",
          ok: true,
        });
      } catch (err) {
        probes.push({
          sql: "SELECT u.organization_id FROM blessboard.user_roles u LIMIT 1",
          ok: false,
          code: err.code,
          message: String(err.message || "").slice(0, 200),
        });
      }
      out.probes = probes;
    }

    // Contiguity: list applied blessboard filenames for gap analysis by caller.
    out.appliedBlessboardFilenames = (
      await pool.query(
        `SELECT filename FROM platform.schema_migrations
          WHERE filename LIKE '%/blessboard/%' OR filename LIKE 'blessboard/%'
          ORDER BY filename`
      )
    ).rows.map((r) => r.filename);

    return out;
  } finally {
    await pool.end().catch(() => {});
  }
}

function listRepoMigrations(dirRel) {
  const root = path.join(__dirname, "../..", dirRel);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root)
    .filter((f) => f.endsWith(".sql") && !f.includes(" 2."))
    .sort();
}

async function main() {
  const prodUrl = requireDatabaseUrl();
  if (process.env.PLATFORM_DEPLOYMENT_CODE !== "moovex-platform-production") {
    console.error("refuse: expected production deployment code via env wrapper");
    process.exit(2);
  }

  const testingEnv = loadEnvFile(
    path.join(__dirname, "../../.env.testing.local")
  );
  const testingUrl =
    process.env.TESTING_DATABASE_URL || testingEnv.DATABASE_URL || "";

  const repo = {
    blessboard: listRepoMigrations("db/migrations/blessboard"),
    platform: listRepoMigrations("db/migrations/platform"),
    activeclinic: listRepoMigrations("db/migrations/activeclinic"),
  };
  repo.totals = {
    blessboard: repo.blessboard.length,
    platform: repo.platform.length,
    activeclinic: repo.activeclinic.length,
    all:
      repo.blessboard.length + repo.platform.length + repo.activeclinic.length,
  };

  const production = await audit("production", prodUrl);
  let testing = null;
  if (testingUrl && testingUrl !== prodUrl) {
    testing = await audit("testing", testingUrl);
  }

  function missing(appliedList, repoList, prefixHint) {
    const appliedNorm = new Set(
      (appliedList || []).map((f) => {
        const base = String(f).split("/").pop();
        return base;
      })
    );
    return repoList.filter((f) => !appliedNorm.has(f));
  }

  const report = {
    kind: "PRODUCTION_SCHEMA_COMPAT_AUDIT",
    runtime: {
      deploymentCode: process.env.PLATFORM_DEPLOYMENT_CODE || null,
      deploymentEnv: process.env.DEPLOYMENT_ENV || null,
      dataEnvironment:
        process.env.PLATFORM_DATA_ENVIRONMENT ||
        process.env.DATA_ENVIRONMENT ||
        null,
    },
    repoMigrationFiles: repo.totals,
    production,
    testing,
    missingVsRepo: {
      productionBlessboard: missing(
        production.appliedBlessboardFilenames,
        repo.blessboard
      ),
      testingBlessboard: testing
        ? missing(testing.appliedBlessboardFilenames, repo.blessboard)
        : null,
    },
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      kind: "PRODUCTION_SCHEMA_COMPAT_AUDIT_FAIL",
      error: String(err.message || err).slice(0, 400),
    })
  );
  process.exit(1);
});
