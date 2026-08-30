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
const { ensureChurchSettingsInitialized, updateChurchSettings, updateBranchSettings } = require("../src/blessboard/services/blessBoardSettingsService");
const {
  provisionEmptyPublicPages,
  updatePublicPage,
  createPageSection,
  createLeader,
  createMinistry,
  createEvent,
  createSermon,
  createContactChannel,
  createGivingMethod,
} = require("../src/blessboard/services/publicContentAdminService");
const { safeExternalUrl } = require("../src/blessboard/http/tenantPublicSafe");
const { buildTenantPublicSeo } = require("../src/blessboard/http/tenantPublicSeo");
const {
  preparePublicEvents,
  buildPublicContact,
  validCoordinates,
  parseSermonSummary,
  mapSection,
  mapSermon,
  mapGiving,
} = require("../src/blessboard/http/loadTenantPublicPageModel");
const { formatEventParts } = require("../src/blessboard/http/renderTenantPublicPage");

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
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
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
        deploymentCode: "blessboard-org-staging",
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
        deploymentCode: "blessboard-org-staging",
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
      await ensureChurchSettingsInitialized(pool, churchB.id);
      await updateChurchSettings(pool, churchB.id, {
        publicName: "Public Beta Church",
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
      assert.match(res.text, /data-bb-product="blessboard-v5"/);
      assert.match(res.text, /data-bb-shell="tenant-public"/);
      assert.match(res.text, /bb-tp-nav/);
      assert.match(res.text, /bb-tp-footer/);
      assert.match(res.text, /href="\/login"/);
      assert.doesNotMatch(res.text, /href="\/hq(?:\/[^"]*)?"|href="\/branch-admin|href="\/admin(?:\/[^"]*)?"/i);
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
    // Church-wide URL must not mirror primary-branch page content.
    assert.match(res.text, /Church-wide hero/);
    assert.match(res.text, /Church scope copy/);
    assert.doesNotMatch(res.text, /Branch hero/);
    assert.doesNotMatch(res.text, /Branch override copy/);

    const branchRes = await request(app)
      .get(`/branches/${branchA.branch_key || branchA.branchKey || "hq"}`)
      .set("Host", HOST_A);
    // Primary branch remains an explicit branch-scoped website.
    if (branchRes.status === 200) {
      assert.match(branchRes.text, /Branch hero/);
      assert.match(branchRes.text, /Branch override copy/);
    }
  });

  it("soft-fills sermons demo when church has no published sermons", async () => {
    requireDb();
    const res = await request(app).get("/sermons").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-sermons="1"/);
    assert.match(res.text, /Finding Peace in the Noise|Sacred Teachings/);
    assert.doesNotMatch(res.text, /bb-tp-empty|data-bb-empty="sermons"/);
    assert.doesNotMatch(res.text, /lorem ipsum|demo sermon|\[Demo\]/i);
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
    assert.doesNotMatch(res.text, /Contact Pastor|View Profile/i);
    assert.doesNotMatch(res.text, /Meet the team serving/);
    assert.doesNotMatch(res.text, /Pastoral Team|Church Elders|Ministry Leads/i);
  });

  it("leadership preserves sort order and uses initials fallback without placeholder people", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const leadership = pages.pages.find((p) => p.pageKey === "leadership");
    await updatePublicPage(pool, leadership.id, { status: "published" });
    // Clear prior published leaders from earlier tests so order assertions are stable.
    await pool.query(
      `UPDATE blessboard.leaders SET status = 'archived' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    const first = await createLeader(pool, {
      churchId: churchA.id,
      displayName: "Alpha Deacon",
      roleTitle: "Deacon",
      sortOrder: 1,
      status: "published",
    });
    const second = await createLeader(pool, {
      churchId: churchA.id,
      displayName: "Beta Elder",
      roleTitle: "Elder",
      sortOrder: 2,
      status: "published",
    });
    const pastor = await createLeader(pool, {
      churchId: churchA.id,
      displayName: "Zeta Pastor",
      roleTitle: "Senior Pastor",
      sortOrder: 3,
      status: "published",
    });
    assert.equal(first.ok && second.ok && pastor.ok, true);
    const res = await request(app).get("/leadership").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-leadership="1"/);
    assert.match(res.text, /data-bb-stitch-leadership="phase7-v1"/);
    assert.match(res.text, /Our Heart for Service|Leadership/);
    assert.match(res.text, /Zeta Pastor/);
    assert.match(res.text, /bb-tp-avatar|bb-tp-leader-card__media/);
    assert.match(res.text, /bb-tp-featured-leader/);
    assert.match(res.text, /Ministry Leaders|Leadership Team/);
    assert.doesNotMatch(res.text, /Rev\. Dr\. Samuel|placeholder|stock photo/i);
    assert.doesNotMatch(res.text, /Contact Pastor|View Profile/i);
    assert.doesNotMatch(res.text, /Pastoral Team|Church Elders|Community Led|Live Updates/i);
    // Featured is first by sort_order (Alpha), not by role-title inference.
    const featuredBlock = res.text.match(
      /bb-tp-featured-leader[\s\S]*?bb-tp-featured-leader__name[^>]*>([^<]+)/
    );
    assert.ok(featuredBlock);
    assert.equal(featuredBlock[1].trim(), "Alpha Deacon");
    const alphaIdx = res.text.indexOf("Alpha Deacon");
    const betaIdx = res.text.indexOf("Beta Elder");
    const zetaIdx = res.text.indexOf("Zeta Pastor");
    assert.ok(alphaIdx > 0 && betaIdx > alphaIdx && zetaIdx > betaIdx, "leaders keep sort order");
  });

  it("leadership empty CMS still renders sample leaders without fabricated groups", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.leaders SET status = 'archived' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    const res = await request(app).get("/leadership").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-leadership="1"/);
    assert.match(res.text, /Connect with Leadership|data-bb-leadership-featured/);
    assert.doesNotMatch(res.text, /Rev\. Dr\. Samuel|Pastoral Team|Church Elders/i);
    assert.doesNotMatch(res.text, /Community Led|Live Updates|Contact Pastor|View Profile/i);
    assert.doesNotMatch(res.text, /\[Demo\]|demo content/i);
  });

  it("ministries show published only in sort order without fabricated actions", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const ministriesPage = pages.pages.find((p) => p.pageKey === "ministries");
    await updatePublicPage(pool, ministriesPage.id, { status: "published" });
    await pool.query(
      `UPDATE blessboard.ministries SET status = 'archived' WHERE church_id = $1 AND status IN ('published', 'draft')`,
      [churchA.id]
    );
    const draft = await createMinistry(pool, {
      churchId: churchA.id,
      name: "Draft Choir",
      summary: "Hidden draft ministry",
      sortOrder: 1,
      status: "draft",
    });
    const youth = await createMinistry(pool, {
      churchId: churchA.id,
      name: "Youth Ministry",
      summary: "Published youth",
      meetingDay: "Fridays",
      sortOrder: 2,
      status: "published",
    });
    const music = await createMinistry(pool, {
      churchId: churchA.id,
      name: "Music Ministry",
      summary: "Published music",
      sortOrder: 3,
      status: "published",
    });
    assert.equal(draft.ok && youth.ok && music.ok, true, draft.message || music.message);
    const res = await request(app).get("/ministries").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-ministries="1"/);
    assert.match(res.text, /data-bb-stitch-ministries="phase7-v1"/);
    assert.match(res.text, /Our Community Ecosystem|Our Impact|Our Community/);
    assert.match(res.text, /Join a Ministry/);
    assert.match(res.text, /View Events/);
    assert.match(res.text, /Youth Ministry/);
    assert.match(res.text, /Music Ministry/);
    assert.match(res.text, /Fridays/);
    assert.match(res.text, /bb-tp-ministry-card/);
    assert.match(res.text, /bb-tp-ministry-grid--featured/);
    assert.doesNotMatch(res.text, /bb-tp-ministry-card--featured/);
    assert.match(res.text, /Find Your Place in the Mission|Still looking for your place\?/);
    assert.doesNotMatch(res.text, /Draft Choir|Hidden draft ministry/);
    assert.doesNotMatch(res.text, /download|View Schedule|Contact Leader|Learn More|Join Team/i);
    assert.doesNotMatch(res.text, /Explore ministries serving|500\+|Global Missions/);
    assert.doesNotMatch(res.text, /bb-tp-ministry-filter|data-bb-filter=/);
    assert.doesNotMatch(res.text, /Register to Join|Contact Pastoral Team/i);
    assert.doesNotMatch(res.text, />\s*Volunteer\s*</i);
    const youthIdx = res.text.indexOf("Youth Ministry");
    const musicIdx = res.text.indexOf("Music Ministry");
    assert.ok(youthIdx > 0 && musicIdx > youthIdx);

    const emptyHost = await request(app).get("/ministries").set("Host", HOST_B);
    assert.equal(emptyHost.status, 200);
    assert.doesNotMatch(emptyHost.text, /Music Ministry|Published youth|Published music/);
  });

  it("ministries soft-fill demo when no published ministries", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.ministries SET status = 'archived' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    const res = await request(app).get("/ministries").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-ministries="1"/);
    assert.match(res.text, /data-bb-stitch-ministries="phase7-v1"/);
    assert.match(res.text, /Children.?s Ministry|Youth Ministry|Women.?s Fellowship|Community Outreach/);
    assert.doesNotMatch(res.text, /data-bb-empty="ministries"/);
    assert.doesNotMatch(res.text, /\[Demo\]|demo content/i);
    assert.doesNotMatch(res.text, /500\+|Global Missions|Join Team/i);
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

  it("batch 1 home and about use shared shell with active nav and drawer", async () => {
    requireDb();
    const home = await request(app).get("/").set("Host", HOST_A);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-bb-shell="tenant-public"/);
    assert.match(home.text, /data-bb-page="home"/);
    assert.match(home.text, /data-bb-header="1"/);
    assert.match(home.text, /data-bb-footer="1"/);
    assert.match(home.text, /id="bb-tp-drawer"/);
    assert.match(home.text, /id="bb-tp-menu-btn"/);
    assert.match(home.text, /aria-controls="bb-tp-drawer"/);
    assert.match(home.text, /role="dialog"/);
    assert.match(home.text, /aria-modal="true"/);
    assert.match(home.text, /bb-tp-nav__link is-active[^>]*>Home</);
    assert.match(home.text, /Powered by/);
    assert.match(home.text, /GetPro/);
    assert.match(home.text, /data-bb-stitch-home="phase7-v1"/);
    assert.match(home.text, /Plan Your Visit/);
    assert.match(home.text, /href="\/events"/);
    assert.match(home.text, /href="\/giving"/);
    assert.match(home.text, /href="\/ministries"/);
    assert.match(home.text, /data-bb-home-service-times="1"/);
    assert.match(home.text, /Service Times/);
    assert.match(home.text, /Powered by BlessBoard/);
    assert.doesNotMatch(home.text, /1\.2k\+|Active Members|lorem ipsum/i);
    assert.doesNotMatch(home.text, /Need Prayer|Send Prayer Request|Subscribe to our weekly/i);
    assert.doesNotMatch(home.text, /bottom.?nav|bb-tp-fab|data-bb-edit|pencil/i);
    assert.doesNotMatch(home.text, /\[Demo\]/);

    const about = await request(app).get("/about").set("Host", HOST_A);
    assert.equal(about.status, 200);
    assert.match(about.text, /data-bb-page="about"/);
    assert.match(about.text, /bb-tp-nav__link[^>]*is-active[^>]*>About</);
    assert.match(about.text, /data-bb-about="1"|bb-tp-about/);
    assert.match(about.text, /data-bb-stitch-about="phase7-v1"/);
    assert.match(about.text, /Plan Your Visit/);
    assert.match(about.text, /href="\/contact"/);
    assert.doesNotMatch(about.text, /1,200\+|Year Established|Hearts transformed|Watch Our Story/i);
    assert.doesNotMatch(about.text, /Download Annual Report|Community Impact|Active Programs/i);
    assert.doesNotMatch(about.text, /bottom.?nav|bb-tp-fab|data-bb-edit|pencil/i);
    assert.doesNotMatch(about.text, /\[Demo\]/);
  });

  it("about empty CMS still renders sample site without fabricated stats", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.page_sections ps
          SET status = 'draft'
         FROM blessboard.public_pages p
        WHERE ps.page_id = p.id
          AND p.church_id = $1
          AND p.page_key = 'about'`,
      [churchA.id]
    );
    const res = await request(app).get("/about").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-about="1"/);
    assert.match(res.text, /Plan Your Visit/);
    assert.doesNotMatch(res.text, /1,200\+|Year Established|Hearts transformed|Watch Our Story/i);
    assert.doesNotMatch(res.text, /Since our founding|glorify God by making disciples/i);
    assert.doesNotMatch(res.text, /\[Demo\]|demo content/i);
  });

  it("home empty CMS still renders sample site without fabricated metrics", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.public_pages SET status = 'draft'
        WHERE church_id = $1 AND page_key = 'home' AND branch_id IS NOT NULL`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.leaders SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.ministries SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.events SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.sermons SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.page_sections ps
          SET status = 'draft'
         FROM blessboard.public_pages p
        WHERE ps.page_id = p.id
          AND p.church_id = $1
          AND p.page_key = 'home'
          AND ps.status = 'published'`,
      [churchA.id]
    );
    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-home="1"/);
    assert.match(res.text, /Service Times|Plan Your Visit/);
    assert.doesNotMatch(res.text, /\d+\+?\s*(Members|Hearts|Ministries|Active)/i);
    assert.doesNotMatch(res.text, /Need Prayer/);
    assert.doesNotMatch(res.text, /\[Demo\] This Week at Church/);
  });

  it("preparePublicEvents orders upcoming first and omits past", () => {
    const now = Date.parse("2026-07-18T12:00:00.000Z");
    const ordered = preparePublicEvents(
      [
        { title: "Past", startsAt: "2026-07-01T10:00:00.000Z" },
        { title: "Later", startsAt: "2026-08-10T10:00:00.000Z" },
        { title: "Soon", startsAt: "2026-07-20T10:00:00.000Z" },
        { title: "Ongoing", startsAt: "2026-07-17T10:00:00.000Z", endsAt: "2026-07-19T10:00:00.000Z" },
      ],
      now
    );
    assert.deepEqual(
      ordered.map((e) => e.title),
      ["Ongoing", "Soon", "Later"]
    );
  });

  it("formatEventParts is timezone-safe", () => {
    const instant = "2026-01-15T15:00:00.000Z";
    const ny = formatEventParts(instant, "America/New_York");
    const tokyo = formatEventParts(instant, "Asia/Tokyo");
    assert.ok(ny.full);
    assert.ok(tokyo.full);
    assert.notEqual(ny.full, tokyo.full);
    assert.match(ny.day + ny.month, /\d/);
    const ranged = formatEventParts(
      "2026-01-15T15:00:00.000Z",
      "UTC",
      "2026-01-15T17:30:00.000Z"
    );
    assert.match(ranged.timeRange, /–/);
    assert.ok(ranged.timeRange.includes(ranged.time));
  });

  it("events: upcoming order, draft/cancelled/past filtered, safe registration only", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const eventsPage = pages.pages.find((p) => p.pageKey === "events");
    await updatePublicPage(pool, eventsPage.id, { status: "published" });
    await pool.query(
      `UPDATE blessboard.events SET status = 'archived' WHERE church_id = $1 AND status IN ('published', 'draft', 'cancelled')`,
      [churchA.id]
    );

    const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const later = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    const draft = await createEvent(pool, {
      churchId: churchA.id,
      title: "Draft Picnic",
      startsAt: later,
      timezone: "UTC",
      status: "draft",
    });
    const cancelled = await createEvent(pool, {
      churchId: churchA.id,
      title: "Cancelled Retreat",
      startsAt: soon,
      timezone: "UTC",
      status: "cancelled",
    });
    const pastEv = await createEvent(pool, {
      churchId: churchA.id,
      title: "Past Fellowship",
      startsAt: past,
      timezone: "UTC",
      status: "published",
    });
    const second = await createEvent(pool, {
      churchId: churchA.id,
      title: "Later Conference",
      startsAt: later,
      timezone: "UTC",
      registrationUrl: "https://example.org/register-later",
      status: "published",
    });
    const first = await createEvent(pool, {
      churchId: churchA.id,
      title: "Soon Gathering",
      startsAt: soon,
      timezone: "America/New_York",
      status: "published",
    });
    assert.equal(draft.ok && cancelled.ok && pastEv.ok && second.ok && first.ok, true, first.message || draft.message);
    // Bypass admin HTTPS validation to prove render-time safeExternalUrl strips unsafe URLs.
    await pool.query(
      `UPDATE blessboard.events SET registration_url = $1 WHERE church_id = $2 AND title = $3`,
      ["javascript:alert(1)", churchA.id, "Soon Gathering"]
    );

    const res = await request(app).get("/events").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-events="1"/);
    assert.match(res.text, /data-bb-stitch-events="phase7-v1"/);
    assert.match(res.text, /Connect &amp; Grow|Connect & Grow|Community Calendar|Kingdom Gatherings/);
    assert.match(res.text, /bb-tp-featured-event|Soon Gathering/);
    assert.match(res.text, /Soon Gathering/);
    assert.match(res.text, /Later Conference/);
    assert.match(res.text, /Upcoming Events/);
    assert.doesNotMatch(res.text, /Draft Picnic|Cancelled Retreat|Past Fellowship/);
    assert.doesNotMatch(res.text, /javascript:alert|5\+ Events|event count/i);
    assert.doesNotMatch(res.text, /Find a place to grow|View Past Events|All Events|Conferences/);
    assert.doesNotMatch(res.text, /Past Events Archive|Weekly Worship|Cell Groups/);
    assert.doesNotMatch(res.text, /Remind Me|Get Access|Share Event/i);
    assert.doesNotMatch(res.text, /grid_view|Calendar View|data-bb-calendar=/i);
    const soonIdx = res.text.indexOf("Soon Gathering");
    const laterIdx = res.text.indexOf("Later Conference");
    assert.ok(soonIdx > 0 && laterIdx > soonIdx);
    assert.doesNotMatch(res.text, /data-bb-event-register="1"[^>]*javascript:/);
    // Featured (soon) has unsafe registration stripped; later still has safe register link.
    assert.match(res.text, /https:\/\/example\.org\/register-later/);
    assert.match(res.text, /aria-label="Register for Later Conference"/);
    assert.match(res.text, /Contact for Details|Contact Church/);

    const isolated = await request(app).get("/events").set("Host", HOST_B);
    assert.doesNotMatch(isolated.text, /Soon Gathering|Later Conference/);
  });

  it("events soft-fill demo when no upcoming published events", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.events SET status = 'archived' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    const res = await request(app).get("/events").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-events="1"/);
    assert.match(res.text, /data-bb-stitch-events="phase7-v1"/);
    assert.match(res.text, /Leaders Equipping Weekend|Sunday Morning Connection|Neighbourhood Celebration|Fall Festival/);
    assert.doesNotMatch(res.text, /data-bb-empty="events"/);
    assert.doesNotMatch(res.text, /Soon Gathering|Later Conference|Christmas Eve/i);
    assert.doesNotMatch(res.text, /Past Events Archive|Weekly Worship|Cell Groups|View Past Events/i);
    assert.doesNotMatch(res.text, /grid_view|Calendar View|data-bb-calendar=/i);
  });

  it("sermons: published only, safe media/resource links, no embeds or placeholders", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const sermonsPage = pages.pages.find((p) => p.pageKey === "sermons");
    await updatePublicPage(pool, sermonsPage.id, { status: "published" });
    await pool.query(
      `UPDATE blessboard.sermons SET status = 'archived' WHERE church_id = $1 AND status IN ('published', 'draft')`,
      [churchA.id]
    );

    const draft = await createSermon(pool, {
      churchId: churchA.id,
      title: "Draft Message",
      speakerName: "Hidden",
      preachedAt: new Date("2026-01-01T10:00:00.000Z"),
      status: "draft",
    });
    const unsafe = await createSermon(pool, {
      churchId: churchA.id,
      title: "Safe Title Unsafe Links",
      speakerName: "Pastor A",
      preachedAt: new Date("2026-06-01T10:00:00.000Z"),
      status: "published",
    });
    const live = await createSermon(pool, {
      churchId: churchA.id,
      title: "Living Hope",
      speakerName: "Pastor B",
      preachedAt: new Date("2026-07-01T10:00:00.000Z"),
      summary: "Hope that holds.",
      mediaUrl: "https://example.org/watch.mp4",
      resourceUrl: "https://example.org/notes.pdf",
      status: "published",
    });
    const audio = await createSermon(pool, {
      churchId: churchA.id,
      title: "Quiet Faith",
      speakerName: "Pastor C",
      preachedAt: new Date("2026-05-01T10:00:00.000Z"),
      mediaUrl: "https://example.org/message.mp3",
      status: "published",
    });
    assert.equal(
      draft.ok && unsafe.ok && live.ok && audio.ok,
      true,
      live.message || unsafe.message || audio.message
    );
    await pool.query(
      `UPDATE blessboard.sermons
          SET media_url = $1, resource_url = $2
        WHERE church_id = $3 AND title = $4`,
      ["javascript:alert(1)", "data:text/html,hi", churchA.id, "Safe Title Unsafe Links"]
    );

    const res = await request(app).get("/sermons").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-sermons="1"/);
    assert.match(res.text, /data-bb-stitch-sermons="phase7-v1"/);
    assert.match(res.text, /aria-label="Sermons"|Spiritual Nourishment|Teaching Library/);
    assert.match(res.text, /Spiritual Nourishment|Teaching Library/);
    assert.match(res.text, /bb-tp-featured-sermon/);
    assert.match(res.text, /Featured Sermon|Latest Release/);
    assert.match(res.text, /Recent Sermons/);
    assert.match(res.text, /Living Hope/);
    assert.match(res.text, /Safe Title Unsafe Links/);
    assert.match(res.text, /Quiet Faith/);
    assert.match(res.text, /Pastor B/);
    assert.match(res.text, /Hope that holds/);
    assert.doesNotMatch(res.text, /Draft Message/);
    // Featured is newest by preached_at DESC
    const livingIdx = res.text.indexOf("Living Hope");
    const quietIdx = res.text.indexOf("Quiet Faith");
    const unsafeIdx = res.text.indexOf("Safe Title Unsafe Links");
    assert.ok(livingIdx > 0 && livingIdx < quietIdx && livingIdx < unsafeIdx);
    assert.match(res.text, /https:\/\/example\.org\/watch\.mp4/);
    assert.match(res.text, /https:\/\/example\.org\/notes\.pdf/);
    assert.match(res.text, /https:\/\/example\.org\/message\.mp3/);
    assert.match(res.text, /aria-label="Watch sermon: Living Hope"/);
    assert.match(res.text, /aria-label="Listen to sermon: Quiet Faith"/);
    assert.match(res.text, /aria-label="Download notes for sermon: Living Hope"/);
    assert.match(res.text, /data-bb-resource-kind="download"/);
    assert.doesNotMatch(res.text, /javascript:alert|data:text\/html|<iframe|youtube\.com\/embed/i);
    assert.doesNotMatch(
      res.text,
      /demo sermon|placeholder|The Book of Acts Series|Notify Me|View Past Series|All Messages|View Archive|SERIES:|Ephesians 2:1-10|42:15/i
    );
    assert.doesNotMatch(res.text, /All Speakers|search sermons|data-bb-sermon-filter=/i);

    const isolated = await request(app).get("/sermons").set("Host", HOST_B);
    assert.doesNotMatch(isolated.text, /Living Hope|Safe Title Unsafe Links|Quiet Faith/);
  });

  it("sermons soft-fill demo when no published sermons", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const sermonsPage = pages.pages.find((p) => p.pageKey === "sermons");
    await updatePublicPage(pool, sermonsPage.id, { status: "published" });
    await pool.query(
      `UPDATE blessboard.sermons SET status = 'archived' WHERE church_id = $1 AND status IN ('published', 'draft')`,
      [churchA.id]
    );
    const res = await request(app).get("/sermons").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-sermons="1"/);
    assert.match(res.text, /data-bb-stitch-sermons="phase7-v1"/);
    assert.match(res.text, /Finding Peace in the Noise|The Sanctity of Attention/);
    assert.doesNotMatch(res.text, /data-bb-empty="sermons"/);
    assert.doesNotMatch(res.text, /Notify Me|Coming Soon|The Book of Acts Series|View Past Series|All Messages/i);
  });

  it("buildPublicContact prefers branch settings and maps only with valid coordinates", () => {
    const church = {
      primaryEmail: "church@example.org",
      primaryPhone: "+260111111111",
    };
    const branch = {
      email: "branch@example.org",
      phone: "+260222222222",
      addressLine1: "12 Faith Lane",
      city: "Kafue",
      provinceState: "Lusaka",
      postalCode: "10101",
      latitude: -15.769,
      longitude: 28.181,
    };
    const contact = buildPublicContact(church, branch);
    assert.equal(contact.email, "branch@example.org");
    assert.equal(contact.phone, "+260222222222");
    assert.match(contact.addressText, /12 Faith Lane/);
    assert.match(contact.addressText, /Kafue/);
    assert.equal(contact.hasMap, true);
    assert.match(contact.mapEmbedUrl, /openstreetmap\.org\/export\/embed/);
    assert.match(contact.directionsUrl, /openstreetmap\.org/);

    const churchFirst = buildPublicContact(church, branch, { preferChurch: true });
    assert.equal(churchFirst.email, "church@example.org");
    assert.equal(churchFirst.phone, "+260111111111");
    assert.match(churchFirst.addressText, /12 Faith Lane/);

    const churchOnly = buildPublicContact(church, null);
    assert.equal(churchOnly.email, "church@example.org");
    assert.equal(churchOnly.phone, "+260111111111");
    assert.equal(churchOnly.addressText, "");
    assert.equal(churchOnly.hasMap, false);

    assert.equal(validCoordinates(null, 28), null);
    assert.equal(validCoordinates(-15, null), null);
    assert.equal(validCoordinates(999, 28), null);
    assert.equal(validCoordinates(-15.7, 28.1).latitude, -15.7);
  });

  it("contact: branch/church settings hierarchy, published channels, map rules, no form", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const contactPage = pages.pages.find((p) => p.pageKey === "contact");
    await updatePublicPage(pool, contactPage.id, { status: "published" });

    const churchUp = await updateChurchSettings(pool, churchA.id, {
      publicName: CHURCH_A,
      primaryEmail: "church-office@example.org",
      primaryPhone: "+260900000001",
      websiteStatus: "published",
    });
    assert.equal(churchUp.ok, true, churchUp.reason || churchUp.status);

    // Without branch address/phone/email override — church fallbacks + no fabricated address/map.
    let res = await request(app).get("/contact").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-shell="tenant-public"/);
    assert.match(res.text, /data-bb-contact="1"/);
    assert.match(res.text, /data-bb-stitch-contact="phase7-v1"/);
    assert.match(res.text, /aria-label="Contact"|Get In Touch/);
    assert.match(res.text, /Get In Touch|Connect With Us|Contact Us/);
    assert.match(res.text, /data-bb-header="1"/);
    assert.match(res.text, /data-bb-footer="1"/);
    assert.match(res.text, /(?:bb-tp-nav__link|bb-tp-nav-dropdown__link)[^>]*is-active[^>]*>Contact</);
    assert.match(res.text, /church-office@example\.org|\+260900000001/);
    assert.match(res.text, /mailto:church-office@example\.org|tel:\+?260900000001/);
    assert.match(res.text, /data-bb-contact-message="unavailable"/);
    assert.match(res.text, /data-bb-contact-(?:form|message)="unavailable"/);
    assert.doesNotMatch(res.text, /data-bb-contact-map=/);
    assert.doesNotMatch(res.text, /123 Faith Lane|<form/i);
    assert.doesNotMatch(res.text, /name="message"|name="full_name"|newsletter|mailing list|Stay Connected With/i);
    assert.doesNotMatch(res.text, /name="_csrf"|csrfField|Prayer Request/i);

    const branchUp = await updateBranchSettings(pool, branchA.id, {
      publicName: BRANCH_A,
      email: "hq-branch@example.org",
      phone: "+260900000099",
      addressLine1: "12 Faith Lane",
      city: "Kafue",
      provinceState: "Lusaka",
      postalCode: "10101",
      latitude: -15.7694,
      longitude: 28.1812,
    });
    assert.equal(branchUp.ok, true, branchUp.reason || branchUp.status);

    const draftChannel = await createContactChannel(pool, {
      churchId: churchA.id,
      channelType: "email",
      label: "Draft Inbox",
      value: "draft-only@example.org",
      status: "draft",
    });
    const liveChannel = await createContactChannel(pool, {
      churchId: churchA.id,
      channelType: "url",
      label: "WhatsApp Line",
      value: "https://example.org/wa",
      status: "published",
    });
    assert.equal(draftChannel.ok && liveChannel.ok, true, liveChannel.reason || draftChannel.reason);

    res = await request(app).get("/contact").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /WhatsApp Line/);
    assert.match(res.text, /https:\/\/example\.org\/wa/);
    assert.doesNotMatch(res.text, /Draft Inbox|draft-only@example\.org/);
    // Church-wide contact prefers church email/phone; address/map may fall back to primary branch.
    assert.match(res.text, /church-office@example\.org/);
    assert.match(res.text, /\+260900000001/);
    assert.match(res.text, /12 Faith Lane/);
    assert.match(res.text, /data-bb-contact-map="1"/);
    assert.match(res.text, /openstreetmap\.org\/export\/embed/);
    assert.match(res.text, /Get Directions/);
    assert.match(res.text, /aria-label="Email church-office@example\.org"/);
    assert.match(res.text, /aria-label="Call \+260900000001"/);
    assert.doesNotMatch(res.text, /hq-branch@example\.org/);
    assert.doesNotMatch(res.text, /\+260900000099/);
    assert.match(res.text, /bb-tp-contact-main/);
    assert.match(res.text, /Send a Message/);
    assert.doesNotMatch(res.text, /<form|name="full_name"|name="message"|name="_csrf"|csrfField/i);
    assert.doesNotMatch(res.text, /within 24 hours|office hours for immediate|Stay Connected With/i);

    // Clear coordinates — map must not render without a valid pair; address still shown.
    await pool.query(
      `UPDATE blessboard.branch_settings SET latitude = NULL, longitude = NULL WHERE branch_id = $1`,
      [branchA.id]
    );
    res = await request(app).get("/contact").set("Host", HOST_A);
    assert.doesNotMatch(res.text, /data-bb-contact-map="1"/);
    assert.doesNotMatch(res.text, /openstreetmap\.org\/export\/embed/);
    assert.match(res.text, /data-bb-contact-map="unavailable"/);
    assert.match(res.text, /12 Faith Lane/);

    const isolated = await request(app).get("/contact").set("Host", HOST_B);
    assert.equal(isolated.status, 200);
    assert.doesNotMatch(isolated.text, /WhatsApp Line|hq-branch@example\.org|12 Faith Lane/);
  });

  it("giving: published methods only, safe links, no payment UI, disclaimer + shell", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const givingPage = pages.pages.find((p) => p.pageKey === "giving");
    await updatePublicPage(pool, givingPage.id, { status: "published" });

    const emptyRes = await request(app).get("/giving").set("Host", HOST_B);
    assert.equal(emptyRes.status, 200);
    assert.match(emptyRes.text, /data-bb-shell="tenant-public"/);
    assert.match(emptyRes.text, /data-bb-giving="1"/);
    assert.match(emptyRes.text, /data-bb-stitch-giving="phase7-v1"/);
    assert.match(emptyRes.text, /aria-label="Giving"|A Culture of Generosity/);
    assert.match(emptyRes.text, /Bank Transfer|Mobile Money|In-Person Offering/);
    assert.doesNotMatch(emptyRes.text, /data-bb-empty="giving"/);
    assert.match(emptyRes.text, /does not process payments/i);
    assert.doesNotMatch(emptyRes.text, /<form|card number|cvv|account number|Give Online|Donate Now/i);
    assert.doesNotMatch(emptyRes.text, /\bamount\b|\bcvv\b/i);
    assert.doesNotMatch(emptyRes.text, /Standard Chartered|Airtel Money|1\.2k Families|Your Recent Contributions|Scan to Give|Merchant ID/i);

    const draft = await createGivingMethod(pool, {
      churchId: churchA.id,
      methodType: "bank_transfer",
      label: "Draft Bank",
      instructions: "Hidden draft account",
      status: "draft",
    });
    const live = await createGivingMethod(pool, {
      churchId: churchA.id,
      methodType: "online",
      label: "Online Giving",
      instructions: "Use the church giving portal.",
      externalUrl: "https://example.org/give",
      status: "published",
    });
    const noLink = await createGivingMethod(pool, {
      churchId: churchA.id,
      methodType: "cash",
      label: "Sunday Offering",
      instructions: "Place gifts in the offering during service.",
      status: "published",
    });
    assert.equal(draft.ok && live.ok && noLink.ok, true, live.reason || draft.reason);

    // Bypass admin HTTPS validation to prove render-time stripping.
    await pool.query(
      `UPDATE blessboard.giving_methods
          SET external_url = $1
        WHERE church_id = $2 AND label = $3`,
      ["javascript:alert(1)", churchA.id, "Sunday Offering"]
    );

    const res = await request(app).get("/giving").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-giving="1"/);
    assert.match(res.text, /data-bb-header="1"/);
    assert.match(res.text, /data-bb-footer="1"/);
    assert.match(res.text, /data-bb-nav-link="giving"[^>]*class="[^"]*is-active|class="[^"]*is-active[^"]*"[^>]*data-bb-nav-link="giving"|bb-tp-header__visit[^>]*is-active[^>]*>Give</);
    assert.match(res.text, /A Culture of Generosity|Faithful Stewardship|Giving/);
    assert.match(res.text, /Ways to Give/);
    assert.match(res.text, /Explore Ways to Give/);
    assert.match(res.text, /Online Giving/);
    assert.match(res.text, /Sunday Offering/);
    assert.match(res.text, /External link|In person/);
    assert.match(res.text, /https:\/\/example\.org\/give/);
    assert.match(res.text, /data-bb-giving-link="1"/);
    assert.match(res.text, /data-bb-giving-notice="1"/);
    assert.match(res.text, /data-bb-giving-instructions="1"/);
    assert.match(res.text, /data-bb-giving-why="1"|Why We Give/);
    assert.match(res.text, /data-bb-giving-accountability="1"/);
    assert.match(res.text, /Instructions/);
    assert.match(res.text, /Open published link/);
    // Sunday Offering has instructions but no usable URL — do not swap in generic CTA copy.
    assert.doesNotMatch(res.text, /Contact for details/);
    assert.match(res.text, /data-bb-giving-scope-label="1"/);
    assert.match(res.text, /Church-wide|This branch/);
    assert.match(res.text, /data-bb-giving-disclaimer="1"/);
    assert.match(res.text, /option(?:s)? available/i);
    assert.doesNotMatch(res.text, /data-bb-giving-editor=/);
    assert.doesNotMatch(res.text, /data-bb-giving-card-edit=/);
    assert.doesNotMatch(res.text, /data-bb-copy-ref=/);

    const bankDetailed = await createGivingMethod(pool, {
      churchId: churchA.id,
      methodType: "bank_transfer",
      label: "Zanaco Transfer",
      description: "Direct deposit to the church operations account.",
      accountDetails: "Account Name: Demo Church\nAccount Number: 582100004567890",
      instructions: "Include your name in the transfer memo.",
      qrImageUrl: "/church/images/giving/giving-qr-demo.png",
      buttonLabel: "",
      status: "published",
    });
    assert.equal(bankDetailed.ok, true, bankDetailed.reason);
    const detailed = await request(app).get("/giving").set("Host", HOST_A);
    assert.equal(detailed.status, 200);
    assert.match(detailed.text, /Zanaco Transfer/);
    assert.match(detailed.text, /data-bb-giving-account="1"/);
    assert.match(detailed.text, /Account Name/);
    assert.match(detailed.text, /582100004567890/);
    assert.match(detailed.text, /data-bb-copy-ref="1"/);
    assert.match(detailed.text, /data-bb-giving-qr="1"/);
    assert.match(detailed.text, /alt="QR code for Zanaco Transfer"/);
    assert.match(detailed.text, /Direct deposit to the church operations account/);
    assert.doesNotMatch(detailed.text, /data-bb-giving-editor=/);
    // Long refs must remain selectable / wrappable — no fixed card height lock-in.
    assert.match(detailed.text, /bb-tp-giving-card__ref-text/);

    assert.doesNotMatch(res.text, /Draft Bank|Hidden draft account/);
    assert.doesNotMatch(res.text, /javascript:alert/);
    assert.doesNotMatch(res.text, /<form|card number|cvv|iban|account number|donate now amount|Give Online|Donate Now/i);
    assert.doesNotMatch(res.text, /\bamount\b/i);
    assert.doesNotMatch(res.text, /csrf|_csrf|payment gateway|process your donation|QR|Merchant ID|Current Impact/i);
    assert.match(res.text, /does not process payments|does not collect payment|financial account/i);

    const isolated = await request(app).get("/giving").set("Host", HOST_B);
    assert.doesNotMatch(isolated.text, /Online Giving|Sunday Offering/);
  });

  it("parseSermonSummary extracts category prefix without inventing labels", () => {
    assert.deepEqual(parseSermonSummary("Category: Teaching. A short note."), {
      category: "Teaching",
      summary: "A short note.",
      scripture: null,
    });
    assert.deepEqual(parseSermonSummary("Plain summary only"), {
      category: null,
      summary: "Plain summary only",
      scripture: null,
    });
    assert.deepEqual(parseSermonSummary(""), { category: null, summary: null, scripture: null });
    assert.deepEqual(
      parseSermonSummary("Category: Peace. Rest in Christ. Scripture: Philippians 4:6-7"),
      {
        category: "Peace",
        summary: "Rest in Christ.",
        scripture: "Philippians 4:6-7",
      }
    );
    const mapped = mapSermon({
      title: "Demo",
      speakerName: "A",
      preachedAt: null,
      summary: "Category: Prayer. Habits of prayer.",
      mediaUrl: null,
      resourceUrl: null,
    });
    assert.equal(mapped.category, "Prayer");
    assert.equal(mapped.summary, "Habits of prayer.");
    assert.equal(mapped.scripture, null);
  });

  it("mapSection preserves sanitized service_times layout metadata", () => {
    const mapped = mapSection({
      sectionKey: "service_times",
      sectionType: "service_times",
      heading: "Service Times",
      bodyText: null,
      mediaUrl: null,
      sortOrder: 1,
      layoutMetadata: {
        schema: "service_times_v1",
        entries: [
          {
            id: "sun",
            name: "Sunday Worship",
            day: "sunday",
            startTime: "10:00",
            endTime: "11:30",
            location: "Sanctuary",
            enabled: true,
            sortOrder: 1,
          },
          { name: "Hidden", enabled: false, startTime: "09:00" },
        ],
        script: "<script>evil()</script>",
      },
    });
    assert.equal(mapped.layoutMetadata.schema, "service_times_v1");
    assert.equal(mapped.layoutMetadata.entries.length, 2);
    assert.equal(mapped.layoutMetadata.entries[0].name, "Sunday Worship");
    assert.equal(mapped.layoutMetadata.script, undefined);
  });

  it("home renders live teasers, service times, announcement, and CTAs without fake counts", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.leaders SET status = 'archived' WHERE church_id = $1 AND status IN ('published', 'draft')`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.ministries SET status = 'archived' WHERE church_id = $1 AND status IN ('published', 'draft')`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.events SET status = 'archived' WHERE church_id = $1 AND status IN ('published', 'draft')`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.sermons SET status = 'archived' WHERE church_id = $1 AND status IN ('published', 'draft')`,
      [churchA.id]
    );

    // Church-wide home fixtures (do not put content on primary branch and expect it on /).
    const churchPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
    });
    const home = churchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, home.id, { status: "published", title: "Home" });
    await pool.query(`UPDATE blessboard.page_sections SET status = 'draft' WHERE page_id = $1`, [
      home.id,
    ]);

    async function upsertSection(fields) {
      await pool.query(
        `INSERT INTO blessboard.page_sections
           (page_id, section_key, section_type, heading, body_text, sort_order, status, layout_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, 'published', $7::jsonb)
         ON CONFLICT (page_id, section_key) DO UPDATE
           SET section_type = EXCLUDED.section_type,
               heading = EXCLUDED.heading,
               body_text = EXCLUDED.body_text,
               sort_order = EXCLUDED.sort_order,
               status = 'published',
               layout_metadata = EXCLUDED.layout_metadata`,
        [
          home.id,
          fields.key,
          fields.type,
          fields.heading,
          fields.body,
          fields.sort || 1,
          fields.meta ? JSON.stringify(fields.meta) : null,
        ]
      );
    }

    await upsertSection({
      key: "hero",
      type: "hero",
      heading: "Gather With Courage And Hope",
      body: "Published home hero copy",
      sort: 1,
    });
    await upsertSection({
      key: "welcome",
      type: "body",
      heading: "Welcome",
      body: "A short welcome for visitors.",
      sort: 20,
    });
    await upsertSection({
      key: "announcement_highlight",
      type: "announcement",
      heading: "This Week Spotlight",
      body: "Community meal after the morning service.",
      sort: 15,
    });
    await upsertSection({
      key: "service_times",
      type: "service_times",
      heading: "Service Times",
      body: null,
      sort: 10,
      meta: {
        schema: "service_times_v1",
        entries: [
          {
            id: "sun",
            name: "Sunday Worship",
            day: "sunday",
            startTime: "10:00",
            endTime: "11:30",
            location: "Main sanctuary",
            enabled: true,
            sortOrder: 1,
          },
        ],
      },
    });

    assert.equal(
      (
        await createLeader(pool, {
          churchId: churchA.id,
          displayName: "Home Teaser Pastor",
          roleTitle: "Pastor",
          biography: "Short bio for home teaser.",
          status: "published",
        })
      ).ok,
      true
    );
    assert.equal(
      (
        await createLeader(pool, {
          churchId: churchA.id,
          displayName: "Draft Home Leader",
          roleTitle: "Elder",
          status: "draft",
        })
      ).ok,
      true
    );
    assert.equal(
      (
        await createMinistry(pool, {
          churchId: churchA.id,
          name: "Home Teaser Youth",
          summary: "Youth teaser summary",
          status: "published",
        })
      ).ok,
      true
    );
    const soon = new Date(Date.now() + 7 * 86400000).toISOString();
    assert.equal(
      (
        await createEvent(pool, {
          churchId: churchA.id,
          title: "Home Teaser Event",
          summary: "Upcoming teaser event",
          startsAt: soon,
          timezone: "UTC",
          status: "published",
        })
      ).ok,
      true
    );
    assert.equal(
      (
        await createSermon(pool, {
          churchId: churchA.id,
          title: "Home Teaser Sermon",
          speakerName: "Home Teaser Pastor",
          summary: "Category: Teaching. Latest message summary.",
          preachedAt: new Date().toISOString(),
          status: "published",
        })
      ).ok,
      true
    );

    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-home="1"/);
    assert.match(res.text, /data-bb-home-service-times="1"/);
    assert.match(res.text, /Sunday Worship/);
    assert.match(res.text, /Main sanctuary/);
    assert.match(res.text, /This Week Spotlight|Welcome Home|data-bb-home-welcome="1"/);
    assert.match(res.text, /data-bb-home-welcome="1"/);
    assert.match(res.text, /A short welcome for visitors/);
    assert.match(res.text, /data-bb-home-ministries="1"/);
    assert.match(res.text, /Home Teaser Youth/);
    assert.match(res.text, /data-bb-home-leadership="1"/);
    assert.match(res.text, /Home Teaser Pastor/);
    assert.doesNotMatch(res.text, /Draft Home Leader/);
    assert.match(res.text, /data-bb-home-events="1"/);
    assert.match(res.text, /Home Teaser Event/);
    assert.match(res.text, /data-bb-home-sermons="1"/);
    assert.match(res.text, /Home Teaser Sermon/);
    assert.match(res.text, /Teaching/);
    assert.match(res.text, /Give Now|data-bb-cta-band/);
    assert.match(res.text, /Get in Touch|data-bb-home-contact/);
    assert.match(res.text, /Plan Your Visit/);
    assert.match(res.text, /bb-tp-hero--phase7|data-bb-home-hero="1"/);
    assert.doesNotMatch(res.text, /data-bb-inline-edit/);
    assert.doesNotMatch(res.text, /website-inline-edit\.js|website-structured-edit\.js/);
    const orderKeys = [
      "data-bb-home-hero=",
      "data-bb-home-service-times=",
      "data-bb-home-welcome=",
      "data-bb-home-ministries=",
      "data-bb-home-events=",
      "data-bb-home-sermons=",
      "data-bb-home-leadership=",
      "data-bb-cta-band=",
      "data-bb-home-contact=",
    ];
    let lastIdx = -1;
    for (const key of orderKeys) {
      const idx = res.text.indexOf(key);
      assert.ok(idx > lastIdx, `home section order: ${key}`);
      lastIdx = idx;
    }
    // Welcome + about both populated would duplicate intro; about should stay off.
    assert.doesNotMatch(res.text, /data-bb-home-about="1"/);
    assert.doesNotMatch(res.text, /data-bb-preview-banner/);
    assert.doesNotMatch(res.text, /1\.2k\+|Active Members|\d+\+\s*Ministries/i);
  });

  it("PHASE2_086 home: empty teasers collapse; blank sections omitted; demo soft-fill when CMS empty", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.leaders SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.ministries SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.events SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.sermons SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    const churchPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
    });
    const home = churchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, home.id, { status: "published" });
    await pool.query(
      `UPDATE blessboard.page_sections SET status = 'draft' WHERE page_id = $1 AND status = 'published'`,
      [home.id]
    );
    await pool.query(
      `DELETE FROM blessboard.page_sections WHERE page_id = $1 AND section_key IN ('service_times', 'blank_block', 'hero')`,
      [home.id]
    );
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, sort_order, status, layout_metadata)
       VALUES ($1, 'service_times', 'service_times', 'Service Times', NULL, 10, 'published', $2::jsonb)`,
      [
        home.id,
        JSON.stringify({
          schema: "service_times_v1",
          entries: [
            {
              id: "soft-sun",
              name: "Soft Fill Sunday",
              day: "sunday",
              startTime: "10:00",
              endTime: "11:00",
              location: "Demo hall",
              enabled: true,
              sortOrder: 1,
            },
          ],
        }),
      ]
    );
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, sort_order, status)
       VALUES ($1, 'blank_block', 'body', NULL, NULL, 99, 'published')`,
      [home.id]
    );
    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /data-section="blank_block"/);
    assert.doesNotMatch(res.text, /data-bb-empty="home"/);
    assert.match(res.text, /data-bb-home-hero="1"/);
    assert.match(res.text, /data-bb-home-service-times="1"/);
    assert.match(res.text, /Soft Fill Sunday/);
    assert.match(res.text, /data-bb-home-leadership="1"|data-bb-home-ministries="1"/);
    assert.match(res.text, /Plan Your Visit|Give Now/);
    assert.doesNotMatch(res.text, /\[Demo\] This Week at Church/);
    assert.doesNotMatch(res.text, /1\.2k\+|Active Members/i);
  });

  it("PHASE2_086 home: escapes section copy; CMS wins over demo fallback", async () => {
    requireDb();
    const churchPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
    });
    const home = churchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, home.id, { status: "published" });
    await pool.query(`DELETE FROM blessboard.page_sections WHERE page_id = $1`, [home.id]);
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, sort_order, status)
       VALUES ($1, 'hero', 'hero', $2, $3, 1, 'published')`,
      [
        home.id,
        'Safe <script>alert(1)</script> & "Hero"',
        "Body with <b>tags</b> & quotes",
      ]
    );
    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /Safe &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
    assert.match(res.text, /Body with &lt;b&gt;tags&lt;\/b&gt;/);
    assert.doesNotMatch(res.text, /Spiritual Growth/);
  });

  it("PHASE2_086 home: mobile structure classes and landscape hero CSS", async () => {
    requireDb();
    const css = fs.readFileSync(
      path.join(__dirname, "../public/blessboard/v5/tenant-public.css"),
      "utf8"
    );
    assert.match(css, /\.bb-tp-hero--phase7/);
    assert.match(css, /\.bb-tp-service-times--band/);
    assert.match(css, /\.bb-tp-card-grid/);

    const branchPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
    });
    const home = branchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, home.id, { status: "published" });
    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /bb-tp-hero--phase7/);
    assert.match(res.text, /Plan Your Visit/);
    assert.match(res.text, /data-bb-stitch-home="phase7-v1"/);
  });

  it("PHASE2_086 home: draft sections stay off public; preview shares home markers", async () => {
    requireDb();
    const churchPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
    });
    const home = churchPages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, home.id, { status: "published" });
    await pool.query(`DELETE FROM blessboard.page_sections WHERE page_id = $1`, [home.id]);
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, sort_order, status)
       VALUES
         ($1, 'hero', 'hero', 'Public Hero Only', 'Public body', 1, 'published'),
         ($1, 'draft_welcome', 'body', 'Draft Welcome Hidden', 'Should not show publicly', 20, 'draft')`,
      [home.id]
    );

    const pub = await request(app).get("/").set("Host", HOST_A);
    assert.equal(pub.status, 200);
    assert.match(pub.text, /Public Hero Only/);
    assert.doesNotMatch(pub.text, /Draft Welcome Hidden/);
    assert.doesNotMatch(pub.text, /data-bb-preview-banner/);

    const homeTpl = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/public/home.ejs"),
      "utf8"
    );
    const routes = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/http/contentAdminRoutes.js"),
      "utf8"
    );
    assert.match(homeTpl, /data-bb-stitch-home="phase7-v1"/);
    assert.match(homeTpl, /homeDemoFallback/);
    assert.match(routes, /preview:\s*true/);
    assert.match(routes, /renderTenantPublicPage/);
  });

  it("about shows mission vision values and service information from stored content", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const about = pages.pages.find((p) => p.pageKey === "about");
    await updatePublicPage(pool, about.id, { status: "published" });
    await pool.query(`UPDATE blessboard.page_sections SET status = 'draft' WHERE page_id = $1`, [
      about.id,
    ]);

    async function upsertAbout(fields) {
      await pool.query(
        `INSERT INTO blessboard.page_sections
           (page_id, section_key, section_type, heading, body_text, sort_order, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'published')
         ON CONFLICT (page_id, section_key) DO UPDATE
           SET section_type = EXCLUDED.section_type,
               heading = EXCLUDED.heading,
               body_text = EXCLUDED.body_text,
               sort_order = EXCLUDED.sort_order,
               status = 'published'`,
        [about.id, fields.key, fields.type, fields.heading, fields.body, fields.sort || 1]
      );
    }

    await upsertAbout({
      key: "about_hero",
      type: "hero",
      heading: "About Our Church Family",
      body: "Hero for about parity.",
      sort: 1,
    });
    await upsertAbout({
      key: "mission",
      type: "mission",
      heading: "Our Mission",
      body: "Mission body published.",
      sort: 20,
    });
    await upsertAbout({
      key: "vision",
      type: "vision",
      heading: "Our Vision",
      body: "Vision body published.",
      sort: 30,
    });
    await upsertAbout({
      key: "values",
      type: "values",
      heading: "Our Values",
      body: "Values body published.",
      sort: 40,
    });
    await upsertAbout({
      key: "story",
      type: "story",
      heading: "Our Story",
      body: "Story body published.",
      sort: 50,
    });

    await pool.query(
      `UPDATE blessboard.branch_settings
          SET address_line_1 = $2,
              city = $3,
              phone = $4
        WHERE branch_id = $1`,
      [branchA.id, "12 Parity Lane", "Demo City", "+15550100"]
    );

    const res = await request(app).get("/about").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /Our Mission/);
    assert.match(res.text, /Mission body published/);
    assert.match(res.text, /Our Vision/);
    assert.match(res.text, /Our Values/);
    assert.match(res.text, /Our Story/);
    assert.match(res.text, /Story body published/);
    assert.match(res.text, /data-bb-about-join="1"|Plan Your Visit/);
    assert.match(res.text, /12 Parity Lane|Demo City/);
    assert.match(res.text, /bb-tp-about-hero|data-bb-about-hero/);
    assert.doesNotMatch(res.text, /1,200\+|Year Established/i);
  });

  it("PHASE2_087 about: section markers, blank collapse, escape, no fabricated stats", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.public_pages SET status = 'draft'
        WHERE church_id = $1 AND page_key = 'about' AND branch_id IS NOT NULL`,
      [churchA.id]
    );
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const about = pages.pages.find((p) => p.pageKey === "about");
    await updatePublicPage(pool, about.id, { status: "published" });
    await pool.query(`DELETE FROM blessboard.page_sections WHERE page_id = $1`, [about.id]);
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, sort_order, status)
       VALUES
         ($1, 'about_hero', 'hero', $2, $3, 1, 'published'),
         ($1, 'story', 'story', 'Our Story', 'Story body for parity.', 10, 'published'),
         ($1, 'mission', 'mission', 'Our Mission', 'Mission published.', 20, 'published'),
         ($1, 'vision', 'vision', 'Our Vision', 'Vision published.', 30, 'published'),
         ($1, 'values', 'values', 'Our Values', 'Values published.', 40, 'published'),
         ($1, 'blank_about', 'body', NULL, NULL, 99, 'published')`,
      [about.id, 'Safe <b>About</b> & Church', 'Lead with <em>care</em>']
    );
    const res = await request(app).get("/about").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-about-hero="1"/);
    assert.match(res.text, /data-bb-about-story="1"/);
    assert.match(res.text, /data-bb-about-purpose="1"/);
    assert.match(res.text, /data-bb-about-mission="1"/);
    assert.match(res.text, /data-bb-about-vision="1"/);
    assert.match(res.text, /data-bb-about-values="1"/);
    assert.match(res.text, /data-bb-about-join="1"/);
    assert.doesNotMatch(res.text, /data-section="blank_about"/);
    assert.match(res.text, /Safe &lt;b&gt;About&lt;\/b&gt;/);
    assert.doesNotMatch(res.text, /<b>About<\/b>/);
    assert.doesNotMatch(res.text, /1,200\+|Year Established|Download Annual Report|Community Impact/i);
    assert.doesNotMatch(res.text, /Watch Our Story/i);
    const order = [
      "data-bb-about-hero=",
      "data-bb-about-story=",
      "data-bb-about-purpose=",
      "data-bb-about-values=",
      "data-bb-about-join=",
    ];
    let last = -1;
    for (const key of order) {
      const idx = res.text.indexOf(key);
      assert.ok(idx > last, `about order ${key}`);
      last = idx;
    }
  });

  it("PHASE2_087 leadership: featured grid, initials, CTA, escape, empty SoT", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.leaders SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const leadership = pages.pages.find((p) => p.pageKey === "leadership");
    await updatePublicPage(pool, leadership.id, { status: "published" });
    await pool.query(`DELETE FROM blessboard.page_sections WHERE page_id = $1`, [leadership.id]);
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, sort_order, status)
       VALUES ($1, 'intro', 'hero', $2, $3, 1, 'published')`,
      [
        leadership.id,
        'Meet <script>x</script> Leaders',
        'Intro with <b>tags</b>',
      ]
    );
    const a = await createLeader(pool, {
      churchId: churchA.id,
      displayName: "Ada Featured",
      roleTitle: "Senior Pastor",
      biography: "Featured bio for Stitch leadership card.",
      sortOrder: 1,
      status: "published",
    });
    const b = await createLeader(pool, {
      churchId: churchA.id,
      displayName: "Bea Grid",
      roleTitle: "Elder",
      biography: "Grid bio snippet for mobile cards.",
      sortOrder: 2,
      status: "published",
    });
    assert.equal(a.ok && b.ok, true);
    const res = await request(app).get("/leadership").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-leadership-hero="1"/);
    assert.match(res.text, /data-bb-leadership-featured="1"/);
    assert.match(res.text, /data-bb-leadership-grid="1"/);
    assert.match(res.text, /data-bb-leadership-cta="1"/);
    assert.match(res.text, /Ministry Leaders/);
    assert.match(res.text, /Ministry Leads/);
    assert.match(res.text, /Join a Ministry/);
    assert.match(res.text, /bb-tp-avatar|Ada Featured/);
    assert.match(res.text, /Meet &lt;script&gt;x&lt;\/script&gt; Leaders/);
    assert.doesNotMatch(res.text, /<script>x<\/script>/);
    assert.doesNotMatch(res.text, /Contact Pastor|View Profile|Pastoral Team|Church Elders/i);
    assert.doesNotMatch(res.text, /data-bb-preview-banner/);

    await pool.query(
      `UPDATE blessboard.leaders SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(`DELETE FROM blessboard.page_sections WHERE page_id = $1`, [leadership.id]);
    const empty = await request(app).get("/leadership").set("Host", HOST_A);
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-bb-leadership="1"/);
    assert.match(empty.text, /Connect with Leadership|Plan Your Visit|Reach Out/);
    assert.doesNotMatch(empty.text, /Ada Featured|Bea Grid/);
    assert.doesNotMatch(empty.text, /\[Demo\]|demo content/i);
  });

  it("PHASE7_STAGE3 ministries/events/sermons/contact/giving Stitch markers, escape, soft-fill, giving safety", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.ministries SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.events SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.sermons SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.giving_methods SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );

    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    for (const key of ["ministries", "events", "sermons", "contact", "giving"]) {
      const page = pages.pages.find((p) => p.pageKey === key);
      await updatePublicPage(pool, page.id, { status: "published" });
    }

    const ministriesPage = pages.pages.find((p) => p.pageKey === "ministries");
    const ministry = await createMinistry(pool, {
      churchId: churchA.id,
      name: "Youth & Outreach Ministry",
      summary: "Summary with care & welcome",
      meetingDay: "Wednesdays",
      contactEmail: "youth@example.test",
      status: "published",
    });
    assert.equal(ministry.ok, true, ministry.reason || ministry.status);
    const minRes = await request(app).get("/ministries").set("Host", HOST_A);
    assert.equal(minRes.status, 200);
    assert.match(minRes.text, /data-bb-stitch-ministries="phase7-v1"/);
    assert.match(minRes.text, /data-bb-ministries-hero="1"/);
    assert.match(minRes.text, /data-bb-ministries-grid="1"|data-bb-ministries-featured="1"/);
    assert.match(minRes.text, /data-bb-ministries-cta="1"/);
    assert.match(minRes.text, /data-bb-ministry-contact="1"/);
    assert.match(minRes.text, /Youth &amp; Outreach Ministry/);
    assert.match(minRes.text, /care &amp; welcome/);
    assert.doesNotMatch(minRes.text, /500\+|Global Missions|View Schedule|Learn More/i);
    assert.doesNotMatch(minRes.text, /data-bb-preview-banner|href="\/hq"/);

    const soon = new Date(Date.now() + 5 * 86400000).toISOString();
    const event = await createEvent(pool, {
      churchId: churchA.id,
      title: "Community Meal & Fellowship",
      summary: "Upcoming summary",
      startsAt: soon,
      timezone: "UTC",
      location: "Hall A",
      status: "published",
    });
    assert.equal(event.ok, true, event.reason || event.status);
    const evRes = await request(app).get("/events").set("Host", HOST_A);
    assert.equal(evRes.status, 200);
    assert.match(evRes.text, /data-bb-stitch-events="phase7-v1"/);
    assert.match(evRes.text, /data-bb-events-hero="1"/);
    assert.match(evRes.text, /data-bb-event-featured="1"/);
    assert.match(evRes.text, /Community Meal &amp; Fellowship/);
    assert.match(evRes.text, /Hall A/);
    assert.doesNotMatch(evRes.text, /data-bb-calendar=/);

    const sermon = await createSermon(pool, {
      churchId: churchA.id,
      title: "Sermon & Hope",
      speakerName: "Pastor A",
      summary: "Category: Teaching. Body summary.",
      preachedAt: new Date().toISOString(),
      status: "published",
    });
    assert.equal(sermon.ok, true, sermon.reason || sermon.status);
    const serRes = await request(app).get("/sermons").set("Host", HOST_A);
    assert.equal(serRes.status, 200);
    assert.match(serRes.text, /data-bb-stitch-sermons="phase7-v1"/);
    assert.match(serRes.text, /data-bb-sermons-hero="1"/);
    assert.match(serRes.text, /data-bb-sermon-featured="1"/);
    assert.match(serRes.text, /Sermon &amp; Hope/);
    assert.match(serRes.text, /Teaching/);
    assert.match(serRes.text, /Pastor A/);

    const contactPage = pages.pages.find((p) => p.pageKey === "contact");
    await pool.query(`DELETE FROM blessboard.page_sections WHERE page_id = $1`, [contactPage.id]);
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, sort_order, status)
       VALUES
         ($1, 'intro', 'hero', 'Contact Our Church', 'Reach the office.', 1, 'published'),
         ($1, 'office_hours', 'body', 'Office hours', 'Mon–Fri 9:00–15:00', 20, 'published')`,
      [contactPage.id]
    );
    await pool.query(
      `UPDATE blessboard.branch_settings
          SET address_line_1 = $2, city = $3, phone = $4, email = $5
        WHERE branch_id = $1`,
      [branchA.id, "88 Contact Way", "Demo City", "+15558888", "office@example.test"]
    );
    // Avoid soft-noise from home service times on contact assertions.
    await pool.query(
      `UPDATE blessboard.page_sections ps
          SET status = 'draft'
         FROM blessboard.public_pages p
        WHERE ps.page_id = p.id
          AND p.church_id = $1
          AND p.page_key = 'home'
          AND ps.section_key = 'service_times'
          AND ps.status = 'published'`,
      [churchA.id]
    );
    const contactRes = await request(app).get("/contact").set("Host", HOST_A);
    assert.equal(contactRes.status, 200);
    assert.match(contactRes.text, /data-bb-stitch-contact="phase7-v1"/);
    assert.match(contactRes.text, /data-bb-contact-hero="1"/);
    assert.match(contactRes.text, /data-bb-contact-hours="1"/);
    assert.match(contactRes.text, /Mon–Fri 9:00–15:00|Mon&#8211;Fri|Mon&ndash;Fri/);
    assert.match(contactRes.text, /88 Contact Way|Demo City/);
    assert.match(contactRes.text, /data-bb-contact-(?:form|message)="unavailable"/);
    assert.match(contactRes.text, /data-bb-contact-services="1"|Service Times/);
    assert.doesNotMatch(contactRes.text, /<form[\s>]/i);

    const give = await createGivingMethod(pool, {
      churchId: churchA.id,
      methodType: "bank_transfer",
      label: "[Demo] Safe instructions",
      instructions: "TEST ONLY — DEMO-00-0000 fictional account. Do not send money.",
      status: "published",
    });
    assert.equal(give.ok, true, give.reason || give.status);
    const giveRes = await request(app).get("/giving").set("Host", HOST_A);
    assert.equal(giveRes.status, 200);
    assert.match(giveRes.text, /data-bb-stitch-giving="phase7-v1"/);
    assert.match(giveRes.text, /data-bb-giving-hero="1"/);
    assert.match(giveRes.text, /data-bb-giving-notice="1"/);
    assert.match(giveRes.text, /data-bb-giving-testing="1"/);
    assert.match(giveRes.text, /data-bb-giving-instructions="1"/);
    assert.match(giveRes.text, /DEMO-00-0000/);
    assert.doesNotMatch(giveRes.text, /\bcheckout\b|\bcard number\b/i);

    const publishedBank = mapGiving({
      methodType: "bank_transfer",
      label: "Bank",
      description: "Sunday offering account",
      accountDetails: "IBAN DE89370400440532013000 · routing 123456789",
      instructions: "Send to IBAN DE89370400440532013000 routing 123456789",
      externalUrl: null,
    });
    assert.equal(publishedBank.description, "Sunday offering account");
    assert.match(publishedBank.accountDetails, /DE89370400440532013000/);
    assert.match(publishedBank.instructions, /DE89370400440532013000/);
    assert.doesNotMatch(publishedBank.instructions, /Contact the church office/);

    const scrubbedSecrets = mapGiving({
      methodType: "online",
      label: "Portal",
      accountDetails: "PIN: 1234 password: secretlogin",
      instructions: "Login: admin password: hunter2 card number 4111111111111111",
      externalUrl: null,
    });
    assert.match(scrubbedSecrets.accountDetails, /\[redacted\]/);
    assert.doesNotMatch(scrubbedSecrets.accountDetails, /1234/);
    assert.match(scrubbedSecrets.instructions, /\[redacted\]/);
    assert.doesNotMatch(scrubbedSecrets.instructions, /hunter2/);
    assert.doesNotMatch(scrubbedSecrets.instructions, /4111111111111111/);

    await pool.query(
      `UPDATE blessboard.ministries SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.events SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.sermons SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    const emptyMin = await request(app).get("/ministries").set("Host", HOST_A);
    const emptyEv = await request(app).get("/events").set("Host", HOST_A);
    const emptySer = await request(app).get("/sermons").set("Host", HOST_A);
    assert.doesNotMatch(emptyMin.text, /data-bb-empty="ministries"/);
    assert.doesNotMatch(emptyEv.text, /data-bb-empty="events"/);
    assert.doesNotMatch(emptySer.text, /data-bb-empty="sermons"/);
    assert.match(emptyMin.text, /Children.?s Ministry|Youth Ministry|Community Outreach/);
    assert.match(emptyEv.text, /Leaders Equipping Weekend|Sunday Morning Connection/);
    assert.match(emptySer.text, /Finding Peace in the Noise/);
  });

  it("empty home sections collapse and blank cards are not rendered", async () => {
    requireDb();
    const pages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const home = pages.pages.find((p) => p.pageKey === "home");
    await updatePublicPage(pool, home.id, { status: "published" });
    await createPageSection(pool, {
      pageId: home.id,
      sectionKey: "blank_block",
      sectionType: "body",
      heading: "",
      bodyText: "",
      status: "published",
      confirmPublish: true,
    });
    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /data-section="blank_block"/);
    assert.doesNotMatch(res.text, /bb-tp-ministry-card__title">\s*</);
  });

  it("desktop and mobile structural markers coexist on public pages", async () => {
    requireDb();
    for (const p of ["/", "/about", "/events", "/sermons", "/giving", "/contact"]) {
      const res = await request(app).get(p).set("Host", HOST_A);
      assert.equal(res.status, 200, p);
      assert.match(res.text, /id="bb-tp-drawer"/);
      assert.match(res.text, /id="bb-tp-menu-btn"/);
      assert.match(res.text, /bb-tp-nav--desktop/);
      assert.match(res.text, /overflow-x|bb-tp-body/);
      assert.doesNotMatch(res.text, /views\/church\/public|church\.css\?v=/);
    }
  });

  it("PHASE2_085 shared shell: header, nav, drawer, footer, and no public admin chrome", async () => {
    requireDb();
    const home = await request(app).get("/").set("Host", HOST_A);
    assert.equal(home.status, 200);
    assert.match(home.text, /data-bb-shell="tenant-public"/);
    assert.match(home.text, /data-bb-header="1"/);
    assert.match(home.text, /data-bb-nav="desktop"/);
    assert.match(home.text, /data-bb-nav="mobile-drawer"/);
    assert.match(home.text, /data-bb-header-actions="1"/);
    assert.match(home.text, /data-bb-footer="1"/);
    assert.match(home.text, /bb-tp-nav__link is-active[^>]*>Home</);
    assert.match(home.text, /aria-current="page"/);
    assert.match(home.text, /id="bb-tp-menu-btn"/);
    assert.match(home.text, /aria-controls="bb-tp-drawer"/);
    assert.match(home.text, /aria-expanded="false"/);
    assert.match(home.text, /role="dialog"/);
    assert.match(home.text, /aria-modal="true"/);
    assert.match(home.text, /data-bb-public-login="1"/);
    assert.match(home.text, />Login</);
    assert.match(home.text, /Plan Your Visit/);
    assert.match(home.text, /Quick Links/);
    assert.match(home.text, /Powered by BlessBoard/);
    assert.match(home.text, /tenant-public\.css\?v=55/);
    assert.doesNotMatch(home.text, /data-bb-preview-banner/);
    assert.doesNotMatch(home.text, /Back to content admin|Edit page/);
    assert.doesNotMatch(home.text, /href="\/hq"|href="\/admin"|bb-ca-preview/);
    assert.doesNotMatch(home.text, /bottom.?nav|bb-tp-fab|data-bb-edit|pencil/i);

    const about = await request(app).get("/about").set("Host", HOST_A);
    assert.equal(about.status, 200);
    assert.match(about.text, /bb-tp-nav__link[^>]*is-active[^>]*>About</);
    assert.match(about.text, /data-bb-footer="1"/);
  });

  it("PHASE2_085 escapes church names in the shared shell", async () => {
    requireDb();
    const dangerous = 'Alpha <script>alert(1)</script> & "Church"';
    await updateChurchSettings(pool, churchA.id, {
      publicName: dangerous,
      websiteStatus: "published",
    });
    try {
      const res = await request(app).get("/").set("Host", HOST_A);
      assert.equal(res.status, 200);
      assert.match(
        res.text,
        /Alpha &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; (?:&quot;|&#34;)Church(?:&quot;|&#34;)/
      );
      assert.doesNotMatch(res.text, /<script>alert\(1\)<\/script>/);
      assert.match(res.text, /class="bb-tp-brand__name"/);
      assert.match(res.text, /class="bb-tp-footer__name"/);
    } finally {
      await updateChurchSettings(pool, churchA.id, {
        publicName: CHURCH_A,
        websiteStatus: "published",
      });
    }
  });

  it("PHASE2_092 demo media soft-fill, stale hero polish, denser dir-hero, no contact form", async () => {
    requireDb();
    const churchPages = await provisionEmptyPublicPages(pool, { churchId: churchA.id });
    const branchPages = await provisionEmptyPublicPages(pool, {
      churchId: churchA.id,
      branchId: branchA.id,
    });
    for (const key of ["home", "events", "sermons", "contact"]) {
      const churchPage = churchPages.pages.find((p) => p.pageKey === key);
      const branchPage = branchPages.pages.find((p) => p.pageKey === key);
      if (churchPage) await updatePublicPage(pool, churchPage.id, { status: "published" });
      if (branchPage) await updatePublicPage(pool, branchPage.id, { status: "published" });
    }

    const home = churchPages.pages.find((p) => p.pageKey === "home");
    await pool.query(`DELETE FROM blessboard.page_sections WHERE page_id = $1`, [home.id]);
    await pool.query(
      `INSERT INTO blessboard.page_sections
         (page_id, section_key, section_type, heading, body_text, media_url, sort_order, status)
       VALUES ($1, 'hero', 'hero', $2, $3, $4, 1, 'published')`,
      [
        home.id,
        "A Place for Growth & Community",
        "Stale demo hero body",
        "/church/images/tenant-public/home-desktop-hero.jpg",
      ]
    );
    const homeRes = await request(app).get("/").set("Host", HOST_A);
    assert.equal(homeRes.status, 200);
    assert.match(homeRes.text, /Faith, Community and Hope|A Place for Growth/);
    assert.match(homeRes.text, /tenant-public\.css\?v=55/);
    assert.doesNotMatch(homeRes.text, /A Place for Growth & Community/);

    await pool.query(
      `UPDATE blessboard.events SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );
    await pool.query(
      `UPDATE blessboard.sermons SET status = 'draft' WHERE church_id = $1 AND status = 'published'`,
      [churchA.id]
    );

    const soon = new Date(Date.now() + 4 * 86400000).toISOString();
    const event = await createEvent(pool, {
      churchId: churchA.id,
      branchId: null,
      title: "[Demo] Sunday Worship Gathering",
      summary: "Demo event for image soft-fill",
      startsAt: soon,
      timezone: "UTC",
      status: "published",
    });
    assert.equal(event.ok, true, event.reason || event.status);
    const evRes = await request(app).get("/events").set("Host", HOST_A);
    assert.equal(evRes.status, 200);
    assert.match(evRes.text, /\/church\/images\/events\//);
    assert.doesNotMatch(evRes.text, /bb-tp-featured-event__media is-fallback/);
    assert.match(evRes.text, /bb-tp-page-hero|data-bb-page-hero/);

    const sermon = await createSermon(pool, {
      churchId: churchA.id,
      title: "[Demo] Welcome Home",
      speakerName: "Jordan Hale (Demo)",
      summary: "Category: Welcome. Soft-fill thumb test.",
      preachedAt: new Date().toISOString(),
      status: "published",
    });
    assert.equal(sermon.ok, true, sermon.reason || sermon.status);
    const serRes = await request(app).get("/sermons").set("Host", HOST_A);
    assert.equal(serRes.status, 200);
    assert.match(serRes.text, /\/church\/images\/sermons\//);
    assert.doesNotMatch(serRes.text, /bb-tp-sermon-card__media is-fallback/);
    assert.match(serRes.text, /data-bb-sermon-thumb="1"/);

    const contact = await request(app).get("/contact").set("Host", HOST_A);
    assert.equal(contact.status, 200);
    assert.match(contact.text, /data-bb-contact-(?:form|message)="unavailable"/);
    assert.doesNotMatch(contact.text, /<form[\s>]/i);
    assert.doesNotMatch(contact.text, /method=["']post["']/i);
    assert.doesNotMatch(contact.text, /prayer request form|mobile money checkout|bottom.?tab/i);
  });

  it("V4 church public routes and templates are untouched by V5 public parity", () => {
    const v4About = path.join(__dirname, "../views/church/public/about.ejs");
    const v4Home = path.join(__dirname, "../views/church/partials/home_branch.ejs");
    const v4Routes = path.join(__dirname, "../src/routes/church/publicPages.js");
    assert.equal(fs.existsSync(v4About), true);
    assert.equal(fs.existsSync(v4Home), true);
    assert.equal(fs.existsSync(v4Routes), true);
    const homeV5 = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/public/home.ejs"),
      "utf8"
    );
    assert.match(homeV5, /data-bb-stitch-home="phase7-v1"/);
    assert.doesNotMatch(homeV5, /isPreviewMode|websiteContentService/);
    const v4Css = path.join(__dirname, "../public/church/church.css");
    assert.equal(fs.existsSync(v4Css), true);
    const shellStart = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/partials/tenant-public-shell-start.ejs"),
      "utf8"
    );
    assert.doesNotMatch(shellStart, /church\.css/);
  });
});
