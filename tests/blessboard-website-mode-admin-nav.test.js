"use strict";

/**
 * Website-mode HQ / Branch Admin navigation labels and destinations.
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
const { FEATURE_KEYS } = require("../src/platform/services/entitlementService");
const { filterHqNavItems } = require("../src/blessboard/http/hqAdminShellLocals");
const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");
const { BRANCH_ADMIN_NAV } = require("../src/blessboard/http/branchAdminNav");
const { buildHqMobileNav, flattenMobileNavKeys } = require("../src/blessboard/http/adminMobileNavGroups");
const {
  applyHqWebsiteModeNav,
  applyBranchWebsiteModeNav,
  hqWebsiteBranchNavKey,
} = require("../src/blessboard/http/websiteModeAdminNav");
const { deriveWebsiteMode, WEBSITE_MODE } = require("../src/blessboard/services/resolveWebsiteMode");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_SINGLE = "wm-nav-single.blessboard.org";
const HOST_MULTI = "wm-nav-multi.blessboard.org";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    ...overrides,
  };
}

describe("websiteModeAdminNav (pure)", () => {
  it("single-site HQ keeps one Website item; no branch destinations", () => {
    const filtered = filterHqNavItems(HQ_ADMIN_NAV, {});
    const mode = deriveWebsiteMode([
      {
        id: "11111111-1111-1111-1111-111111111111",
        key: "hq",
        displayName: "HQ",
        isPrimary: true,
      },
    ]);
    const { navItems } = applyHqWebsiteModeNav(filtered, mode, { activeNav: "content" });
    const website = navItems.filter((i) => i.key === "content" || String(i.key).startsWith("website_"));
    assert.equal(website.length, 1);
    assert.equal(website[0].label, "Website");
    assert.equal(website[0].href, "/hq/website");
    assert.ok(!navItems.some((i) => i.key === "branch_websites"));
    assert.ok(!navItems.some((i) => String(i.key).startsWith("website_branch_")));
  });

  it("multi-site HQ shows HQ Website, Branch Websites heading, and each active branch", () => {
    const filtered = filterHqNavItems(HQ_ADMIN_NAV, {});
    const mode = deriveWebsiteMode([
      {
        id: "11111111-1111-1111-1111-111111111111",
        key: "hq",
        displayName: "HQ",
        isPrimary: true,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        key: "campus-east",
        displayName: "Campus East",
        isPrimary: false,
      },
    ]);
    const { navItems, activeNav } = applyHqWebsiteModeNav(filtered, mode, {
      activeNav: "content",
      requestPath: "/hq/website/branches/campus-east/pages/home",
    });
    assert.equal(navItems.find((i) => i.key === "content").label, "HQ Website");
    assert.ok(navItems.some((i) => i.key === "branch_websites" && i.navHeading));
    const east = navItems.find((i) => i.key === hqWebsiteBranchNavKey("campus-east"));
    assert.ok(east);
    assert.equal(east.label, "Campus East");
    assert.equal(east.href, "/hq/website/branches/campus-east");
    assert.equal(activeNav, hqWebsiteBranchNavKey("campus-east"));
  });

  it("Branch Admin never lists other branches; labels differ by mode", () => {
    const single = applyBranchWebsiteModeNav(
      BRANCH_ADMIN_NAV.filter((i) => i.nav && i.enabled),
      deriveWebsiteMode([
        {
          id: "11111111-1111-1111-1111-111111111111",
          key: "hq",
          isPrimary: true,
        },
      ])
    );
    assert.equal(single.find((i) => i.key === "website").label, "Website");
    assert.ok(!single.some((i) => String(i.key).startsWith("website_branch_")));

    const multi = applyBranchWebsiteModeNav(
      BRANCH_ADMIN_NAV.filter((i) => i.nav && i.enabled),
      deriveWebsiteMode([
        {
          id: "11111111-1111-1111-1111-111111111111",
          key: "hq",
          isPrimary: true,
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          key: "campus-east",
          isPrimary: false,
        },
      ])
    );
    assert.equal(multi.find((i) => i.key === "website").label, "My Branch Website");
    assert.equal(multi.find((i) => i.key === "website").href, "/branch-admin/website");
    assert.ok(!multi.some((i) => String(i.key).startsWith("website_branch_")));
  });

  it("inactive branches are not present in derived mode nav", () => {
    // deriveWebsiteMode only accepts active list — inactive never included by resolver.
    const mode = deriveWebsiteMode([
      {
        id: "11111111-1111-1111-1111-111111111111",
        key: "hq",
        displayName: "HQ",
        isPrimary: true,
      },
    ]);
    assert.equal(mode.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    const { navItems } = applyHqWebsiteModeNav(filterHqNavItems(HQ_ADMIN_NAV, {}), mode);
    assert.ok(!navItems.some((i) => /old|inactive/i.test(i.label || "")));
  });

  it("plan-lock filter still omits network-only HQ nav after website composition", () => {
    const filtered = filterHqNavItems(HQ_ADMIN_NAV, {
      [FEATURE_KEYS.EXECUTIVE_REPORTS]: false,
      [FEATURE_KEYS.ADVANCED_AUDIT]: false,
    });
    const mode = deriveWebsiteMode([
      {
        id: "11111111-1111-1111-1111-111111111111",
        key: "hq",
        isPrimary: true,
      },
      {
        id: "22222222-2222-2222-2222-222222222222",
        key: "campus-east",
        displayName: "East",
        isPrimary: false,
      },
    ]);
    const { navItems } = applyHqWebsiteModeNav(filtered, mode, { activeNav: "content" });
    const mobile = buildHqMobileNav(navItems, "content");
    const keys = flattenMobileNavKeys(mobile);
    assert.ok(!keys.includes("executive"));
    assert.ok(!keys.includes("governance"));
    assert.ok(keys.includes("content"));
    assert.ok(keys.includes(hqWebsiteBranchNavKey("campus-east")));
    assert.ok(!keys.includes("branch_websites"));
  });
});

describe("website mode admin navigation (http)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let cookies = {};
  let campusEast;

  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });

      async function provision(key, host) {
        const org = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `${key} Org`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-staging",
          isPrimary: true,
        });
        assert.equal(org.ok, true, org.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `${key} Church`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        return {
          org: org.records.organization,
          church: ch.records.church,
          hq: ch.records.hqBranch,
        };
      }

      const single = await provision("wm-nav-s", HOST_SINGLE);
      const multi = await provision("wm-nav-m", HOST_MULTI);

      const east = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id, branch_key, display_name`,
        [multi.church.id]
      );
      campusEast = east.rows[0];

      await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-old', 'Old Campus', 'branch', 'inactive', false, 'UTC', 'US')`,
        [multi.church.id]
      );

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-staging",
          userId: created.user.id,
          organizationId: role.organizationKey === "wm-nav-s" ? single.org.id : multi.org.id,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
      }

      cookies.hqSingle = await makeUser("hq-nav-s@example.test", "HQ Single", {
        email: "hq-nav-s@example.test",
        organizationKey: "wm-nav-s",
        roleKey: "church_hq_admin",
        churchKey: "wm-nav-s",
      });
      cookies.branchSingle = await makeUser("ba-nav-s@example.test", "BA Single", {
        email: "ba-nav-s@example.test",
        organizationKey: "wm-nav-s",
        roleKey: "branch_admin",
        churchKey: "wm-nav-s",
        branchKey: "hq",
      });
      cookies.hqMulti = await makeUser("hq-nav-m@example.test", "HQ Multi", {
        email: "hq-nav-m@example.test",
        organizationKey: "wm-nav-m",
        roleKey: "church_hq_admin",
        churchKey: "wm-nav-m",
      });
      cookies.branchMulti = await makeUser("ba-nav-m@example.test", "BA Multi", {
        email: "ba-nav-m@example.test",
        organizationKey: "wm-nav-m",
        roleKey: "branch_admin",
        churchKey: "wm-nav-m",
        branchKey: "campus-east",
      });

      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set(["blessboard.org", "www.blessboard.org"]),
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

  it("single-site HQ navigation shows Website only", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq")
      .set("Host", HOST_SINGLE)
      .set("Cookie", cookies.hqSingle);
    assert.equal(res.status, 200);
    assert.match(res.text, />Website</);
    assert.doesNotMatch(res.text, />HQ Website</);
    assert.doesNotMatch(res.text, />Branch Websites</);
    assert.doesNotMatch(res.text, /\/hq\/website\/branches\//);
  });

  it("single-site Branch Admin keeps shared Website label (not My Branch Website)", async () => {
    requireDb();
    const res = await request(app)
      .get("/branch-admin")
      .set("Host", HOST_SINGLE)
      .set("Cookie", cookies.branchSingle);
    assert.equal(res.status, 200);
    assert.match(res.text, />Website</);
    assert.doesNotMatch(res.text, />My Branch Website</);
    assert.doesNotMatch(res.text, /\/hq\/website\/branches\//);
  });

  it("multi-site HQ navigation shows HQ Website, Branch Websites, and active branches only", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq")
      .set("Host", HOST_MULTI)
      .set("Cookie", cookies.hqMulti);
    assert.equal(res.status, 200);
    assert.match(res.text, />HQ Website</);
    assert.match(res.text, />Branch Websites</);
    assert.match(res.text, />Campus East</);
    assert.match(res.text, /\/hq\/website\/branches\/campus-east/);
    assert.doesNotMatch(res.text, />Old Campus</);
    assert.doesNotMatch(res.text, /campus-old/);
  });

  it("multi-site Branch Admin sees My Branch Website only for assigned branch", async () => {
    requireDb();
    // Branch-scoped content routes authorize against the assigned branch (not catalogue primary).
    const res = await request(app)
      .get("/branch-admin/content")
      .set("Host", HOST_MULTI)
      .set("Cookie", cookies.branchMulti);
    assert.equal(res.status, 200);
    assert.match(res.text, />My Branch Website</);
    assert.match(res.text, /\/branch-admin\/website/);
    assert.doesNotMatch(res.text, /\/hq\/website\/branches\//);
    assert.doesNotMatch(res.text, />HQ Website</);
    assert.doesNotMatch(res.text, /data-bb-nav-key="website_branch_/);
  });

  it("cross-branch website management remains denied for Branch Admin", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/website/branches/campus-east")
      .set("Host", HOST_MULTI)
      .set("Cookie", cookies.branchMulti);
    assert.ok([403, 404].includes(res.status));
  });
});
