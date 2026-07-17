"use strict";

/**
 * Schema tests for V5 auth tables (ephemeral Postgres).
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

describe("blessboard auth schema", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let org;
  let churchId;
  let branchId;

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      const platform = await provisionPlatformTenant(pool, {
        organizationKey: "auth-schema-org",
        displayName: "Auth Schema Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "auth-schema-org",
        hostname: "auth-schema.blessboard.test",
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      org = platform.records.organization;
      const church = await provisionBlessBoardChurch(pool, {
        organizationKey: "auth-schema-org",
        churchKey: "auth-schema-org",
        displayName: "Auth Schema Org",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Headquarters",
      });
      churchId = church.records.church.id;
      branchId = church.records.hqBranch.id;
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

  it("auth tables exist; public session/tenants absent", async () => {
    requireDb();
    const platform = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_name = 'deployment_sessions'`
    );
    assert.equal(platform.rowCount, 1);
    const bb = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'blessboard' AND table_type = 'BASE TABLE'
        ORDER BY table_name`
    );
    assert.deepEqual(
      bb.rows.map((r) => r.table_name),
      ["branches", "churches", "user_roles", "users"]
    );
    const forbidden = await pool.query(
      `SELECT to_regclass('public.tenants') AS tenants, to_regclass('public.session') AS session`
    );
    assert.equal(forbidden.rows[0].tenants, null);
    assert.equal(forbidden.rows[0].session, null);
  });

  it("session token hash unique; invalid deployment rejected; expiry constraint", async () => {
    requireDb();
    const user = await pool.query(
      `INSERT INTO blessboard.users
         (email_normalized, email_display, password_hash, status, display_name)
       VALUES ('sess@example.org', 'sess@example.org', '$2a$12$abcdefghijklmnopqrstuv', 'active', 'Sess')
       RETURNING id`
    );
    const hash = "a".repeat(64);
    await pool.query(
      `INSERT INTO platform.deployment_sessions
         (session_token_hash, deployment_code, user_id, expires_at)
       VALUES ($1, 'blessboard-org-v5', $2, now() + interval '1 hour')`,
      [hash, user.rows[0].id]
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.deployment_sessions
             (session_token_hash, deployment_code, user_id, expires_at)
           VALUES ($1, 'blessboard-org-v5', $2, now() + interval '1 hour')`,
          [hash, user.rows[0].id]
        ),
      /unique|duplicate/i
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.deployment_sessions
             (session_token_hash, deployment_code, user_id, expires_at)
           VALUES ($1, 'missing-deployment', $2, now() + interval '1 hour')`,
          ["b".repeat(64), user.rows[0].id]
        ),
      /foreign key|violates/i
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO platform.deployment_sessions
             (session_token_hash, deployment_code, user_id, created_at, expires_at)
           VALUES ($1, 'blessboard-org-v5', $2, now(), now() - interval '1 minute')`,
          ["c".repeat(64), user.rows[0].id]
        ),
      /check|violates|expires/i
    );
  });

  it("email uniqueness is case-insensitive; invalid status rejected", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO blessboard.users
         (email_normalized, email_display, password_hash, status, display_name)
       VALUES ('case@example.org', 'Case@Example.org', '$2a$12$abcdefghijklmnopqrstuv', 'active', 'Case')`
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.users
             (email_normalized, email_display, password_hash, status, display_name)
           VALUES ('CASE@example.org', 'CASE@example.org', '$2a$12$abcdefghijklmnopqrstuv', 'active', 'Case2')`
        ),
      /unique|duplicate|check|violates/i
    );
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.users
             (email_normalized, email_display, password_hash, status, display_name)
           VALUES ('badstatus@example.org', 'badstatus@example.org', '$2a$12$abcdefghijklmnopqrstuv', 'retired', 'Bad')`
        ),
      /check|violates/i
    );
  });

  it("role scope rules and ownership triggers", async () => {
    requireDb();
    const user = await pool.query(
      `INSERT INTO blessboard.users
         (email_normalized, email_display, password_hash, status, display_name)
       VALUES ('roles@example.org', 'roles@example.org', '$2a$12$abcdefghijklmnopqrstuv', 'active', 'Roles')
       RETURNING id`
    );
    const userId = user.rows[0].id;

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.user_roles
             (user_id, organization_id, role_key, status)
           VALUES ($1, $2, 'superuser', 'active')`,
          [userId, org.id]
        ),
      /check|violates/i
    );

    await pool.query(
      `INSERT INTO blessboard.user_roles
         (user_id, organization_id, role_key, status)
       VALUES ($1, $2, 'platform_admin', 'active')`,
      [userId, org.id]
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.user_roles
             (user_id, organization_id, church_id, role_key, status)
           VALUES ($1, $2, $3, 'platform_admin', 'active')`,
          [userId, org.id, churchId]
        ),
      /check|violates|scope/i
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.user_roles
             (user_id, organization_id, role_key, status)
           VALUES ($1, $2, 'church_hq_admin', 'active')`,
          [userId, org.id]
        ),
      /check|violates|scope/i
    );

    await pool.query(
      `INSERT INTO blessboard.user_roles
         (user_id, organization_id, church_id, role_key, status)
       VALUES ($1, $2, $3, 'church_hq_admin', 'active')`,
      [userId, org.id, churchId]
    );

    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.user_roles
             (user_id, organization_id, church_id, role_key, status)
           VALUES ($1, $2, $3, 'branch_admin', 'active')`,
          [userId, org.id, churchId]
        ),
      /check|violates|scope/i
    );

    await pool.query(
      `INSERT INTO blessboard.user_roles
         (user_id, organization_id, church_id, branch_id, role_key, status)
       VALUES ($1, $2, $3, $4, 'branch_admin', 'active')`,
      [userId, org.id, churchId, branchId]
    );

    const otherOrg = await provisionPlatformTenant(pool, {
      organizationKey: "other-auth-org",
      displayName: "Other",
      legalName: null,
      dataEnvironment: "testing",
      productKey: "blessboard",
      productTenantKey: "other-auth-org",
      hostname: "other-auth.blessboard.test",
      domainType: "canonical",
      deploymentCode: "blessboard-org-v5",
      isPrimary: true,
    });
    await assert.rejects(
      () =>
        pool.query(
          `INSERT INTO blessboard.user_roles
             (user_id, organization_id, church_id, role_key, status)
           VALUES ($1, $2, $3, 'church_hq_admin', 'active')`,
          [userId, otherOrg.records.organization.id, churchId]
        ),
      /belong|integrity|violates/i
    );
  });
});
