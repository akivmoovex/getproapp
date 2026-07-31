"use strict";

/**
 * Public routing: single-site branch URLs collapse to church-wide; multi-site keeps branch sites.
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
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const {
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  churchWidePublicPathForPage,
  isUnsafeSingleSiteRedirectTarget,
  PERMANENT_REDIRECT_STATUS,
  redirectSingleSiteBranchToChurchWide,
} = require("../src/blessboard/http/singleSiteBranchPublicRedirect");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST_SINGLE = "wm-route-single.blessboard.org";
const HOST_MULTI = "wm-route-multi.blessboard.org";
const HOST_OTHER = "wm-route-other.blessboard.org";

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

describe("singleSiteBranchPublicRedirect helper", () => {
  it("builds path and tenant church-wide targets with page suffixes", () => {
    assert.equal(
      churchWidePublicPathForPage({
        routingMode: "path",
        organizationKey: "grace",
        pageKey: "home",
      }),
      "/c/grace"
    );
    assert.equal(
      churchWidePublicPathForPage({
        routingMode: "path",
        organizationKey: "grace",
        pageKey: "events",
      }),
      "/c/grace/events"
    );
    assert.equal(
      churchWidePublicPathForPage({
        routingMode: "tenant",
        pageKey: "home",
      }),
      "/"
    );
    assert.equal(
      churchWidePublicPathForPage({
        routingMode: "tenant",
        pageKey: "sermons",
      }),
      "/sermons"
    );
  });

  it("blocks redirect loops and branch-path targets", () => {
    assert.equal(isUnsafeSingleSiteRedirectTarget("/sermons", "/sermons"), true);
    assert.equal(
      isUnsafeSingleSiteRedirectTarget("/branches/main/sermons", "/branches/main/sermons"),
      true
    );
    assert.equal(
      isUnsafeSingleSiteRedirectTarget("/branches/main", "/c/grace/branches/main"),
      true
    );
    assert.equal(
      isUnsafeSingleSiteRedirectTarget("/branches/main/sermons", "/sermons"),
      false
    );
  });

  it("sends 301 and refuses unsafe targets", () => {
    const headers = {};
    let statusCode = null;
    const res = {
      redirect(code, loc) {
        statusCode = code;
        headers.location = loc;
      },
    };
    const ok = redirectSingleSiteBranchToChurchWide(
      { path: "/branches/main/events" },
      res,
      { routingMode: "tenant", pageKey: "events" }
    );
    assert.equal(ok, true);
    assert.equal(statusCode, PERMANENT_REDIRECT_STATUS);
    assert.equal(headers.location, "/events");

    const loop = redirectSingleSiteBranchToChurchWide(
      { path: "/events" },
      res,
      { routingMode: "tenant", pageKey: "events" }
    );
    assert.equal(loop, false);
  });
});

describe("blessboard website mode public routing", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let churchSingle;
  let hqSingle;
  let churchMulti;
  let campusEast;
  let inactiveBranch;
  let foreignBranch;

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

      async function provisionOrg(key, host) {
        const prov = await provisionPlatformTenant(pool, {
          organizationKey: key,
          displayName: `${key} Org`,
          legalName: null,
          dataEnvironment: "testing",
          productKey: "blessboard",
          productTenantKey: key,
          hostname: host,
          domainType: "canonical",
          deploymentCode: "blessboard-org-v5",
          isPrimary: true,
        });
        assert.equal(prov.ok, true, prov.message);
        const ch = await provisionBlessBoardChurch(pool, {
          organizationKey: key,
          churchKey: key,
          displayName: `${key} Church`,
          dataEnvironment: "testing",
          hqBranchKey: "hq",
          hqBranchDisplayName: "HQ",
        });
        assert.equal(ch.ok, true, ch.message);
        await ensureChurchSettingsInitialized(pool, ch.records.church.id);
        await updateChurchSettings(pool, ch.records.church.id, {
          publicName: `${key} Church`,
          websiteStatus: "published",
        });
        const pages = await provisionEmptyPublicPages(pool, {
          churchId: ch.records.church.id,
        });
        for (const page of pages.pages) {
          await updatePublicPage(pool, page.id, { status: "published" });
        }
        const home = pages.pages.find((p) => p.pageKey === "home");
        await createPageSection(pool, {
          pageId: home.id,
          sectionKey: "hero",
          sectionType: "hero",
          heading: `${key} HQ Hero`,
          bodyText: "Church-wide copy",
          status: "published",
        });
        return { org: prov.records.organization, church: ch.records.church, hq: ch.records.hqBranch };
      }

      const single = await provisionOrg("wm-single", HOST_SINGLE);
      churchSingle = single.church;
      hqSingle = single.hq;

      const multi = await provisionOrg("wm-multi", HOST_MULTI);
      churchMulti = multi.church;

      const east = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id, branch_key, display_name`,
        [churchMulti.id]
      );
      campusEast = east.rows[0];

      const eastPages = await provisionEmptyPublicPages(pool, {
        churchId: churchMulti.id,
        branchId: campusEast.id,
      });
      const eastHome = eastPages.pages.find((p) => p.pageKey === "home");
      await updatePublicPage(pool, eastHome.id, { status: "published" });
      await createPageSection(pool, {
        pageId: eastHome.id,
        sectionKey: "east-hero",
        sectionType: "hero",
        heading: "East Independent Hero",
        bodyText: "Branch-only copy",
        status: "published",
      });

      const inactive = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-old', 'Old', 'branch', 'inactive', false, 'UTC', 'US')
         RETURNING branch_key`,
        [churchMulti.id]
      );
      inactiveBranch = inactive.rows[0];

      const other = await provisionOrg("wm-other", HOST_OTHER);
      const foreign = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'foreign-only', 'Foreign', 'branch', 'active', false, 'UTC', 'US')
         RETURNING branch_key`,
        [other.church.id]
      );
      foreignBranch = foreign.rows[0];

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

  it("one active branch: path root redirects to church-wide home", async () => {
    requireDb();
    const res = await request(app)
      .get(`/c/wm-single/branches/${hqSingle.key}`)
      .set("Host", "blessboard.org");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "/c/wm-single");
  });

  it("one active branch: path subpage preserves suffix", async () => {
    requireDb();
    const res = await request(app)
      .get(`/c/wm-single/branches/${hqSingle.key}/events`)
      .set("Host", "blessboard.org");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "/c/wm-single/events");
  });

  it("one active branch: tenant-host branch URL redirects to church-wide", async () => {
    requireDb();
    const root = await request(app)
      .get(`/branches/${hqSingle.key}`)
      .set("Host", HOST_SINGLE);
    assert.equal(root.status, 301);
    assert.equal(root.headers.location, "/");

    const sermons = await request(app)
      .get(`/branches/${hqSingle.key}/sermons`)
      .set("Host", HOST_SINGLE);
    assert.equal(sermons.status, 301);
    assert.equal(sermons.headers.location, "/sermons");
  });

  it("single-site church-wide URLs still 200", async () => {
    requireDb();
    const pathHome = await request(app).get("/c/wm-single").set("Host", "blessboard.org");
    assert.equal(pathHome.status, 200);
    assert.match(pathHome.text, /wm-single HQ Hero/);

    const tenantHome = await request(app).get("/").set("Host", HOST_SINGLE);
    assert.equal(tenantHome.status, 200);
    assert.match(tenantHome.text, /wm-single HQ Hero/);
  });

  it("multi-site: branch website remains 200 with independent content", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/wm-multi/branches/campus-east")
      .set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /East Independent Hero/);
    assert.doesNotMatch(res.text, /wm-multi HQ Hero/);

    const tenant = await request(app)
      .get("/branches/campus-east")
      .set("Host", HOST_MULTI);
    assert.equal(tenant.status, 200);
    assert.match(tenant.text, /East Independent Hero/);
  });

  it("multi-site: HQ remains independent church-wide site", async () => {
    requireDb();
    const res = await request(app).get("/c/wm-multi").set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /wm-multi HQ Hero/);
    assert.doesNotMatch(res.text, /East Independent Hero/);
  });

  it("inactive branch remains unavailable (404, no HQ redirect)", async () => {
    requireDb();
    const res = await request(app)
      .get(`/c/wm-multi/branches/${inactiveBranch.branch_key}`)
      .set("Host", "blessboard.org");
    assert.equal(res.status, 404);
    assert.equal(res.headers.location, undefined);
  });

  it("unknown branch remains 404", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/wm-multi/branches/does-not-exist")
      .set("Host", "blessboard.org");
    assert.equal(res.status, 404);
    assert.equal(res.headers.location, undefined);
  });

  it("cross-organization branch remains 404", async () => {
    requireDb();
    const res = await request(app)
      .get(`/c/wm-multi/branches/${foreignBranch.branch_key}`)
      .set("Host", "blessboard.org");
    assert.equal(res.status, 404);
    assert.equal(res.headers.location, undefined);
  });

  it("no redirect loop: church-wide target is not a branch path", async () => {
    requireDb();
    const res = await request(app)
      .get(`/c/wm-single/branches/${hqSingle.key}/about`)
      .redirects(0)
      .set("Host", "blessboard.org");
    assert.equal(res.status, 301);
    assert.equal(res.headers.location, "/c/wm-single/about");
    assert.doesNotMatch(res.headers.location, /\/branches\//);

    const follow = await request(app)
      .get(res.headers.location)
      .redirects(0)
      .set("Host", "blessboard.org");
    assert.equal(follow.status, 200);
    assert.equal(follow.headers.location, undefined);
  });
});
