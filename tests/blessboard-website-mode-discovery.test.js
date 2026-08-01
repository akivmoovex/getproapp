"use strict";

/**
 * Public discovery consistency for website-mode (sitemap, canonical, branch cards).
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
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  loadTenantPublicPageModel,
  KIND,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const {
  buildTenantPublicDiscoveryUrls,
  buildTenantPublicSitemapXml,
  buildPublicBranchDiscovery,
} = require("../src/blessboard/http/tenantPublicDiscovery");
const { buildTenantPublicSeo } = require("../src/blessboard/http/tenantPublicSeo");
const { WEBSITE_MODE, deriveWebsiteMode } = require("../src/blessboard/services/resolveWebsiteMode");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST_SINGLE = "wm-disc-single.blessboard.org";
const HOST_MULTI = "wm-disc-multi.blessboard.org";

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

describe("blessboard website mode discovery (pure)", () => {
  const hq = {
    id: "11111111-1111-1111-1111-111111111111",
    key: "hq",
    displayName: "HQ",
    isPrimary: true,
  };
  const east = {
    id: "22222222-2222-2222-2222-222222222222",
    key: "campus-east",
    displayName: "East",
    isPrimary: false,
  };

  it("single-site sitemap excludes branch website URLs", () => {
    const urls = buildTenantPublicDiscoveryUrls({
      hostname: "church.example",
      routingMode: "tenant",
      websiteMode: WEBSITE_MODE.SINGLE_SITE,
      activeBranches: [hq],
    });
    assert.ok(urls.includes("https://church.example/"));
    assert.ok(urls.includes("https://church.example/about"));
    assert.equal(
      urls.some((u) => u.includes("/branches/")),
      false,
      "single-site must not list branch website paths"
    );
    assert.equal(new Set(urls).size, urls.length, "no duplicate canonical URLs");
  });

  it("single-site canonical is church-wide (even if pathPrefix was branch)", () => {
    const seo = buildTenantPublicSeo({
      hostname: "church.example",
      pageKey: "about",
      publicName: "Demo",
      pathPrefix: "",
      websiteStatus: "published",
      dataEnvironment: "live",
    });
    assert.equal(seo.canonicalUrl, "https://church.example/about");
    assert.equal(seo.ogUrl, "https://church.example/about");
  });

  it("single-site branch card links to unified website", () => {
    const mode = deriveWebsiteMode([hq]);
    const discovery = buildPublicBranchDiscovery({
      websiteMode: mode,
      routingMode: "tenant",
      churchHomeHref: "/",
    });
    assert.equal(discovery.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.deepEqual(discovery.branchSwitcher, []);
    assert.equal(discovery.branchLocations.length, 1);
    assert.equal(discovery.branchLocations[0].websiteHref, "/");
    assert.equal(discovery.branchLocations[0].kind, "location");
  });

  it("multi-site sitemap includes HQ and active branches; inactive excluded", () => {
    const urls = buildTenantPublicDiscoveryUrls({
      hostname: "multi.example",
      routingMode: "tenant",
      websiteMode: WEBSITE_MODE.MULTI_SITE,
      activeBranches: [hq, east],
    });
    assert.ok(urls.includes("https://multi.example/"));
    assert.ok(urls.includes("https://multi.example/about"));
    assert.ok(urls.includes("https://multi.example/branches/hq"));
    assert.ok(urls.includes("https://multi.example/branches/campus-east"));
    assert.ok(urls.includes("https://multi.example/branches/campus-east/about"));
    assert.equal(
      urls.some((u) => u.includes("campus-old")),
      false,
      "inactive branches must not appear when omitted from activeBranches"
    );
    assert.equal(new Set(urls).size, urls.length, "no duplicate canonical URLs");
  });

  it("branch canonical remains branch-specific in multi-site", () => {
    const seo = buildTenantPublicSeo({
      hostname: "multi.example",
      pageKey: "about",
      publicName: "East",
      pathPrefix: "/branches/campus-east",
      websiteStatus: "published",
      dataEnvironment: "live",
    });
    assert.equal(seo.canonicalUrl, "https://multi.example/branches/campus-east/about");
    assert.equal(seo.ogUrl, seo.canonicalUrl);
  });

  it("path-mode multi-site discovery includes HQ and branch absolute URLs without duplicates", () => {
    const urls = buildTenantPublicDiscoveryUrls({
      hostname: "blessboard.org",
      routingMode: "path",
      organizationKey: "demo-church",
      websiteMode: WEBSITE_MODE.MULTI_SITE,
      activeBranches: [hq, east],
    });
    assert.ok(urls.includes("https://blessboard.org/c/demo-church"));
    assert.ok(urls.includes("https://blessboard.org/c/demo-church/branches/campus-east"));
    const xml = buildTenantPublicSitemapXml(urls);
    assert.match(xml, /<loc>https:\/\/blessboard\.org\/c\/demo-church<\/loc>/);
    assert.equal(new Set(urls).size, urls.length);
  });
});

describe("blessboard website mode discovery (integration)", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let hqSingle;
  let campusEast;
  let tenantSingle;
  let tenantMulti;

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
          deploymentCode: "blessboard-org-staging",
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
          heading: `${key} Hero`,
          bodyText: "Church-wide",
          status: "published",
        });
        return {
          org: prov.records.organization,
          church: ch.records.church,
          hq: ch.records.hqBranch,
        };
      }

      const single = await provisionOrg("wm-disc-single", HOST_SINGLE);
      hqSingle = single.hq;

      const multi = await provisionOrg("wm-disc-multi", HOST_MULTI);

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

      const eastPages = await provisionEmptyPublicPages(pool, {
        churchId: multi.church.id,
        branchId: campusEast.id,
      });
      for (const page of eastPages.pages) {
        await updatePublicPage(pool, page.id, { status: "published" });
      }

      tenantSingle = buildBlessBoardTenantContext({
        organization: { id: single.org.id, key: "wm-disc-single" },
        church: {
          id: single.church.id,
          churchKey: "wm-disc-single",
          displayName: "wm-disc-single Church",
          dataEnvironment: "testing",
        },
        hqBranch: {
          id: single.hq.id,
          branchKey: "hq",
          displayName: "HQ",
        },
        primaryBranch: {
          id: single.hq.id,
          branchKey: "hq",
          displayName: "HQ",
        },
      });

      tenantMulti = buildBlessBoardTenantContext({
        organization: { id: multi.org.id, key: "wm-disc-multi" },
        church: {
          id: multi.church.id,
          churchKey: "wm-disc-multi",
          displayName: "wm-disc-multi Church",
          dataEnvironment: "testing",
        },
        hqBranch: {
          id: multi.hq.id,
          branchKey: "hq",
          displayName: "HQ",
        },
        primaryBranch: {
          id: multi.hq.id,
          branchKey: "hq",
          displayName: "HQ",
        },
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

  it("single-site model: empty switcher, locations point to church home, church-wide canonical", async () => {
    requireDb();
    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantSingle,
      pageKey: "home",
      hostname: HOST_SINGLE,
      pathPrefix: `/branches/${hqSingle.key}`,
      selectedBranch: {
        id: hqSingle.id,
        key: hqSingle.key,
        displayName: hqSingle.displayName || "HQ",
        isPrimary: true,
      },
      routingMode: "tenant",
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.deepEqual(model.branchSwitcher, []);
    assert.ok(model.branchLocations.length >= 1);
    for (const loc of model.branchLocations) {
      assert.equal(loc.websiteHref, "/");
    }
    assert.equal(model.canonicalUrl, `https://${HOST_SINGLE}/`);
    assert.equal(model.seo.ogUrl, `https://${HOST_SINGLE}/`);
    assert.equal(model.pathPrefix, "");
    assert.equal(
      Object.values(model.publicPaths).some((p) => String(p).includes("/branches/")),
      false
    );
  });

  it("single-site tenant sitemap excludes branch website URLs", async () => {
    requireDb();
    const res = await request(app).get("/sitemap.xml").set("Host", HOST_SINGLE);
    assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], /xml/);
    assert.match(res.text, new RegExp(`https://${HOST_SINGLE}/`));
    assert.doesNotMatch(res.text, /\/branches\//);
  });

  it("multi-site model: switcher + branch cards use branch websites; HQ canonical church-wide", async () => {
    requireDb();
    const hqModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantMulti,
      pageKey: "about",
      hostname: HOST_MULTI,
      pathPrefix: "",
      selectedBranch: null,
      routingMode: "tenant",
    });
    assert.equal(hqModel.kind, KIND.OK);
    assert.equal(hqModel.websiteMode, WEBSITE_MODE.MULTI_SITE);
    assert.equal(hqModel.canonicalUrl, `https://${HOST_MULTI}/about`);
    assert.ok(hqModel.branchSwitcher.some((b) => b.key === "campus-east"));
    assert.ok(hqModel.branchSwitcher.every((b) => b.key !== "campus-old"));
    const eastCard = hqModel.branchLocations.find((b) => b.key === "campus-east");
    assert.equal(eastCard.websiteHref, "/branches/campus-east");

    const branchModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantMulti,
      pageKey: "about",
      hostname: HOST_MULTI,
      pathPrefix: "/branches/campus-east",
      selectedBranch: {
        id: campusEast.id,
        key: campusEast.branch_key,
        displayName: campusEast.display_name,
        isPrimary: false,
      },
      routingMode: "tenant",
    });
    assert.equal(
      branchModel.canonicalUrl,
      `https://${HOST_MULTI}/branches/campus-east/about`
    );
    assert.notEqual(branchModel.canonicalUrl, hqModel.canonicalUrl);
  });

  it("multi-site sitemap includes HQ + active branches; excludes inactive", async () => {
    requireDb();
    const res = await request(app).get("/sitemap.xml").set("Host", HOST_MULTI);
    assert.equal(res.status, 200);
    assert.match(res.text, new RegExp(`https://${HOST_MULTI}/`));
    assert.match(res.text, /\/branches\/hq/);
    assert.match(res.text, /\/branches\/campus-east/);
    assert.doesNotMatch(res.text, /campus-old/);

    const locs = [...res.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    assert.equal(new Set(locs).size, locs.length, "no duplicate canonical URLs in sitemap");
  });

  it("path-mode single-site sitemap excludes branch website", async () => {
    requireDb();
    const res = await request(app)
      .get("/c/wm-disc-single/sitemap.xml")
      .set("Host", "blessboard.org");
    assert.equal(res.status, 200);
    assert.match(res.text, /\/c\/wm-disc-single<\/loc>/);
    assert.doesNotMatch(res.text, /\/branches\//);
  });

  it("path-mode single-site keeps church-wide /c/:org nav and canonical", async () => {
    requireDb();
    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantSingle,
      pageKey: "about",
      hostname: "blessboard.org",
      pathPrefix: "/c/wm-disc-single",
      selectedBranch: null,
      routingMode: "path",
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.websiteMode, WEBSITE_MODE.SINGLE_SITE);
    assert.equal(model.canonicalUrl, "https://blessboard.org/c/wm-disc-single/about");
    assert.equal(model.pathPrefix, "/c/wm-disc-single");
    assert.equal(model.homeHref, "/c/wm-disc-single");
    const aboutNav = model.navItems.find((i) => i.key === "about");
    assert.equal(aboutNav.href, "/c/wm-disc-single/about");
  });
});
