"use strict";

/**
 * Prompt 13B: Deployments as System technical diagnostics.
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
const { PLATFORM_ADMIN_NAV } = require("../src/platform/http/platformAdminNav");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST = "deploy-sys.blessboard.org";
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

describe("blessboard platform deployments system", () => {
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
        organizationKey: "deploy-sys-org",
        displayName: "Deploy Sys Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "deploy-sys-org",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const churchProv = await provisionBlessBoardChurch(pool, {
        organizationKey: "deploy-sys-org",
        churchKey: "deploy-sys-org",
        displayName: "Deploy Sys Church",
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

      users.platform = await makeUser("deploy-pa@example.org", "Deploy PA");
      users.hq = await makeUser("deploy-hq@example.org", "Deploy HQ");
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "deploy-pa@example.org",
            organizationKey: "deploy-sys-org",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "deploy-hq@example.org",
            organizationKey: "deploy-sys-org",
            roleKey: "church_hq_admin",
            churchKey: "deploy-sys-org",
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

  it("removes deployments from daily nav and nests under System", () => {
    requireDb();
    const daily = PLATFORM_ADMIN_NAV.find((i) => i.key === "deployments" && !i.children);
    assert.equal(daily, undefined);
    const system = PLATFORM_ADMIN_NAV.find((i) => i.key === "system");
    assert.ok(system);
    assert.ok(system.children.some((c) => c.href === "/admin/system/deployments"));
  });

  it("redirects old route and serves technical page", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const redirected = await request(app)
      .get("/admin/deployments")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .redirects(0);
    assert.equal(redirected.status, 302);
    assert.equal(redirected.headers.location, "/admin/system/deployments");

    const page = await request(app)
      .get("/admin/system/deployments")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-pa-deployments="1"/);
    assert.match(page.text, /technical diagnostics|System/i);
    assert.doesNotMatch(page.text, /DATABASE_URL|SESSION_SECRET|password_hash/i);
    assert.doesNotMatch(page.text, /<form[^>]+action="\/admin\/system\/deployments/i);

    const hq = await request(app)
      .get("/admin/system/deployments")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hq.status, 403);
  });

  it("settings links to system deployments", async () => {
    requireDb();
    const page = await request(app)
      .get("/admin/settings")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.platform));
    assert.equal(page.status, 200);
    assert.match(page.text, /href="\/admin\/system\/deployments"/);
  });
});
