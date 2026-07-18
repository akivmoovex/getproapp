"use strict";

/**
 * BlessBoard V5 tenant public website rendering (published content only).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
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
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
  createLeader,
} = require("../src/blessboard/services/publicContentAdminService");
const { ensureChurchSettingsInitialized, updateChurchSettings } = require("../src/blessboard/services/blessBoardSettingsService");
const { safeExternalUrl } = require("../src/blessboard/http/tenantPublicSafe");
const { buildTenantPublicSeo } = require("../src/blessboard/http/tenantPublicSeo");

const IDENTITY_KEY = "blessboard-platform-v5";
const HOST_A = "pub-a.blessboard.org";
const HOST_B = "pub-b.blessboard.org";
const CHURCH_A = "Public Alpha Church";
const BRANCH_A = "Alpha HQ";

const PUBLIC_PATHS = [
  "/",
  "/about",
  "/leadership",
  "/ministries",
  "/events",
  "/sermons",
  "/contact",
  "/giving",
];

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

describe("blessboard public pages", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let churchA;
  let branchA;
  let churchB;
  let branchB;
  let app;

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

      const orgA = await provisionPlatformTenant(pool, {
        organizationKey: "pub-a",
        displayName: "Public A Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pub-a",
        hostname: HOST_A,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgA.ok, true, orgA.message);
      const chA = await provisionBlessBoardChurch(pool, {
        organizationKey: "pub-a",
        churchKey: "pub-a",
        displayName: CHURCH_A,
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: BRANCH_A,
      });
      assert.equal(chA.ok, true, chA.message);
      churchA = chA.records.church;
      branchA = chA.records.hqBranch;

      const orgB = await provisionPlatformTenant(pool, {
        organizationKey: "pub-b",
        displayName: "Public B Org",
        legalName: null,
        dataEnvironment: "testing",
        productKey: "blessboard",
        productTenantKey: "pub-b",
        hostname: HOST_B,
        domainType: "canonical",
        deploymentCode: "blessboard-org-v5",
        isPrimary: true,
      });
      assert.equal(orgB.ok, true, orgB.message);
      const chB = await provisionBlessBoardChurch(pool, {
        organizationKey: "pub-b",
        churchKey: "pub-b",
        displayName: "Public Beta Church",
        dataEnvironment: "testing",
        hqBranchKey: "hq",
        hqBranchDisplayName: "Beta HQ",
      });
      assert.equal(chB.ok, true, chB.message);
      churchB = chB.records.church;
      branchB = chB.records.hqBranch;

      await ensureChurchSettingsInitialized(pool, churchA.id);
      await updateChurchSettings(pool, churchA.id, {
        publicName: CHURCH_A,
        websiteStatus: "published",
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

  it("serves every public route on an authoritative tenant", async () => {
    requireDb();
    for (const p of PUBLIC_PATHS) {
      const res = await request(app).get(p).set("Host", HOST_A);
      assert.equal(res.status, 200, p);
      assert.match(res.text, new RegExp(CHURCH_A));
      assert.match(res.text, /BlessBoard V5/);
      assert.match(res.text, /bb-tp-nav/);
      assert.match(res.text, /href="\/login"/);
      assert.doesNotMatch(res.text, /\/hq|\/branch-admin|\/admin/i);
      assert.doesNotMatch(res.text, new RegExp(churchA.id, "i"));
    }
  });

  it("renders only published sections and hides drafts", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const about = pages.pages.find((p) => p.pageKey === "about");
    await createPageSection(pool, {
      pageId: about.id,
      sectionKey: "story",
      sectionType: "text",
      heading: "Our Story",
      bodyText: "Published story text",
      status: "draft",
    });
    const draftOnly = await request(app).get("/about").set("Host", HOST_A);
    assert.equal(draftOnly.status, 200);
    assert.doesNotMatch(draftOnly.text, /Published story text/);
    assert.doesNotMatch(draftOnly.text, /Our Story/);

    await updatePublicPage(pool, about.id, { status: "published" });
    const stillDraftSection = await request(app).get("/about").set("Host", HOST_A);
    assert.doesNotMatch(stillDraftSection.text, /Published story text/);

    const sections = await pool.query(
      `SELECT id FROM blessboard.page_sections WHERE page_id = $1 AND section_key = 'story'`,
      [about.id]
    );
    await pool.query(`UPDATE blessboard.page_sections SET status = 'published' WHERE id = $1`, [
      sections.rows[0].id,
    ]);

    const live = await request(app).get("/about").set("Host", HOST_A);
    assert.match(live.text, /Our Story/);
    assert.match(live.text, /Published story text/);
  });

  it("hides wrong-church records", async () => {
    requireDb();
    await createLeader(pool, {
      churchId: churchB.id,
      displayName: "Foreign Pastor",
      roleTitle: "Pastor",
      status: "published",
    });
    const pagesB = await provisionEmptyPublicPages(pool, { churchId: churchB.id });
    const leadB = pagesB.pages.find((p) => p.pageKey === "leadership");
    await updatePublicPage(pool, leadB.id, { status: "published" });

    const res = await request(app).get("/leadership").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /Foreign Pastor/);
  });

  it("applies branch-specific page override over church-wide", async () => {
    requireDb();
    const churchPages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const homeChurch = churchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, homeChurch.id, { status: "published", title: "Church Home" });
    await createPageSection(pool, {
      pageId: homeChurch.id,
      sectionKey: "church-hero",
      sectionType: "hero",
      heading: "Church-wide hero",
      bodyText: "Church scope copy",
      status: "published",
    });

    const branchPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
    });
    const homeBranch = branchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, homeBranch.id, { status: "published", title: "Branch Home" });
    await createPageSection(pool, {
      pageId: homeBranch.id,
      sectionKey: "branch-hero",
      sectionType: "hero",
      heading: "Branch hero",
      bodyText: "Branch override copy",
      status: "published",
    });

    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /Branch hero/);
    assert.match(res.text, /Branch override copy/);
    assert.doesNotMatch(res.text, /Church-wide hero/);
    assert.doesNotMatch(res.text, /Church scope copy/);
  });

  it("shows intentional empty states without fake data", async () => {
    requireDb();
    const res = await request(app).get("/sermons").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /bb-tp-empty/);
    assert.match(res.text, /not published yet|being prepared|will appear here/i);
    assert.doesNotMatch(res.text, /lorem ipsum|demo sermon|sample/i);
  });

  it("escapes user content in HTML", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const contact = pages.pages.find((p) => p.pageKey === "contact");
    await updatePublicPage(pool, contact.id, { status: "published" });
    // Insert via SQL to simulate stored text that must be escaped at render time.
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, sort_order, status)
       VALUES ($1, 'xss', 'text', $2, $3, 1, 'published')
       ON CONFLICT (page_id, section_key) DO UPDATE
         SET heading = EXCLUDED.heading, body_text = EXCLUDED.body_text, status = 'published'`,
      [contact.id, "<script>alert(1)</script>", 'Hello <b>world</b> & "friends"']
    );
    const res = await request(app).get("/contact").set("Host", HOST_A);
    assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
    assert.match(res.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(res.text, /Hello &lt;b&gt;world&lt;\/b&gt; &amp;/);
    assert.match(res.text, /friends/);
    assert.doesNotMatch(res.text, /Hello <b>world<\/b>/);
  });

  it("rejects unsafe external URLs", () => {
    assert.equal(safeExternalUrl("javascript:alert(1)"), null);
    assert.equal(safeExternalUrl("data:text/html,hi"), null);
    assert.equal(safeExternalUrl("//evil.example/path"), null);
    assert.equal(safeExternalUrl("https://example.org/give"), "https://example.org/give");
    assert.equal(safeExternalUrl("/relative/path"), "/relative/path");
    assert.equal(safeExternalUrl("mailto:a@example.org"), "mailto:a@example.org");
  });

  it("sets noindex for testing environments", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /name="robots" content="noindex, nofollow"/);
    assert.equal(res.headers["x-robots-tag"], "noindex, nofollow");
    assert.match(res.text, /class="bb-tp-env">testing</);

    const seo = buildTenantPublicSeo({
      hostname: HOST_A,
      pageKey: "about",
      publicName: CHURCH_A,
      dataEnvironment: "production",
      websiteStatus: "published",
    });
    assert.equal(seo.noindex, false);
    assert.match(seo.canonicalUrl, new RegExp(`https://${HOST_A}/about`));
  });

  it("unknown tenant returns controlled 404", async () => {
    requireDb();
    const res = await request(app).get("/about").set("Host", "missing.blessboard.org");
    assert.equal(res.status, 404);
    assert.match(res.text, /could not be found/i);
    assert.doesNotMatch(res.text, new RegExp(CHURCH_A));
  });

  it("suspended website is unavailable", async () => {
    requireDb();
    await updateChurchSettings(pool, churchA.id, {
      publicName: CHURCH_A,
      websiteStatus: "suspended",
    });
    try {
      const res = await request(app).get("/about").set("Host", HOST_A);
      assert.equal(res.status, 503);
      assert.doesNotMatch(res.text, /Published story text/);
    } finally {
      await updateChurchSettings(pool, churchA.id, {
        publicName: CHURCH_A,
        websiteStatus: "published",
      });
    }
  });

  it("draft leaders are not rendered", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const leadership = pages.pages.find((p) => p.pageKey === "leadership");
    await updatePublicPage(pool, leadership.id, { status: "published" });
    const draft = await createLeader(pool, {
      churchId: churchA.id,
      displayName: "Draft Elder",
      roleTitle: "Elder",
      status: "draft",
    });
    const live = await createLeader(pool, {
      churchId: churchA.id,
      displayName: "Live Pastor",
      roleTitle: "Pastor",
      status: "published",
    });
    assert.equal(draft.ok && live.ok, true);
    const res = await request(app).get("/leadership").set("Host", HOST_A);
    assert.match(res.text, /Live Pastor/);
    assert.doesNotMatch(res.text, /Draft Elder/);
  });

  it("V4 public page templates remain in place", () => {
    const v4About = path.join(__dirname, "../views/church/public/about.ejs");
    const v4Routes = path.join(__dirname, "../src/routes/church/publicPages.js");
    assert.equal(fs.existsSync(v4About), true);
    assert.equal(fs.existsSync(v4Routes), true);
    const routeSrc = fs.readFileSync(v4Routes, "utf8");
    assert.match(routeSrc, /\/about/);
    assert.match(routeSrc, /\/giving/);
    const v5Server = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.doesNotMatch(v5Server, /websiteContentService|views\/church\/public/);
  });

  it("preserves primary branch label and omits admin links", async () => {
    requireDb();
    const res = await request(app).get("/").set("Host", HOST_A);
    assert.match(res.text, new RegExp(BRANCH_A));
    assert.match(res.text, /href="\/login"/);
    assert.doesNotMatch(res.text, /href="\/hq"/);
    assert.doesNotMatch(res.text, /Member portal/i);
  });
});
