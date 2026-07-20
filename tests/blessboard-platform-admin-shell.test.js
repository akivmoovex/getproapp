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
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
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
    assert.match(home.text, /data-bb-stitch-shell="62-platform-admin-dashboard"/);
    assert.match(home.text, /data-bb-pa-dashboard="1"/);
    assert.match(home.text, /data-bb-stitch-dashboard="62-platform-admin-dashboard"/);
    assert.match(home.text, /data-bb-nav="desktop-sidebar"/);
    assert.match(home.text, /data-bb-nav="desktop"/);
    assert.match(home.text, /data-bb-nav="mobile-drawer"/);
    assert.match(home.text, /data-bb-nav="mobile-tabs"/);
    assert.match(home.text, /data-bb-nav="mobile-header"/);
    assert.match(home.text, /data-bb-page-area/);
    assert.match(home.text, /data-bb-pa-role/);
    assert.match(home.text, /role="dialog"/);
    assert.match(home.text, /aria-modal="true"/);
    assert.match(home.text, /\binert\b/);
    assert.match(home.text, /bb-pa-drawer__close/);
    assert.match(home.text, /data-bb-footer="drawer"/);
    assert.match(home.text, /powered-by-getpro|Powered by/i);
    assert.match(home.text, /aria-label="Open menu"/);
    assert.match(home.text, /aria-label="Account"/);
    assert.match(home.text, /tabindex="-1"/);
    assert.match(home.text, /System Overview/);
    assert.match(home.text, /data-bb-dash-welcome="1"/);
    assert.match(home.text, /data-bb-dash-notices="1"/);
    assert.match(home.text, /data-bb-dash-stats="1"/);
    assert.match(home.text, /data-bb-dash-directory="1"/);
    assert.match(home.text, /data-bb-dash-activity="1"/);
    assert.match(home.text, /data-bb-dash-health="1"/);
    assert.match(home.text, /data-bb-dash-quick="desktop"/);
    assert.match(home.text, /data-bb-dash-quick="mobile"/);
    assert.match(home.text, /data-bb-dash-empty="notices"/);
    assert.match(home.text, /data-bb-dash-empty="activity"/);
    assert.match(home.text, /data-bb-dash-empty="health"/);
    assert.match(home.text, /data-bb-dash-empty="create-org"/);
    assert.match(
      home.text,
      /data-bb-dash-stat="organizations"[^>]*data-bb-dash-stat-available="1"|data-bb-dash-stat-available="1"[^>]*data-bb-dash-stat="organizations"/
    );
    assert.match(
      home.text,
      /data-bb-dash-stat="churches"[^>]*data-bb-dash-stat-available="1"|data-bb-dash-stat-available="1"[^>]*data-bb-dash-stat="churches"/
    );
    assert.match(home.text, /data-bb-dash-stat="foundation-recent"/);
    assert.match(home.text, /data-bb-dash-stat="growth-trials"/);
    assert.match(home.text, /data-bb-dash-stat="growth-grace"/);
    assert.match(home.text, /data-bb-dash-stat="network-support"/);
    assert.match(home.text, /data-bb-count="organizations-total"/);
    assert.match(home.text, /data-bb-count="organizations-with-church"/);
    assert.match(home.text, /data-bb-count="recent-foundation-registrations"/);
    assert.match(home.text, /data-bb-count="active-growth-trials"/);
    assert.match(home.text, /href="\/admin\/account"/);
    assert.match(home.text, /href="\/admin\/organizations"/);
    assert.match(home.text, /href="\/admin\/plans"/);
    assert.match(home.text, /href="\/admin\/subscriptions"/);
    assert.match(home.text, /href="\/admin\/registration-applications"/);
    assert.match(home.text, /href="\/admin\/domains"/);
    assert.match(home.text, /href="\/admin\/deployments"/);
    assert.match(home.text, /href="\/admin\/settings"/);
    assert.match(home.text, /data-bb-quick-action="organizations"/);
    assert.match(home.text, /data-bb-quick-action="registrations"/);
    assert.match(home.text, /data-bb-quick-action="subscriptions"/);
    assert.match(home.text, /data-bb-quick-action="plans"/);
    assert.match(home.text, /data-bb-pa-logout="1"/);
    assert.match(home.text, /Platform admin/);
    assert.match(home.text, /blessboard-org-v5/);
    assert.doesNotMatch(
      home.text,
      /\bMRR\b|projectedGrowth|\+12%|\+5\.2%|12\.8k|99\.8%|fake metric|New Organization|Export Report/i
    );
    assert.doesNotMatch(home.text, /href="\/admin\/organizations\/new"/);
    assert.doesNotMatch(home.text, />\s*Tenants\s*</);
    assert.doesNotMatch(home.text, />\s*Health\s*</);
    assert.doesNotMatch(home.text, new RegExp(org.id, "i"));
    assert.match(home.text, /Organization creation is not available/);
    assert.match(home.text, /subscription revenue|invented ticket|health scores/i);

    const list = await request(app)
      .get("/admin/organizations")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /pa-demo/);
    assert.match(list.text, /Platform Admin Demo/);
    assert.match(list.text, /data-bb-table="organizations"/);
    assert.match(list.text, /blessboard-org-v5/);
    assert.match(list.text, /data-bb-stitch-shell="62-platform-admin-dashboard"/);
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
    assert.match(account.text, /aria-label="Account"/);
    assert.match(account.text, /aria-label="Breadcrumb"/);
    assert.match(account.text, /data-bb-pa-account-identity="1"/);
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
    assert.match(detail.text, /data-bb-stitch-organization-detail="65-platform-branch-tenants"/);
    assert.match(detail.text, /data-bb-pa-org-summary="1"/);
    assert.match(detail.text, /data-bb-pa-org-catalogue="1"/);
    assert.match(detail.text, /data-bb-pa-org-domains="1"/);
    assert.match(detail.text, /data-bb-pa-org-branches="1"/);
    assert.match(detail.text, /data-bb-pa-subscription-config="1"/);
    assert.match(detail.text, /Subscription configuration/);
    assert.match(detail.text, /data-bb-pa-org-entitlements="1"/);
    assert.match(detail.text, /data-bb-stitch-entitlements="66-platform-plans-limits"/);
    assert.match(detail.text, /data-bb-pa-usage="1"/);
    assert.match(detail.text, /data-bb-usage="branches">Active branches/);
    assert.match(detail.text, /data-bb-usage="staff">Admin \/ leadership accounts/);
    assert.match(detail.text, /data-bb-usage="users">Members/);
    assert.match(detail.text, /data-bb-usage="custom_domain">Custom organization domain/);
    assert.match(detail.text, /data-bb-usage="custom_email">Hosted mailboxes/);
    assert.doesNotMatch(detail.text, /data-bb-usage="staff">Staff accounts/);
    assert.doesNotMatch(detail.text, /data-bb-usage="users">Users ·/);
    assert.match(detail.text, /data-bb-pa-entitlement-groups="1"/);
    assert.match(detail.text, /data-bb-entitlement-group="limits"/);
    assert.match(detail.text, /data-bb-entitlement-group="capabilities"/);
    assert.match(detail.text, /data-bb-pa-entitlement-sources="1"/);
    assert.match(detail.text, /data-bb-pa-org-overrides="1"/);
    assert.match(detail.text, /data-bb-pa-plan-form="1"/);
    assert.match(detail.text, /data-bb-pa-override-form="1"/);
    assert.match(detail.text, /data-bb-table="branches"/);
    assert.match(detail.text, /data-bb-branch-cards="1"/);
    assert.match(detail.text, /Read-only/);
    assert.match(detail.text, /Editable/);
    assert.match(detail.text, /pa-demo/);
    assert.match(detail.text, /Platform Admin Demo/);
    assert.match(detail.text, /data-bb-sub-plan-key="free"/);
    assert.match(detail.text, /data-bb-sub-plan-display="Foundation[^"]*"/);
    assert.match(detail.text, /data-bb-sub-status="active"/);
    assert.match(detail.text, /data-bb-count="active-branches">1</);
    assert.match(detail.text, /data-bb-branch-key="hq"/);
    assert.match(detail.text, /name="confirm_plan_change"/);
    assert.match(detail.text, /name="confirm_override"/);
    assert.match(detail.text, /name="_csrf"/);
    assert.match(detail.text, /action="\/admin\/organizations\/pa-demo\/plan"/);
    assert.match(detail.text, /action="\/admin\/organizations\/pa-demo\/entitlement-override"/);
    assert.doesNotMatch(detail.text, new RegExp(church.id, "i"));
    assert.doesNotMatch(detail.text, new RegExp(org.id, "i"));
    assert.doesNotMatch(
      detail.text,
      /password|session_token|DATABASE_URL|secret|connection string|Export CSV|New Branch|\$249|impersonat/i
    );

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
    assert.match(list.text, /data-bb-stitch-organizations="63-platform-church-organizations"/);
    assert.match(list.text, /Organization Governance/);
    assert.match(list.text, /data-bb-pa-org-filter="1"/);
    assert.match(list.text, /data-bb-org-table="1"/);
    assert.match(list.text, /data-bb-org-cards="1"/);
    assert.match(list.text, /data-bb-count="directory-total"/);
    assert.match(list.text, /Showing \d+–\d+ of \d+/);
    assert.match(list.text, /name="limit"/);
    assert.match(list.text, /pa-demo/);
    assert.match(list.text, /Platform Admin Demo/);
    assert.match(list.text, /blessboard-org-v5/);
    assert.doesNotMatch(list.text, /Create New Organization|Monthly Revenue|Pending Verifications|\$142k|Export CSV/i);
    assert.doesNotMatch(list.text, new RegExp(org.id, "i"));
    assert.doesNotMatch(list.text, /password|session_token|DATABASE_URL/i);
    assert.match(list.text, /No second onboarding or support queue/i);
    assert.match(list.text, /data-bb-pa-filter="product"/);

    const noResults = await request(app)
      .get("/admin/organizations?q=zzznomatch")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(noResults.status, 200);
    assert.match(noResults.text, /data-bb-pa-empty="no-results"/);
    assert.match(noResults.text, /No matching organizations/);
    assert.doesNotMatch(noResults.text, /data-bb-org-table="1"/);
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
    assert.match(plans.text, /data-bb-pa-plans-directory="1"/);
    assert.match(plans.text, /data-bb-stitch-plans="66-platform-plans-limits"/);
    assert.match(plans.text, /Platform Plans/);
    assert.match(plans.text, /data-bb-pa-plan-grid="1"/);
    assert.match(plans.text, /data-bb-plan-table="1"/);
    assert.match(plans.text, /data-bb-plan-cards="1"/);
    assert.match(plans.text, /data-bb-pa-plans-active="1"/);
    assert.match(plans.text, /data-bb-pa-plans-inactive="1"/);
    assert.match(plans.text, /data-bb-plan-key="free"/);
    assert.match(plans.text, /data-bb-plan-key="growth"/);
    assert.match(plans.text, /data-bb-plan-key="professional"/);
    assert.match(plans.text, /data-bb-plan-key="partner"/);
    assert.match(plans.text, /data-bb-plan-display="Foundation"/);
    assert.match(plans.text, /data-bb-plan-display="Growth"/);
    assert.match(plans.text, /data-bb-plan-display="Network"/);
    assert.match(plans.text, /data-bb-plan-status="active"/);
    assert.match(plans.text, /data-bb-plan-status="inactive"/);
    assert.match(plans.text, /data-bb-plan-legacy-badge="1"/);
    assert.match(plans.text, /data-bb-count="plans-active"/);
    assert.match(plans.text, /data-bb-count="plans-inactive"/);
    assert.match(plans.text, /href="\/admin\/organizations"/);
    assert.doesNotMatch(plans.text, /\$\d+|Create Custom Tier|Configure Parameters|Paid Tenants|Churn Rate|MRR/i);
    assert.doesNotMatch(plans.text, /Conversion|Uptime SLA|API Throughput|Tenant Slots/i);
    assert.doesNotMatch(plans.text, /plan_key migration|Phase B|rename plan_key/i);
    assert.doesNotMatch(plans.text, /Create plan|New plan|Add plan/i);
    assert.doesNotMatch(plans.text, new RegExp(org.id, "i"));

    const subs = await request(app)
      .get("/admin/subscriptions")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(subs.status, 200);
    assert.match(subs.text, /data-bb-pa-subscriptions="1"/);
    assert.match(subs.text, /data-bb-stitch-subscriptions="66-platform-plans-limits"/);
    assert.match(subs.text, /Subscription configuration/);
    assert.match(subs.text, /Payment collection is not implemented/i);
    assert.match(subs.text, /data-bb-subs-table="1"/);
    assert.match(subs.text, /data-bb-subs-cards="1"/);
    assert.match(subs.text, /data-bb-pa-subs-filter="1"/);
    assert.match(subs.text, /data-bb-sub-org="pa-demo"/);
    assert.match(subs.text, /data-bb-sub-plan-key="free"/);
    assert.match(subs.text, /data-bb-sub-plan-display="Foundation[^"]*"/);
    assert.match(subs.text, /data-bb-sub-status="active"/);
    assert.match(subs.text, /data-bb-pa-subs-plan-filter="1"/);
    assert.match(subs.text, /data-bb-pa-subs-ending-soon="1"/);
    assert.match(subs.text, /href="\/admin\/organizations\/pa-demo#pa-org-subscription"/);
    assert.doesNotMatch(subs.text, /\$\d+|invoice|checkout|refund|MRR|balance due|stripe/i);
    assert.doesNotMatch(subs.text, new RegExp(org.id, "i"));

    const hqSubs = await request(app)
      .get("/admin/subscriptions")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hqSubs.status, 403);

    const scoped = await request(app)
      .get("/admin/subscriptions?q=pa-demo")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(scoped.status, 200);
    assert.match(scoped.text, /data-bb-sub-org="pa-demo"/);
    assert.doesNotMatch(scoped.text, /data-bb-sub-org="pa-extra-/);

    const hqPlans = await request(app)
      .get("/admin/plans")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hqPlans.status, 403);

    const anonPlans = await request(app)
      .get("/admin/plans")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html")
      .redirects(0);
    assert.equal(anonPlans.status, 303);

    const deployments = await request(app)
      .get("/admin/deployments")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(deployments.status, 200);
    assert.match(deployments.text, /data-bb-pa-deployments="1"/);
    assert.match(deployments.text, /data-bb-pa-deployments-directory="1"/);
    assert.match(deployments.text, /data-bb-stitch-deployments="68-platform-support-monitoring"/);
    assert.match(deployments.text, /data-bb-table="deployments"/);
    assert.match(deployments.text, /data-bb-deploy-table="1"/);
    assert.match(deployments.text, /data-bb-deploy-cards="1"/);
    assert.match(deployments.text, /data-bb-pa-deploy-summary="1"/);
    assert.match(deployments.text, /data-bb-pa-deploy-unavailable="1"/);
    assert.match(deployments.text, /data-bb-deploy-unavailable="ops"/);
    assert.match(deployments.text, /data-bb-deploy-unavailable="logs"/);
    assert.match(deployments.text, /data-bb-pa-unavailable="deploy"/);
    assert.match(deployments.text, /data-bb-pa-unavailable="restart"/);
    assert.match(deployments.text, /data-bb-pa-unavailable="rollback"/);
    assert.match(deployments.text, /data-bb-pa-unavailable="env-edit"/);
    assert.match(deployments.text, /data-bb-pa-unavailable="log-stream"/);
    assert.match(deployments.text, /data-bb-count="deployments-total"/);
    assert.match(deployments.text, /data-bb-pa-current-deployment="1"/);
    assert.match(deployments.text, /data-bb-deployment="blessboard-org-v5"/);
    assert.match(deployments.text, /data-bb-deployment-status=/);
    assert.match(deployments.text, /data-bb-deployment-environment=/);
    assert.match(deployments.text, /data-bb-deployment-host=/);
    assert.match(deployments.text, /data-bb-env-badge=/);
    assert.match(deployments.text, /data-bb-status-badge=/);
    assert.match(deployments.text, /BlessBoard/);
    assert.match(deployments.text, /href="\/admin\/settings"/);
    assert.match(deployments.text, /href="\/admin\/deployments\/blessboard-org-v5"/);
    assert.doesNotMatch(deployments.text, /session_cookie|SESSION_SECRET|DATABASE_URL|password|credential/i);
    assert.doesNotMatch(deployments.text, /Force Sync|Export Reports|Support Tickets|99\.98%|Critical Error Rate/i);
    assert.doesNotMatch(deployments.text, /Retire deployment|Delete deployment|Manual Failover|Rollback now|Restart process/i);

    const deployDetail = await request(app)
      .get("/admin/deployments/blessboard-org-v5")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(deployDetail.status, 200);
    assert.match(deployDetail.text, /data-bb-pa-deployment-detail="1"/);
    assert.match(deployDetail.text, /data-bb-stitch-deployment-detail="68-platform-support-monitoring"/);
    assert.match(deployDetail.text, /data-bb-deployment="blessboard-org-v5"/);
    assert.match(deployDetail.text, /data-bb-current="1"/);
    assert.match(deployDetail.text, /data-bb-pa-deploy-summary-panel="1"/);
    assert.match(deployDetail.text, /data-bb-pa-deploy-environment="1"/);
    assert.match(deployDetail.text, /data-bb-pa-deploy-products="1"/);
    assert.match(deployDetail.text, /data-bb-pa-deploy-domains="1"/);
    assert.match(deployDetail.text, /data-bb-pa-deploy-diagnostics="1"/);
    assert.match(deployDetail.text, /data-bb-pa-diag="canonical_host"/);
    assert.match(deployDetail.text, /data-bb-pa-diag="deployment_status"/);
    assert.match(deployDetail.text, /data-bb-pa-diag="product_link"/);
    assert.match(deployDetail.text, /data-bb-pa-diag="domains_registered"/);
    assert.match(deployDetail.text, /data-bb-pa-diag="runtime_identity"/);
    assert.match(deployDetail.text, /data-bb-pa-diag-state="pass"/);
    assert.match(deployDetail.text, /data-bb-pa-diag="log_access"/);
    assert.match(deployDetail.text, /data-bb-pa-diag="env_editing"/);
    assert.match(deployDetail.text, /data-bb-pa-diag-state="unavailable"/);
    assert.match(deployDetail.text, /data-bb-env-badge=/);
    assert.match(deployDetail.text, /data-bb-status-badge=/);
    assert.match(deployDetail.text, /data-bb-deploy-product="blessboard"/);
    assert.match(deployDetail.text, /href="\/admin\/deployments"/);
    assert.doesNotMatch(deployDetail.text, /session_cookie|SESSION_SECRET|DATABASE_URL|password|credential/i);
    assert.doesNotMatch(deployDetail.text, /token_hash|bcrypt|Force Sync|Export Reports|99\.98%/i);
    assert.doesNotMatch(deployDetail.text, /action="\/admin\/deployments[^"]*"[^>]*method="post"|Restart process|Rollback now|Edit environment/i);
    assert.doesNotMatch(deployDetail.text, /<form[^>]*action="\/admin\/deployments/i);

    const deployMissing = await request(app)
      .get("/admin/deployments/not-a-real-deployment")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(deployMissing.status, 404);

    const deployInvalid = await request(app)
      .get("/admin/deployments/Bad_Code!")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie)
      .set("Accept", "text/html");
    assert.equal(deployInvalid.status, 400);

    const hqDeploy = await request(app)
      .get("/admin/deployments")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hqDeploy.status, 403);

    const hqDeployDetail = await request(app)
      .get("/admin/deployments/blessboard-org-v5")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hqDeployDetail.status, 403);

    const settings = await request(app)
      .get("/admin/settings")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(settings.status, 200);
    assert.match(settings.text, /data-bb-pa-settings="1"/);
    assert.match(settings.text, /data-bb-stitch-settings="67-platform-settings"/);
    assert.match(settings.text, /data-bb-pa-dns-patterns="1"/);
    assert.match(settings.text, /data-bb-pa-hostname-pattern="1"/);
    assert.match(settings.text, /data-bb-pa-settings-reserved="1"/);
    assert.match(settings.text, /data-bb-pa-settings-unavailable="1"/);
    assert.match(settings.text, /data-bb-pa-unavailable="dns-automation"/);
    assert.match(settings.text, /data-bb-pa-reserved="organization"/);
    assert.match(settings.text, /data-bb-pa-reserved="host"/);
    assert.match(settings.text, /href="\/admin\/deployments"/);
    assert.doesNotMatch(settings.text, /Save Changes|Manual Failover|Export Logs|Primary Color|Force MFA|\+ Add Keyword/i);
    assert.doesNotMatch(settings.text, /session_cookie_name|password|DATABASE_URL|Reset All Platform Settings/i);

    const hqSettings = await request(app)
      .get("/admin/settings")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hqSettings.status, 403);

    const domains = await request(app)
      .get("/admin/domains")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(domains.status, 200);
    assert.match(domains.text, /data-bb-pa-domains="1"/);
    assert.match(domains.text, /data-bb-pa-domains-directory="1"/);
    assert.match(domains.text, /data-bb-stitch-domains="67-platform-settings"/);
    assert.match(domains.text, /data-bb-domains-table="1"/);
    assert.match(domains.text, /data-bb-domains-cards="1"/);
    assert.match(domains.text, /data-bb-pa-domains-filter="1"/);
    assert.match(domains.text, /data-bb-count="domains-total"/);
    assert.match(domains.text, /data-bb-domain-hostname="pa-org\.blessboard\.org"/);
    assert.match(domains.text, /data-bb-domain-type="canonical"/);
    assert.match(domains.text, /data-bb-domain-status="active"/);
    assert.match(domains.text, /data-bb-domain-org="pa-demo"/);
    assert.match(domains.text, /href="\/admin\/organizations\/pa-demo#pa-org-domains"/);
    assert.match(domains.text, /BlessBoard/);
    assert.doesNotMatch(domains.text, /DNS lookup|certificate provisioning|domain purchase|automatic verification|Force Verify|Buy Domain/i);
    assert.doesNotMatch(domains.text, /session_cookie|DATABASE_URL|ResolveHostname|expectedDeploymentCode/i);
    assert.doesNotMatch(domains.text, new RegExp(org.id, "i"));

    await pool.query(
      `UPDATE platform.domains SET status = 'inactive' WHERE hostname = $1`,
      ["pa-extra-1.blessboard.org"]
    );
    const inactive = await request(app)
      .get("/admin/domains?status=inactive")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(inactive.status, 200);
    assert.match(inactive.text, /data-bb-domain-hostname="pa-extra-1\.blessboard\.org"/);
    assert.match(inactive.text, /data-bb-domain-status="inactive"/);
    assert.doesNotMatch(inactive.text, /data-bb-domain-hostname="pa-org\.blessboard\.org"/);

    const scopedOrg = await request(app)
      .get("/admin/domains?org=pa-demo")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(scopedOrg.status, 200);
    assert.match(scopedOrg.text, /data-bb-domain-org="pa-demo"/);
    assert.doesNotMatch(scopedOrg.text, /data-bb-domain-org="pa-extra-/);

    const scopedHost = await request(app)
      .get("/admin/domains?q=pa-org")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(scopedHost.status, 200);
    assert.match(scopedHost.text, /data-bb-domain-hostname="pa-org\.blessboard\.org"/);
    assert.doesNotMatch(scopedHost.text, /data-bb-domain-hostname="pa-extra-/);

    const typeCanonical = await request(app)
      .get("/admin/domains?type=canonical")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(typeCanonical.status, 200);
    assert.match(typeCanonical.text, /data-bb-domain-type="canonical"/);

    const noResults = await request(app)
      .get("/admin/domains?org=zzznomatch")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(noResults.status, 200);
    assert.match(noResults.text, /data-bb-pa-empty="no-results"/);

    const hqDomains = await request(app)
      .get("/admin/domains")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hqDomains.status, 403);

    const anonDomains = await request(app)
      .get("/admin/domains")
      .set("Host", "blessboard.org")
      .set("Accept", "text/html")
      .redirects(0);
    assert.equal(anonDomains.status, 303);
  });

  it("domain detail renders, distinguishes verification, and supports status/org assignment with CSRF", async () => {
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

    const host = TENANT_HOST;
    const detail = await request(app)
      .get(`/admin/domains/${encodeURIComponent(host)}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-bb-pa-domain-detail="1"/);
    assert.match(detail.text, /data-bb-stitch-domain-detail="67-platform-settings"/);
    assert.match(detail.text, /data-bb-domain-hostname="pa-org\.blessboard\.org"/);
    assert.match(detail.text, /data-bb-domain-state="operational"/);
    assert.match(detail.text, /data-bb-domain-state="verification"/);
    assert.match(detail.text, /data-bb-domain-status="active"/);
    assert.match(detail.text, /data-bb-domain-verified=/);
    assert.match(detail.text, /data-bb-pa-domain-org-form="1"/);
    assert.match(detail.text, /data-bb-pa-domain-status-form="1"/);
    assert.match(detail.text, /name="confirm_status"/);
    assert.match(detail.text, /name="confirm_organization"/);
    assert.match(detail.text, /BlessBoard/);
    assert.doesNotMatch(detail.text, new RegExp(org.id, "i"));
    assert.doesNotMatch(detail.text, /session_cookie|DATABASE_URL|ResolveHostname|expectedDeploymentCode/i);
    assert.doesNotMatch(detail.text, /Buy Domain|Force Verify|certificate issuance job/i);

    const csrfToken = extractCookie(detail, CSRF_COOKIE) || "";
    assert.ok(csrfToken);

    const noConfirm = await request(app)
      .post(`/admin/domains/${encodeURIComponent(host)}/status`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfToken}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        status: "inactive",
      })
      .redirects(0);
    assert.equal(noConfirm.status, 303);
    assert.match(String(noConfirm.headers.location || ""), /error=confirm_required/);

    const badCsrf = await request(app)
      .post(`/admin/domains/${encodeURIComponent(host)}/status`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfToken}`)
      .type("form")
      .send({
        [CSRF_FIELD]: "not-a-valid-token",
        status: "inactive",
        confirm_status: "1",
      })
      .redirects(0);
    assert.equal(badCsrf.status, 303);
    assert.match(String(badCsrf.headers.location || ""), /error=csrf/);

    const statusSave = await request(app)
      .post(`/admin/domains/${encodeURIComponent(host)}/status`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfToken}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        status: "inactive",
        confirm_status: "1",
      })
      .redirects(0);
    assert.equal(statusSave.status, 303);
    assert.match(String(statusSave.headers.location || ""), /notice=status_saved/);

    const afterStatus = await request(app)
      .get(`/admin/domains/${encodeURIComponent(host)}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(afterStatus.status, 200);
    assert.match(afterStatus.text, /data-bb-domain-status="inactive"/);
    assert.match(afterStatus.text, /data-bb-domain-verified=/);

    const orgSave = await request(app)
      .post(`/admin/domains/${encodeURIComponent(host)}/organization`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfToken}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        organization_key: "pa-extra-1",
        confirm_organization: "1",
      })
      .redirects(0);
    assert.equal(orgSave.status, 303);
    assert.match(String(orgSave.headers.location || ""), /notice=organization_saved/);

    const afterOrg = await request(app)
      .get(`/admin/domains/${encodeURIComponent(host)}`)
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(afterOrg.status, 200);
    assert.match(afterOrg.text, /pa-extra-1/);
    assert.match(afterOrg.text, /href="\/admin\/organizations\/pa-extra-1#pa-org-domains"/);

    const restoreOrg = await request(app)
      .post(`/admin/domains/${encodeURIComponent(host)}/organization`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfToken}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        organization_key: "pa-demo",
        confirm_organization: "1",
      })
      .redirects(0);
    assert.equal(restoreOrg.status, 303);

    const restoreStatus = await request(app)
      .post(`/admin/domains/${encodeURIComponent(host)}/status`)
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrfToken}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        status: "active",
        confirm_status: "1",
      })
      .redirects(0);
    assert.equal(restoreStatus.status, 303);

    const hqDetail = await request(app)
      .get(`/admin/domains/${encodeURIComponent(host)}`)
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hqDetail.status, 403);
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
    assert.match(detail.text, /data-bb-stitch-org-domains="67-platform-settings"/);
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
    assert.match(after.text, /data-bb-sub-plan-key="growth"/);
    assert.match(after.text, /data-bb-sub-plan-display="Growth"/);

    const afterSubs = await request(app)
      .get("/admin/subscriptions?q=pa-demo")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(afterSubs.status, 200);
    assert.match(afterSubs.text, /data-bb-sub-org="pa-demo"/);
    assert.match(afterSubs.text, /data-bb-sub-plan-key="growth"/);
    assert.match(afterSubs.text, /data-bb-sub-plan-display="Growth"/);

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

    const afterOverride = await request(app)
      .get("/admin/organizations/pa-demo")
      .set("Host", "blessboard.org")
      .set("Cookie", cookie);
    assert.equal(afterOverride.status, 200);
    assert.match(afterOverride.text, /data-bb-feature="max_branches"[^>]*data-bb-feature-source="override"|data-bb-feature-source="override"[^>]*data-bb-feature="max_branches"/);
    assert.match(afterOverride.text, /data-bb-pa-override-list="1"/);
    assert.match(afterOverride.text, /data-bb-entitlement-source="plan"/);
    assert.match(afterOverride.text, /data-bb-entitlement-source="override"/);
    assert.match(afterOverride.text, /Organization override/);
    assert.match(afterOverride.text, /Inherited from plan/);
    assert.doesNotMatch(afterOverride.text, /name="feature_key"[^>]*>[\s\S]*value="made_up_feature"/);

    const badKey = await request(app)
      .post("/admin/organizations/pa-demo/entitlement-override")
      .set("Host", "blessboard.org")
      .set("Cookie", `${cookie}; ${CSRF_COOKIE}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        feature_key: "made_up_feature",
        feature_kind: "boolean",
        boolean_value: "true",
        reason: "should be rejected",
        confirm_override: "1",
      });
    assert.equal(badKey.status, 303);
    assert.match(String(badKey.headers.location || ""), /error=invalid/);

    const hqDetail = await request(app)
      .get("/admin/organizations/pa-demo")
      .set("Host", "blessboard.org")
      .set("Cookie", await cookieFor(users.hq))
      .set("Accept", "text/html");
    assert.equal(hqDetail.status, 403);
  });
});
