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
  ALLOWED_LIMITS,
  normalizeListInput,
} = require("../src/platform/services/listPlatformOrganizations");
const {
  getPlatformOrganizationSummary,
} = require("../src/platform/services/getPlatformOrganizationSummary");
const platformAdminRepo = require("../src/platform/repositories/platformAdminRepository");

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

    const snapped = normalizeListInput({ limit: "30" });
    assert.equal(snapped.value.limit, 25);
    assert.ok(ALLOWED_LIMITS.includes(snapped.value.limit));
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
    assert.match(home.text, /data-bb-pa-dashboard="1"/);
    assert.match(home.text, /data-bb-count="organizations-total"/);
    assert.match(home.text, /data-bb-count="organizations-with-church"/);
    assert.match(home.text, /href="\/admin\/account"/);
    assert.match(home.text, /data-bb-pa-logout="1"/);
    assert.match(home.text, /Platform admin/);
    assert.doesNotMatch(home.text, /\bMRR\b|projectedGrowth|\+12%|fake metric/i);
    assert.doesNotMatch(home.text, new RegExp(org.id, "i"));

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

  it("account page and CSRF logout work on apex only", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const account = await request(app)
      .get("/admin/account")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(account.status, 200);
    assert.match(account.text, /data-bb-pa-account="1"/);
    assert.match(account.text, /data-bb-pa-logout="1"/);
    assert.match(account.text, /name="_csrf"/);
    assert.match(account.text, /blessboard-org-v5/);
    assert.doesNotMatch(account.text, new RegExp(org.id, "i"));
    assert.doesNotMatch(account.text, /password|session_token/i);

    const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
    function extractCookie(res, name) {
      const raw = res.headers["set-cookie"];
      if (!raw) return null;
      const list = Array.isArray(raw) ? raw : [raw];
      for (const line of list) {
        if (String(line).startsWith(`${name}=`)) {
          return String(line).split(";")[0].slice(name.length + 1);
        }
      }
      return null;
    }
    const csrf = extractCookie(account, CSRF_COOKIE);
    assert.ok(csrf);

    const bad = await request(app)
      .post("/admin/logout")
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({});
    assert.equal(bad.status, 403);

    const ok = await request(app)
      .post("/admin/logout")
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(ok.status, 303);
    assert.equal(ok.headers.location, "/login");

    const tenantLogout = await request(app)
      .post("/admin/logout")
      .set("Host", TENANT_HOST)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(tenantLogout.status, UNAVAILABLE_STATUS);
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
    assert.match(String(anon.headers.location || ""), /^\/login(\?|$)/);
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
    assert.match(detail.text, /data-bb-pa-organization-detail="1"/);
    assert.match(detail.text, /data-bb-pa-org-branches="1"/);
    assert.match(detail.text, /data-bb-table="branches"/);
    assert.match(detail.text, /pa-demo/);
    assert.match(detail.text, /Platform Admin Demo/);
    assert.match(detail.text, /data-bb-count="active-branches">1</);
    assert.match(detail.text, /data-bb-branch-key="hq"/);
    assert.doesNotMatch(detail.text, new RegExp(church.id, "i"));
    assert.doesNotMatch(detail.text, new RegExp(org.id, "i"));
    assert.doesNotMatch(detail.text, /password|session_token|Create New|Export CSV|MRR/i);

    const missing = await request(app)
      .get("/admin/organizations/does-not-exist")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(missing.status, 404);
  });

  it("organization directory HTML stays privacy-safe with bounded pagination", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const list = await request(app)
      .get("/admin/organizations?page=1&limit=10&q=pa")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-bb-pa-organizations="1"/);
    assert.match(list.text, /data-bb-pa-org-filter="1"/);
    assert.match(list.text, /Showing \d+–\d+ of \d+/);
    assert.match(list.text, /name="limit"/);
    assert.doesNotMatch(list.text, /Create New Organization|Monthly Revenue|Pending Verifications/i);
    assert.doesNotMatch(list.text, new RegExp(org.id, "i"));
    assert.doesNotMatch(list.text, /password|session_token|DATABASE_URL/i);
  });

  it("platform admin repository returns safe catalogue fields only", async () => {
    requireDb();
    const row = await platformAdminRepo.findOrganizationDirectoryByKey(pool, "pa-demo");
    assert.ok(row);
    assert.equal(row.organization_key, "pa-demo");
    assert.equal(Object.prototype.hasOwnProperty.call(row, "id"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(row, "organization_id"), false);
    assert.doesNotMatch(JSON.stringify(row), /password|session|secret/i);

    const branches = await platformAdminRepo.listBranchesForOrganizationKey(pool, "pa-demo");
    assert.ok(Array.isArray(branches));
    assert.ok(branches.length >= 1);
    assert.equal(branches[0].branch_key, "hq");
    assert.equal(Object.prototype.hasOwnProperty.call(branches[0], "id"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(branches[0], "church_id"), false);

    const summary = await getPlatformOrganizationSummary(pool, "pa-demo");
    assert.equal(summary.ok, true, summary.message);
    assert.equal(summary.organization.organizationKey, "pa-demo");
    assert.ok(summary.branches.some((b) => b.key === "hq"));
    assert.doesNotMatch(JSON.stringify(summary), new RegExp(org.id, "i"));
    assert.doesNotMatch(JSON.stringify(summary), new RegExp(church.id, "i"));
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

  it("plans, deployments, and settings pages stay read-safe without invented billing", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);

    const plans = await request(app)
      .get("/admin/plans")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(plans.status, 200);
    assert.match(plans.text, /data-bb-pa-plans="1"/);
    assert.match(plans.text, /data-bb-plan-key="free"/);
    assert.match(plans.text, /data-bb-plan-key="growth"/);
    assert.doesNotMatch(plans.text, /\$\d+|Create Custom Tier|Paid Tenants|Churn Rate|MRR/i);
    assert.doesNotMatch(plans.text, new RegExp(org.id, "i"));

    const deployments = await request(app)
      .get("/admin/deployments")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(deployments.status, 200);
    assert.match(deployments.text, /data-bb-pa-deployments="1"/);
    assert.match(deployments.text, /data-bb-table="deployments"/);
    assert.match(deployments.text, /blessboard-org-v5/);
    assert.doesNotMatch(deployments.text, /session_cookie|Force Sync|Export Reports|Support Tickets/i);

    const settings = await request(app)
      .get("/admin/settings")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(settings.status, 200);
    assert.match(settings.text, /data-bb-pa-settings="1"/);
    assert.match(settings.text, /data-bb-pa-dns-patterns="1"/);
    assert.match(settings.text, /data-bb-pa-hostname-pattern="1"/);
    assert.doesNotMatch(settings.text, /Save Changes|Manual Failover|Export Logs|Primary Color/i);
    assert.doesNotMatch(settings.text, /session_cookie_name|password|DATABASE_URL/i);
  });

  it("organization detail shows entitlements and domains; plan/override require confirmation", async () => {
    requireDb();
    const cookie = await cookieFor(users.platform);
    const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
    function extractCookie(res, name) {
      const raw = res.headers["set-cookie"];
      if (!raw) return null;
      const list = Array.isArray(raw) ? raw : [raw];
      for (const line of list) {
        if (String(line).startsWith(`${name}=`)) {
          return String(line).split(";")[0].slice(name.length + 1);
        }
      }
      return null;
    }

    const detail = await request(app)
      .get("/admin/organizations/pa-demo")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-pa-org-entitlements="1"/);
    assert.match(detail.text, /data-bb-pa-org-domains="1"/);
    assert.match(detail.text, /data-bb-table="domains"/);
    assert.match(detail.text, /pa-org\.blessboard\.org/);
    assert.match(detail.text, /data-bb-pa-plan-form="1"/);
    assert.match(detail.text, /name="confirm_plan_change"/);
    assert.match(detail.text, /name="confirm_override"/);
    assert.doesNotMatch(detail.text, new RegExp(org.id, "i"));
    assert.doesNotMatch(detail.text, /\$249|Create Custom Tier|payment gateway/i);
    assert.doesNotMatch(detail.text, /Verify DNS|Automate DNS|payment processor/i);

    const csrf = extractCookie(detail, CSRF_COOKIE);
    assert.ok(csrf);

    const noConfirm = await request(app)
      .post("/admin/organizations/pa-demo/plan")
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        plan_key: "growth",
      });
    assert.equal(noConfirm.status, 303);
    assert.match(String(noConfirm.headers.location || ""), /error=confirm_required/);

    const assigned = await request(app)
      .post("/admin/organizations/pa-demo/plan")
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        plan_key: "growth",
        confirm_plan_change: "1",
        notes: "platform-admin shell test",
      });
    assert.equal(assigned.status, 303);
    assert.match(String(assigned.headers.location || ""), /notice=plan_saved/);

    const after = await request(app)
      .get("/admin/organizations/pa-demo")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(after.status, 200);
    assert.match(after.text, /growth/i);

    const overrideNoConfirm = await request(app)
      .post("/admin/organizations/pa-demo/entitlement-override")
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        feature_key: "max_branches",
        feature_kind: "limit",
        limit_value: "5",
        reason: "temporary capacity for test",
      });
    assert.equal(overrideNoConfirm.status, 303);
    assert.match(String(overrideNoConfirm.headers.location || ""), /error=confirm_required/);

    const overrideOk = await request(app)
      .post("/admin/organizations/pa-demo/entitlement-override")
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        feature_key: "max_branches",
        feature_kind: "limit",
        limit_value: "5",
        reason: "temporary capacity for test",
        confirm_override: "1",
      });
    assert.equal(overrideOk.status, 303);
    assert.match(String(overrideOk.headers.location || ""), /notice=override_saved/);
  });
});
