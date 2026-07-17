"use strict";

/**
 * BlessBoard churches/branches schema + constraint tests (ephemeral Postgres).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");

async function seedOrgWithEnrolment(pool, overrides = {}) {
  const organizationKey = overrides.organizationKey || `org-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const result = await provisionPlatformTenant(pool, {
    organizationKey,
    displayName: overrides.displayName || "Test Church Org",
    legalName: null,
    dataEnvironment: overrides.dataEnvironment || "testing",
    productKey: "blessboard",
    productTenantKey: organizationKey,
    hostname: `${organizationKey}.blessboard.test`,
    domainType: "canonical",
    deploymentCode: "blessboard-org-v5",
    isPrimary: true,
  });
  assert.equal(result.ok, true, result.message);
  return result.records.organization;
}

describe("blessboard catalogue schema", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("blessboard.churches and blessboard.branches exist", async () => {
    requireDb();
    const tables = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'blessboard' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    assert.deepEqual(
      tables.rows.map((r) => r.table_name),
      ["branches", "churches"]
    );
  });

  it("organization_id FK, uniqueness, and church_key uniqueness", async () => {
    requireDb();
    const org = await seedOrgWithEnrolment(pool, { organizationKey: "fk-church-org" });

    const fk = await pool.query(
      `SELECT 1
         FROM information_schema.table_constraints
        WHERE table_schema = 'blessboard'
          AND table_name = 'churches'
          AND constraint_type = 'FOREIGN KEY'
          AND constraint_name LIKE '%organization_id%'`
    );
    assert.ok(fk.rowCount >= 1, "organization_id foreign key must exist");

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.churches
             (organization_id, church_key, display_name, status, data_environment)
           VALUES ('00000000-0000-4000-8000-000000000099', 'ghost', 'Ghost', 'active', 'testing')`
        ),
      /foreign key|violates|enrolment|integrity/i
    );

    await pool.query(
      `INSERT INTO blessboard.churches
         (organization_id, church_key, display_name, status, data_environment)
       VALUES ($1, 'fk-church', 'FK Church', 'active', 'testing')`,
      [org.id]
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.churches
             (organization_id, church_key, display_name, status, data_environment)
           VALUES ($1, 'fk-church-2', 'Dup Org', 'active', 'testing')`,
          [org.id]
        ),
      /unique|duplicate/i
    );

    const org2 = await seedOrgWithEnrolment(pool, { organizationKey: "fk-church-org-2" });
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.churches
             (organization_id, church_key, display_name, status, data_environment)
           VALUES ($1, 'fk-church', 'Dup Key', 'active', 'testing')`,
          [org2.id]
        ),
      /unique|duplicate/i
    );
  });

  it("church_key and branch_key are immutable", async () => {
    requireDb();
    const org = await seedOrgWithEnrolment(pool, { organizationKey: "immutable-org" });
    const church = await pool.query(
      `INSERT INTO blessboard.churches
         (organization_id, church_key, display_name, status, data_environment)
       VALUES ($1, 'immutable-church', 'Immutable', 'active', 'testing')
       RETURNING id`,
      [org.id]
    );
    await assert.rejects(
      () =>
        pool.query(`UPDATE blessboard.churches SET church_key = 'renamed' WHERE id = $1`, [
          church.rows[0].id,
        ]),
      /immutable/i
    );

    const branch = await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary)
       VALUES ($1, 'hq', 'HQ', 'hq', 'active', true)
       RETURNING id`,
      [church.rows[0].id]
    );
    await assert.rejects(
      () =>
        pool.query(`UPDATE blessboard.branches SET branch_key = 'hq2' WHERE id = $1`, [
          branch.rows[0].id,
        ]),
      /immutable/i
    );
  });

  it("branch key unique within church; one HQ and one primary", async () => {
    requireDb();
    const org = await seedOrgWithEnrolment(pool, { organizationKey: "branch-rules-org" });
    const church = await pool.query(
      `INSERT INTO blessboard.churches
         (organization_id, church_key, display_name, status, data_environment)
       VALUES ($1, 'branch-rules-church', 'Branch Rules', 'active', 'testing')
       RETURNING id`,
      [org.id]
    );
    const churchId = church.rows[0].id;

    await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary)
       VALUES ($1, 'hq', 'HQ', 'hq', 'active', true)`,
      [churchId]
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.branches
             (church_id, branch_key, display_name, branch_type, status, is_primary)
           VALUES ($1, 'hq', 'Dup Key', 'branch', 'active', false)`,
          [churchId]
        ),
      /unique|duplicate/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.branches
             (church_id, branch_key, display_name, branch_type, status, is_primary)
           VALUES ($1, 'hq2', 'Second HQ', 'hq', 'active', false)`,
          [churchId]
        ),
      /unique|duplicate/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.branches
             (church_id, branch_key, display_name, branch_type, status, is_primary)
           VALUES ($1, 'east', 'East', 'branch', 'active', true)`,
          [churchId]
        ),
      /unique|duplicate/i
    );

    await pool.query(
      `INSERT INTO blessboard.branches
         (church_id, branch_key, display_name, branch_type, status, is_primary)
       VALUES ($1, 'east', 'East', 'branch', 'active', false)`,
      [churchId]
    );
  });

  it("rejects invalid church/branch status and branch_type", async () => {
    requireDb();
    const org = await seedOrgWithEnrolment(pool, { organizationKey: "status-org" });
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.churches
             (organization_id, church_key, display_name, status, data_environment)
           VALUES ($1, 'bad-status', 'Bad', 'retired', 'testing')`,
          [org.id]
        ),
      /check|violates/i
    );

    const church = await pool.query(
      `INSERT INTO blessboard.churches
         (organization_id, church_key, display_name, status, data_environment)
       VALUES ($1, 'status-church', 'Status', 'active', 'testing')
       RETURNING id`,
      [org.id]
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.branches
             (church_id, branch_key, display_name, branch_type, status, is_primary)
           VALUES ($1, 'hq', 'HQ', 'hq', 'retired', true)`,
          [church.rows[0].id]
        ),
      /check|violates/i
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.branches
             (church_id, branch_key, display_name, branch_type, status, is_primary)
           VALUES ($1, 'hq', 'HQ', 'campus', 'active', true)`,
          [church.rows[0].id]
        ),
      /check|violates/i
    );
  });

  it("requires active BlessBoard enrolment and matching environment", async () => {
    requireDb();
    const noEnrol = await pool.query(
      `INSERT INTO platform.organizations
         (organization_key, display_name, status, data_environment)
       VALUES ('no-enrol-org', 'No Enrol', 'active', 'testing')
       RETURNING id`
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.churches
             (organization_id, church_key, display_name, status, data_environment)
           VALUES ($1, 'no-enrol-church', 'No Enrol', 'active', 'testing')`,
          [noEnrol.rows[0].id]
        ),
      /enrolment|integrity/i
    );

    const org = await seedOrgWithEnrolment(pool, { organizationKey: "inactive-enrol-org" });
    await pool.query(
      `UPDATE platform.organization_products
          SET status = 'inactive'
        WHERE organization_id = $1`,
      [org.id]
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.churches
             (organization_id, church_key, display_name, status, data_environment)
           VALUES ($1, 'inactive-enrol-church', 'Inactive Enrol', 'active', 'testing')`,
          [org.id]
        ),
      /enrolment|integrity|active/i
    );
    await pool.query(
      `UPDATE platform.organization_products
          SET status = 'active'
        WHERE organization_id = $1`,
      [org.id]
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.churches
             (organization_id, church_key, display_name, status, data_environment)
           VALUES ($1, 'env-mismatch-church', 'Env Mismatch', 'active', 'production')`,
          [org.id]
        ),
      /data_environment|must match|integrity/i
    );
  });

  it("public tenants/session absent; getpro and ngo remain empty", async () => {
    requireDb();
    const forbidden = await pool.query(
      `SELECT to_regclass('public.tenants') AS tenants, to_regclass('public.session') AS session`
    );
    assert.equal(forbidden.rows[0].tenants, null);
    assert.equal(forbidden.rows[0].session, null);

    for (const schema of ["getpro", "ngo"]) {
      const t = await pool.query(
        `SELECT COUNT(*)::int AS n FROM information_schema.tables
          WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema]
      );
      assert.equal(t.rows[0].n, 0, schema);
    }
  });
});
