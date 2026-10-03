"use strict";

/**
 * Regression: live BB demo/readiness/admin paths must not depend on public.tenants.
 * V2.05 production uses platform.organizations (+ blessboard.*) for tenant/org identity.
 */

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const {
  seedChurchDemoOrganizationIfMissing,
} = require("../src/seeds/seedChurchDemoOrganization");
const {
  runPilotOperationalReadiness,
} = require("../src/services/church/churchPilotOperationalReadinessService");
const platformUsersRepo = require("../src/db/pg/church/platformUsersRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");

/** Matches live SQL that reads/writes the legacy tenants relation (not comments). */
const LEGACY_TENANTS_QUERY =
  /\b(?:FROM|INTO|JOIN|UPDATE|REFERENCES)\s+(?:public\.)?tenants\b/i;

function stripSqlComments(text) {
  return String(text || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

function sourceMentionsPublicTenants(relPath) {
  const abs = path.join(__dirname, "..", relPath);
  const text = fs.readFileSync(abs, "utf8");
  const code = stripSqlComments(text);
  return LEGACY_TENANTS_QUERY.test(code) || /require\([^)]*tenantsRepo/.test(code);
}

test("demo seed source does not reference public.tenants or tenantsRepo", () => {
  assert.equal(
    sourceMentionsPublicTenants("src/seeds/seedChurchDemoOrganization.js"),
    false,
    "seedChurchDemoOrganization must not query public.tenants / tenantsRepo"
  );
});

test("sample church seed source does not reference public.tenants or tenantsRepo", () => {
  assert.equal(
    sourceMentionsPublicTenants("src/seeds/seedChurchSampleOrganization.js"),
    false,
    "seedChurchSampleOrganization must not query public.tenants / tenantsRepo"
  );
});

test("church core DDL no longer FK-references public.tenants", () => {
  const sql = fs.readFileSync(
    path.join(__dirname, "../db/postgres/049_church_core.sql"),
    "utf8"
  );
  assert.doesNotMatch(sql, /REFERENCES\s+public\.tenants/i);
});

test(
  "live BB seed/readiness/admin queries never touch public.tenants",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    const hits = [];
    const origQuery = pool.query.bind(pool);
    pool.query = async function traced(sql, params) {
      const text =
        typeof sql === "string" ? sql : sql && sql.text ? String(sql.text) : String(sql);
      if (LEGACY_TENANTS_QUERY.test(stripSqlComments(text))) {
        hits.push(text.replace(/\s+/g, " ").slice(0, 200));
      }
      return origQuery(sql, params);
    };

    try {
      const before = await origQuery(`SELECT to_regclass('public.tenants') AS t`);
      const tenantsPresentBefore = Boolean(before.rows[0] && before.rows[0].t);

      await ensureChurchSchema(pool);
      await seedChurchDemoOrganizationIfMissing(pool);
      await runPilotOperationalReadiness({ pool, expectEnv: null });
      await platformUsersRepo.listPlatformChurchAdmins(pool, { page: 1, limit: 5 });
      await auditLogsRepo.listAuditLogsForPlatform(pool, { page: 1, limit: 5, offset: 0 });

      assert.deepEqual(hits, [], `legacy public.tenants SQL observed: ${hits.join(" | ")}`);

      const after = await origQuery(`SELECT to_regclass('public.tenants') AS t`);
      const tenantsPresentAfter = Boolean(after.rows[0] && after.rows[0].t);
      assert.equal(
        tenantsPresentAfter,
        tenantsPresentBefore,
        "paths must not create or drop public.tenants"
      );
    } finally {
      pool.query = origQuery;
    }
  }
);
