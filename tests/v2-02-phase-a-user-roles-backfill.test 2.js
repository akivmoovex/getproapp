"use strict";

/**
 * V2.02 Phase A — idempotent backfill legacy user_roles → catalogue assignments.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
const authzRepo = require("../src/blessboard/repositories/blessBoardAuthorizationRepository");

describe("V2.02 Phase A legacy user_roles → catalogue backfill", () => {
  let pool;
  let skip = false;
  let skipReason = "";
  let org;
  let church;
  let hqBranch;
  let users = {};

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });

      const platform = await provisionPlatformTenant(pool, {
        organizationKey: "bfill-a",
        displayName: "Backfill Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "bfill-a",
        hostname: "bfill-a.blessboard.org",
        domainType: "canonical",
        deploymentCode: "blessboard-org-staging",
        isPrimary: true,
      });
      assert.equal(platform.ok, true, platform.message);
      org = platform.records.organization;

      const ch = await provisionBlessBoardChurch(pool, {
        organizationKey: "bfill-a",
        churchKey: "bfill-a",
        displayName: "Backfill Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(ch.ok, true, ch.message);
      church = ch.records.church;
      hqBranch = ch.records.hqBranch || ch.records.primaryBranch;

      async function mk(email) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName: email,
          password: "Backfill-Password-123!",
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.pa = await mk("pa@bfill.test");
      users.hq = await mk("hq@bfill.test");
      users.ba = await mk("ba@bfill.test");

      // Migration 116 freezes INSERT into user_roles — disable for fixture seed only.
      await pool.query("ALTER TABLE blessboard.user_roles DISABLE TRIGGER trg_forbid_user_roles_insert");
      await pool.query(
        `INSERT INTO blessboard.user_roles
           (user_id, organization_id, church_id, branch_id, role_key, status)
         VALUES
           ($1, $4, NULL, NULL, 'platform_admin', 'active'),
           ($2, $4, $5, NULL, 'church_hq_admin', 'active'),
           ($3, $4, $5, $6, 'branch_admin', 'active')`,
        [users.pa.id, users.hq.id, users.ba.id, org.id, church.id, hqBranch.id]
      );
      await pool.query("ALTER TABLE blessboard.user_roles ENABLE TRIGGER trg_forbid_user_roles_insert");
    } catch (err) {
      skip = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skip) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("backfill creates catalogue assignments for PA / HQ / branch; second run is no-op", async () => {
    requireDb();

    // Fresh migrate already ran 117 against empty user_roles — re-run after fixture seed.
    const first = await pool.query(
      "SELECT blessboard.backfill_catalogue_assignments_from_user_roles() AS n"
    );
    assert.equal(Number(first.rows[0].n), 3);

    const second = await pool.query(
      "SELECT blessboard.backfill_catalogue_assignments_from_user_roles() AS n"
    );
    assert.equal(Number(second.rows[0].n), 0);

    const paRoles = await authzRepo.listActiveAuthorizationRoles(pool, users.pa.id);
    assert.ok(paRoles.some((r) => r.roleKey === "platform_administrator" && r.scopeType === "platform"));

    const hqRoles = await authzRepo.listActiveAuthorizationRoles(pool, users.hq.id);
    assert.ok(
      hqRoles.some(
        (r) =>
          r.roleKey === "organisation_administrator" &&
          r.scopeType === "church" &&
          String(r.churchId) === String(church.id)
      )
    );

    const baRoles = await authzRepo.listActiveAuthorizationRoles(pool, users.ba.id);
    assert.ok(
      baRoles.some(
        (r) =>
          r.roleKey === "branch_administrator" &&
          r.scopeType === "branch" &&
          String(r.branchId) === String(hqBranch.id)
      )
    );

    const hqRole = await rbacRepo.findRoleByKey(pool, "organisation_administrator");
    const assignments = await rbacRepo.listActiveAssignmentsForUser(pool, users.hq.id, org.id);
    const hqAssign = assignments.find((a) => a.roleId === hqRole.id);
    assert.ok(hqAssign);
    assert.equal(hqAssign.assignmentOrigin, "migration");
  });

  it("does not drop or unfreeze user_roles table", async () => {
    requireDb();
    const t = await pool.query(
      `SELECT to_regclass('blessboard.user_roles')::text AS table_name,
              (SELECT COUNT(*)::int FROM blessboard.user_roles WHERE status = 'active') AS active_n`
    );
    assert.equal(t.rows[0].table_name, "blessboard.user_roles");
    assert.ok(Number(t.rows[0].active_n) >= 3);

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.user_roles
             (user_id, organization_id, church_id, branch_id, role_key, status)
           VALUES ($1, $2, NULL, NULL, 'platform_admin', 'active')`,
          [users.pa.id, org.id]
        ),
      /frozen|user_roles/i
    );
  });
});
