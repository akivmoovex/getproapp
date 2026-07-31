"use strict";

/**
 * Preview / editor consistency for single-site vs multi-site website modes.
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
  ensureChurchSettingsInitialized,
  updateChurchSettings,
} = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
  updatePageSection,
} = require("../src/blessboard/services/publicContentAdminService");
const {
  buildBlessBoardTenantContext,
} = require("../src/blessboard/http/buildBlessBoardTenantContext");
const {
  loadTenantPublicPageModel,
  KIND,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const {
  canonicalChurchWideHqContentPath,
} = require("../src/blessboard/http/singleSiteHqContentCanonical");

const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "correct-horse-battery-staple";
const HOST_SINGLE = "wm-prev-single.blessboard.org";
const HOST_MULTI = "wm-prev-multi.blessboard.org";
const HOST_OTHER = "wm-prev-other.blessboard.org";

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

describe("singleSiteHqContentCanonical helper", () => {
  it("maps branch mounts to church-wide HQ paths", () => {
    assert.equal(
      canonicalChurchWideHqContentPath("/hq/website/branches/hq/preview/home"),
      "/hq/content/preview/home"
    );
    assert.equal(
      canonicalChurchWideHqContentPath("/hq/content/b/hq/pages/about"),
      "/hq/content/pages/about"
    );
    assert.equal(canonicalChurchWideHqContentPath("/hq/website/branches/hq"), "/hq/website");
    assert.equal(canonicalChurchWideHqContentPath("/hq/content/preview/home"), null);
  });
});

describe("blessboard website mode preview consistency", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let cookies = {};
  let single;
  let multi;
  let other;
  let campusEast;
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
          deploymentCode: "blessboard-org-v5",
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
          heading: `${key} Church Hero`,
          bodyText: "Church-wide preview copy",
          status: "published",
        });
        return {
          org: org.records.organization,
          church: ch.records.church,
          hq: ch.records.hqBranch,
          homePageId: home.id,
        };
      }

      single = await provision("wm-prev-s", HOST_SINGLE);
      multi = await provision("wm-prev-m", HOST_MULTI);
      other = await provision("wm-prev-o", HOST_OTHER);

      const east = await pool.query(
        `INSERT INTO blessboard.branches
           (church_id, branch_key, display_name, branch_type, status, is_primary, timezone, country_code)
         VALUES ($1, 'campus-east', 'Campus East', 'branch', 'active', false, 'UTC', 'US')
         RETURNING id, branch_key, display_name`,
        [multi.church.id]
      );
      campusEast = east.rows[0];

      const eastPages = await provisionEmptyPublicPages(pool, {
        churchId: multi.church.id,
        branchId: campusEast.id,
      });
      const eastHome = eastPages.pages.find((p) => p.pageKey === "home");
      await updatePublicPage(pool, eastHome.id, { status: "published" });
      await createPageSection(pool, {
        pageId: eastHome.id,
        sectionKey: "east-hero",
        sectionType: "hero",
        heading: "East Branch Preview Hero",
        bodyText: "Branch-only preview copy",
        status: "draft",
      });

      // Distinct HQ draft section on multi church home for independence checks.
      const hqSections = await pool.query(
        `SELECT id FROM blessboard.page_sections WHERE page_id = $1 AND section_key = 'hero' LIMIT 1`,
        [multi.homePageId]
      );
      if (hqSections.rows[0]) {
        await updatePageSection(pool, hqSections.rows[0].id, {
          heading: "Multi HQ Preview Hero",
          bodyText: "HQ draft value A",
          status: "draft",
        });
      }

      tenantMulti = buildBlessBoardTenantContext({
        organization: { id: multi.org.id, key: "wm-prev-m" },
        church: {
          id: multi.church.id,
          churchKey: "wm-prev-m",
          displayName: "wm-prev-m Church",
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

      async function makeUser(email, displayName, role) {
        const created = await createBlessBoardUser(pool, {
          email,
          displayName,
          password: PASSWORD,
        });
        assert.equal(created.ok, true, created.message);
        assert.equal((await assignBlessBoardRole(pool, role)).ok, true);
        const orgId =
          role.organizationKey === "wm-prev-s"
            ? single.org.id
            : role.organizationKey === "wm-prev-m"
              ? multi.org.id
              : other.org.id;
        const session = await createV5Session(pool, {
          deploymentCode: "blessboard-org-v5",
          userId: created.user.id,
          organizationId: orgId,
        });
        assert.equal(session.ok, true, session.message || session.code);
        return `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
      }

      cookies.hqSingle = await makeUser("hq-prev-s@example.test", "HQ Single", {
        email: "hq-prev-s@example.test",
        organizationKey: "wm-prev-s",
        roleKey: "church_hq_admin",
        churchKey: "wm-prev-s",
      });
      cookies.hqMulti = await makeUser("hq-prev-m@example.test", "HQ Multi", {
        email: "hq-prev-m@example.test",
        organizationKey: "wm-prev-m",
        roleKey: "church_hq_admin",
        churchKey: "wm-prev-m",
      });
      cookies.hqOther = await makeUser("hq-prev-o@example.test", "HQ Other", {
        email: "hq-prev-o@example.test",
        organizationKey: "wm-prev-o",
        roleKey: "church_hq_admin",
        churchKey: "wm-prev-o",
      });
      cookies.branchMulti = await makeUser("ba-prev-m@example.test", "BA Multi", {
        email: "ba-prev-m@example.test",
        organizationKey: "wm-prev-m",
        roleKey: "branch_admin",
        churchKey: "wm-prev-m",
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

  it("single-site HQ preview uses church-wide content", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/content/preview/home")
      .set("Host", HOST_SINGLE)
      .set("Cookie", cookies.hqSingle);
    assert.equal(res.status, 200);
    assert.match(res.text, /wm-prev-s Church Hero|Church-wide preview copy/);
    // Preview is auth CMS path — not a public /branches/:key website.
    assert.doesNotMatch(res.headers.location || "", /\/branches\//);
  });

  it("single-site only-branch preview canonicalizes to church-wide preview", async () => {
    requireDb();
    const res = await request(app)
      .get(`/hq/website/branches/${single.hq.key}/preview/home`)
      .redirects(0)
      .set("Host", HOST_SINGLE)
      .set("Cookie", cookies.hqSingle);
    assert.equal(res.status, 303);
    assert.equal(res.headers.location, "/hq/content/preview/home");

    const legacy = await request(app)
      .get(`/hq/content/b/${single.hq.key}/preview/about`)
      .redirects(0)
      .set("Host", HOST_SINGLE)
      .set("Cookie", cookies.hqSingle);
    assert.equal(legacy.status, 303);
    assert.equal(legacy.headers.location, "/hq/content/preview/about");
  });

  it("multi-site HQ preview stays church-wide (contentBranchId null)", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/content/preview/home")
      .set("Host", HOST_MULTI)
      .set("Cookie", cookies.hqMulti);
    assert.equal(res.status, 200);
    assert.match(res.text, /Multi HQ Preview Hero|wm-prev-m Church Hero/);
    assert.doesNotMatch(res.text, /East Branch Preview Hero/);

    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantMulti,
      pageKey: "home",
      hostname: HOST_MULTI,
      preview: true,
      previewBranchId: null,
      selectedBranch: null,
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.websiteScope.contentBranchId, null);
    assert.equal(model.websiteScope.scopeType, "church");
  });

  it("multi-site branch preview uses branch content without HQ page fallback", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/website/branches/campus-east/preview/home")
      .set("Host", HOST_MULTI)
      .set("Cookie", cookies.hqMulti);
    assert.equal(res.status, 200);
    assert.match(res.text, /East Branch Preview Hero/);
    assert.doesNotMatch(res.text, /Multi HQ Preview Hero/);

    const model = await loadTenantPublicPageModel(pool, {
      tenant: tenantMulti,
      pageKey: "home",
      hostname: HOST_MULTI,
      preview: true,
      previewBranchId: String(campusEast.id),
      selectedBranch: {
        id: String(campusEast.id),
        key: "campus-east",
        displayName: "Campus East",
        isPrimary: false,
      },
      allowChurchContentFallback: false,
    });
    assert.equal(model.kind, KIND.OK);
    assert.equal(model.websiteScope.contentBranchId, String(campusEast.id));
    const headings = (model.sections || []).map((s) => s.heading).join(" ");
    assert.match(headings, /East Branch Preview Hero/);
    assert.doesNotMatch(headings, /Multi HQ Preview Hero/);
  });

  it("HQ and branch draft values remain independent", async () => {
    requireDb();
    const hqModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantMulti,
      pageKey: "home",
      hostname: HOST_MULTI,
      preview: true,
      previewBranchId: null,
      allowChurchContentFallback: false,
    });
    const branchModel = await loadTenantPublicPageModel(pool, {
      tenant: tenantMulti,
      pageKey: "home",
      hostname: HOST_MULTI,
      preview: true,
      previewBranchId: String(campusEast.id),
      selectedBranch: {
        id: String(campusEast.id),
        key: "campus-east",
        displayName: "Campus East",
      },
      allowChurchContentFallback: false,
    });
    assert.equal(hqModel.kind, KIND.OK);
    assert.equal(branchModel.kind, KIND.OK);
    const hqText = (hqModel.sections || []).map((s) => `${s.heading} ${s.bodyText}`).join(" ");
    const branchText = (branchModel.sections || [])
      .map((s) => `${s.heading} ${s.bodyText}`)
      .join(" ");
    assert.match(hqText, /HQ draft value A|Multi HQ Preview Hero/);
    assert.match(branchText, /Branch-only preview copy|East Branch Preview Hero/);
    assert.doesNotMatch(hqText, /Branch-only preview copy/);
    assert.doesNotMatch(branchText, /HQ draft value A/);
  });

  it("cross-org preview IDs return 404 (not feature-lock)", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/website/branches/campus-east/preview/home")
      .set("Host", HOST_OTHER)
      .set("Cookie", cookies.hqOther);
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /upgrade|plan|Growth|Network|feature.?lock/i);
  });

  it("cross-branch preview access denied for Branch Admin", async () => {
    requireDb();
    const res = await request(app)
      .get("/hq/website/branches/hq/preview/home")
      .set("Host", HOST_MULTI)
      .set("Cookie", cookies.branchMulti);
    assert.ok([403, 404].includes(res.status));
    assert.doesNotMatch(res.text, /upgrade|plan|Growth|Network|feature.?lock/i);
  });
});
