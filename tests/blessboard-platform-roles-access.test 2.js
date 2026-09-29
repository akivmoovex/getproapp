"use strict";

/**
 * Prompt 13C: Platform Admin roles catalogue and access health.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const { provisionBlessBoardChurch } = require("../src/blessboard/services/provisionBlessBoardChurch");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { assignBlessBoardRole } = require("../src/blessboard/services/assignBlessBoardRole");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  listPlatformRoleCatalogue,
  getPlatformRoleDetail,
} = require("../src/platform/services/platformAdminRolesService");
const {
  getPlatformAccessHealth,
} = require("../src/platform/services/platformAdminAccessHealthService");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST = "roles-sys.blessboard.org";
const DEPLOYMENT = "blessboard-org-staging";
const PASSWORD = "correct-horse-battery-staple";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: DEPLOYMENT,
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    BLESSBOARD_APEX_ORIGIN: "https://blessboard.org",
    ...overrides,
  };
}

describe("blessboard platform roles and access", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let users = {};

  before(async () => {
    try {
      process.env.PLATFORM_DEPLOYMENT_CODE = DEPLOYMENT;
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const prov = await provisionPlatformTenant(pool, {
        organizationKey: "roles-sys-org",
        displayName: "Roles Sys Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "roles-sys-org",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const churchProv = await provisionBlessBoardChurch(pool, {
        organizationKey: "roles-sys-org",
        churchKey: "roles-sys-org",
        displayName: "Roles Sys Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(churchProv.ok, true, churchProv.message);
      church = churchProv.records.church;

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("roles-pa@example.org", "Roles PA");
      users.hq = await makeUser("roles-hq@example.org", "Roles HQ");
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "roles-pa@example.org",
            organizationKey: "roles-sys-org",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "roles-hq@example.org",
            organizationKey: "roles-sys-org",
            roleKey: "church_hq_admin",
            churchKey: "roles-sys-org",
          })
        ).ok,
        true
      );

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
      });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function cookieFor(user) {
    const session = await createV5Session(pool, {
      deploymentCode: DEPLOYMENT,
      userId: user.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: null,
    });
    assert.equal(session.ok, true, session.code);
    return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
  }

  it("lists role catalogue with groups and detail permissions", async () => {
    requireDb();
    const catalogue = await listPlatformRoleCatalogue(pool, {
      actorUserId: users.platform.id,
    });
    assert.equal(catalogue.ok, true, catalogue.reason);
    assert.ok((catalogue.roles || []).length > 0);
    assert.ok(catalogue.grouped && typeof catalogue.grouped === "object");
    const sample = catalogue.roles[0];
    assert.ok(sample.roleKey);
    assert.ok(sample.displayName);
    const detail = await getPlatformRoleDetail(pool, {
      actorUserId: users.platform.id,
      roleKey: sample.roleKey,
    });
    assert.equal(detail.ok, true, detail.reason);
    assert.ok(detail.role);
    assert.ok(Array.isArray(detail.role.permissions) || Array.isArray(detail.role.permissionGroups));
  });

  it("returns access-health counts without confidential payloads", async () => {
    requireDb();
    const health = await getPlatformAccessHealth(pool, {
      actorUserId: users.platform.id,
    });
    assert.equal(health.ok, true, health.reason);
    assert.ok(Array.isArray(health.checks));
    assert.ok(health.checks.length >= 5);
    const blob = JSON.stringify(health);
    assert.doesNotMatch(blob, /password|otp|token|SESSION_SECRET|pastoral note|transaction/i);
  });

  it("serves roles and access-health pages to Platform Admin only", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const roles = await request(app)
      .get("/admin/roles")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(roles.status, 200);
    assert.match(roles.text, /data-bb-pa-roles="1"/);
    assert.match(roles.text, /href="\/admin\/access-health"/);
    assert.doesNotMatch(roles.text, /method="post"[^>]*roles/i);

    const health = await request(app)
      .get("/admin/access-health")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(health.status, 200);
    assert.match(health.text, /data-bb-pa-access-health="1"/);

    const hq = await request(app)
      .get("/admin/roles")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hq.status, 403);
  });

  it("settings links to roles and access-health", async () => {
    requireDb();
    const page = await request(app)
      .get("/admin/settings")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.platform));
    assert.equal(page.status, 200);
    assert.match(page.text, /href="\/admin\/roles"/);
    assert.match(page.text, /href="\/admin\/access-health"/);
  });
});
