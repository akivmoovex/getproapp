"use strict";

/**
 * Apex-only V5 platform-admin shell tests (ephemeral Postgres).
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
const { createV5FoundationApp, UNAVAILABLE_STATUS } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  listPlatformOrganizations,
  MAX_LIMIT,
  normalizeListInput,
} = require("../src/platform/services/listPlatformOrganizations");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const TENANT_HOST = "pa-org.blessboard.org";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v5",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    ...overrides,
  };
}

describe("listPlatformOrganizations pagination", () => {
  it("bounds limit to maximum 100 and defaults page/limit", () => {
    const high = normalizeListInput({ page: "0", limit: "999" });
    assert.equal(high.ok, true);
    assert.equal(high.value.page, 1);
    assert.equal(high.value.limit, MAX_LIMIT);

    const defaults = normalizeListInput({});
    assert.equal(defaults.value.page, 1);
    assert.equal(defaults.value.limit, 25);
  });
});

describe("blessboard platform-admin shell", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let org;
  let church;
  let writes = [];
  let users = {};

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      const originalQuery = pool.query.bind(pool);
      pool.query = (text, params) => {
        const sql = String(text || "");
        if (/\bpublic\.tenants\b/i.test(sql)) writes.push("public.tenants");
        if (/^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql.trim())) {
          writes.push(sql.trim().slice(0, 80));
        }
        return originalQuery(text, params);
      };

      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      const provisioned = await provisionPlatformTenant(pool, {
        organizationKey: "pa-demo",
        displayName: "Platform Admin Demo",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pa-demo",
        hostname: TENANT_HOST,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(provisioned.ok, true, provisioned.message);
      org = provisioned.records.organization;

      const churchResult = await provisionBlessBoardChurch(pool, {
        organizationKey: "pa-demo",
        churchKey: "pa-demo",
        displayName: "Platform Admin Demo Church",
        legalName: null,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "HQ",
      });
      assert.equal(churchResult.ok, true, churchResult.message);
      church = churchResult.records.church;

      // Extra orgs for pagination/list rendering
      for (let i = 1; i <= 3; i += 1) {
        const key = `pa-extra-${i}`;
        const extra = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `Extra Org ${i}`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: `${key}.blessboard.org`,
          domainType: "canonical",
          deploymentCode: "blessboard-org-v5",
          isPrimary: true,
        });
        assert.equal(extra.ok, true, extra.message);
      }

      async function makeUser(email, displayName) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        return created.user;
      }

      users.platform = await makeUser("pa-admin@example.org", "Platform Admin User");
      users.hq = await makeUser("pa-hq@example.org", "HQ User");
      users.branch = await makeUser("pa-branch@example.org", "Branch User");

      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "pa-admin@example.org",
            organizationKey: "pa-demo",
            roleKey: "platform_admin",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "pa-hq@example.org",
            organizationKey: "pa-demo",
            roleKey: "church_hq_admin",
            churchKey: "pa-demo",
          })
        ).ok,
        true
      );
      assert.equal(
        (
          await assignBlessBoardRole(pool, {
            email: "pa-branch@example.org",
            organizationKey: "pa-demo",
            roleKey: "branch_admin",
            churchKey: "pa-demo",
            branchKey: "hq",
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
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  async function cookieFor(user) {
    const created = await createV5Session(pool, {
      deploymentCode: "blessboard-org-v5",
      userId: user.id,
      organizationId: org.id,
      churchId: church.id,
      branchId: null,
    });
    assert.equal(created.ok, true, created.code);
    return `${DEFAULT_V5_COOKIE}=${created.rawToken}`;
  }

  it("platform_admin can access apex admin directory", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const home = await request(app).get("/admin").set("Host", "blessboard.org").set("Cookie", cookie);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-bb-shell="platform-admin"/);
    assert.match(home.text, /Platform admin/);

    const list = await request(app)
      .get("/admin/organizations")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /pa-demo/);
    assert.match(list.text, /Platform Admin Demo/);
    assert.match(list.text, /data-bb-table="organizations"/);
    assert.match(list.text, /blessboard-org-v5/);
    assert.doesNotMatch(list.text, new RegExp(org.id, "i"));
    assert.doesNotMatch(list.text, /password|session_token|DATABASE_URL/i);
  });

  it("other roles are rejected; unauthenticated redirects to login", async () => {
    requireDb();
    const hq = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hq.status, 403);

    const branch = await request(app)
      .get("/admin/organizations")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.branch));
    assert.equal(branch.status, 403);

    const anon = await request(app)
      .get("/admin")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html")
      .redirects(0);
    assert.equal(anon.status, 303);
    assert.equal(anon.headers.location, "/login");
  });

  it("tenant hosts cannot serve platform-admin pages", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const res = await request(app)
      .get("/admin")
      .set("Host", TENANT_HOST)
      .set("Cookie", cookie);
    assert.equal(res.status, UNAVAILABLE_STATUS);
  });

  it("organization detail resolves by key; unknown returns 404", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const detail = await request(app)
      .get("/admin/organizations/pa-demo")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-detail="organization"/);
    assert.match(detail.text, /pa-demo/);
    assert.match(detail.text, /Platform Admin Demo/);
    assert.match(detail.text, /data-bb-count="active-branches">1</);
    assert.doesNotMatch(detail.text, new RegExp(church.id, "i"));

    const missing = await request(app)
      .get("/admin/organizations/does-not-exist")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(missing.status, 404);
  });

  it("pagination is bounded and list query is read-only", async () => {
    requireDb();
    const bounded = await listPlatformOrganizations(pool, { page: 1, limit: 999 });
    assert.equal(bounded.ok, true);
    assert.equal(bounded.limit, MAX_LIMIT);

    writes = [];
    const cookie = await cookieFor(users.platform);
    writes = [];
    await request(app)
      .get("/admin/organizations?page=1&limit=2")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    const bad = writes.filter(
      (w) =>
        w === "public.tenants" ||
        (/^\s*(INSERT|DELETE)\b/i.test(w) && !/deployment_sessions/i.test(w))
    );
    assert.deepEqual(
      bad.filter((w) => !/deployment_sessions/i.test(w)),
      []
    );
  });
});
