"use strict";

/**
 * Prompt 13A: Platform Admin settings content (tenant architecture).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

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
  getPlatformAdminSettingsView,
} = require("../src/platform/services/getPlatformAdminSettingsView");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST = "settings-a.blessboard.org";
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

describe("blessboard platform settings content", () => {
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
        organizationKey: "settings-org-a",
        displayName: "Settings Org A",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "settings-org-a",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const churchProv = await provisionBlessBoardChurch(pool, {
        organizationKey: "settings-org-a",
        churchKey: "settings-org-a",
        displayName: "Settings Church A",
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

      users.platform = await makeUser("settings-pa@example.org", "Settings PA");
      users.hq = await makeUser("settings-hq@example.org", "Settings HQ");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "settings-pa@example.org",
            organizationKey: "settings-org-a",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "settings-hq@example.org",
            organizationKey: "settings-org-a",
            roleKey: "church_hq_admin",
            churchKey: "settings-org-a",
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

  it("builds a safe settings model with tenant architecture", async () => {
    requireDb();
    const view = await getPlatformAdminSettingsView(pool, baseEnv());
    assert.equal(view.ok, true);
    assert.ok(view.settings);
    assert.match(view.settings.architecture.model.join(" "), /Organisation tenant/i);
    assert.ok(
      view.settings.architecture.rules.some((r) =>
        /does not create a new deployment/i.test(r)
      )
    );
    assert.equal(view.settings.links.organizationsNew, "/admin/organizations/new");
    assert.doesNotMatch(JSON.stringify(view.settings), /DATABASE_URL|SESSION_SECRET|password_hash/i);
    assert.notEqual(String(view.settings.systemHealth.environment), "production");
  });

  it("loads for Platform Admin and denies church users", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const page = await request(app)
      .get("/admin/settings")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-pa-settings="1"/);
    assert.match(page.text, /data-bb-pa-settings-architecture="1"/);
    assert.match(page.text, /Organisation tenant/i);
    assert.match(page.text, /HQ and branches/i);
    assert.match(page.text, /not separate deployments/i);
    assert.match(page.text, /does not create a new deployment/i);
    assert.match(page.text, /data-bb-pa-settings-general="1"/);
    assert.match(page.text, /data-bb-pa-settings-org-defaults="1"/);
    assert.match(page.text, /data-bb-pa-settings-identity="1"/);
    assert.match(page.text, /data-bb-pa-settings-comms="1"/);
    assert.match(page.text, /data-bb-pa-settings-security="1"/);
    assert.match(page.text, /data-bb-pa-settings-health="1"/);
    assert.match(page.text, /href="\/admin\/organizations\/new"/);
    assert.match(page.text, /href="\/admin\/system\/deployments"/);
    assert.match(page.text, /href="\/admin\/plans"/);
    assert.match(page.text, /data-bb-pa-dns-patterns="1"/);
    assert.match(page.text, /data-bb-pa-settings-reserved="1"/);
    assert.doesNotMatch(page.text, /branch-as-deployment|branches are deployments/i);
    assert.doesNotMatch(page.text, /\bnew deployment per (organisation|organization)\b/i);
    assert.doesNotMatch(page.text, /DATABASE_URL|SESSION_SECRET|password_hash|Reset All Platform Settings/i);
    assert.doesNotMatch(page.text, /Save Changes|Force MFA|\+ Add Keyword/i);
    assert.doesNotMatch(page.text, /environment_code">\s*production/i);

    const hq = await request(app)
      .get("/admin/settings")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hq.status, 403);
  });

  it("keeps settings route registered in route-link audit corpus", () => {
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    assert.match(routes, /router\.get\("\/admin\/settings"/);
    assert.match(routes, /getPlatformAdminSettingsView/);
    const view = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/platform-admin/settings.ejs"),
      "utf8"
    );
    assert.match(view, /\/admin\/organizations\/new/);
    assert.doesNotMatch(view, /method="post"/i);
  });
});
