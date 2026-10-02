"use strict";

/**
 * Prompt 13D: Domains and public links directory.
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
  listPlatformPublicLinks,
} = require("../src/platform/services/platformAdminPublicLinksService");
const {
  publicChurchHomePath,
  publicBranchHomePath,
} = require("../src/blessboard/urls/churchUrlHelper");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST = "links-sys.blessboard.org";
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

describe("blessboard platform domains and links", () => {
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
        organizationKey: "links-sys-org",
        displayName: "Links Sys Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "links-sys-org",
        hostname: HOST,
        domainType: "canonical",
        deploymentCode: DEPLOYMENT,
        isPrimary: true,
      });
      assert.equal(prov.ok, true, prov.message);
      org = prov.records.organization;

      const churchProv = await provisionBlessBoardChurch(pool, {
        organizationKey: "links-sys-org",
        churchKey: "links-sys-org",
        displayName: "Links Sys Church",
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

      users.platform = await makeUser("links-pa@example.org", "Links PA");
      users.hq = await makeUser("links-hq@example.org", "Links HQ");
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "links-pa@example.org",
            organizationKey: "links-sys-org",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "links-hq@example.org",
            organizationKey: "links-sys-org",
            roleKey: "church_hq_admin",
            churchKey: "links-sys-org",
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

  it("resolves canonical church and branch public paths", () => {
    assert.equal(publicChurchHomePath("links-sys-org"), "/c/links-sys-org");
    assert.equal(publicBranchHomePath("links-sys-org", "hq"), "/c/links-sys-org/hq");
  });

  it("lists public links without secrets or token leakage", async () => {
    requireDb();
    const listed = await listPlatformPublicLinks(pool, {
      actorUserId: users.platform.id,
      filters: {},
      env: baseEnv(),
    });
    assert.equal(listed.ok, true, listed.reason);
    assert.ok(Array.isArray(listed.links));
    assert.ok(listed.links.length >= 1);
    const blob = JSON.stringify(listed);
    assert.doesNotMatch(blob, /SESSION_SECRET|password_hash|rawToken|support_token/i);
    const churchWide = listed.links.find(
      (l) => /church-wide|Church-wide/i.test(String(l.type || ""))
    );
    assert.ok(churchWide || listed.links[0].canonicalPublicUrl);
  });

  it("renders domains and links for Platform Admin and denies church users", async () => {
    requireDb();
    const page = await request(app)
      .get("/admin/domains")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.platform));
    assert.equal(page.status, 200);
    assert.match(page.text, /Domains and links|data-bb-pa-domains/i);
    assert.doesNotMatch(page.text, /SESSION_SECRET|password_hash|rawToken/i);

    const hq = await request(app)
      .get("/admin/domains")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hq.status, 403);
  });
});
