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
      assert.match(res.text, /data-bb-product="blessboard-v5"/);
      assert.match(res.text, /data-bb-shell="tenant-public"/);
      assert.match(res.text, /bb-tp-nav/);
      assert.match(res.text, /bb-tp-footer/);
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
    assert.doesNotMatch(res.text, /Contact Pastor|View Profile/i);
    assert.doesNotMatch(res.text, /Meet the team serving/);
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
    assert.match(res.text, /Zeta Pastor/);
    assert.match(res.text, /bb-tp-avatar/);
    assert.doesNotMatch(res.text, /Rev\. Dr\. Samuel|placeholder|stock photo/i);
    const alphaIdx = res.text.indexOf("Alpha Deacon");
    const betaIdx = res.text.indexOf("Beta Elder");
    assert.ok(alphaIdx > 0 && betaIdx > alphaIdx, "non-featured leaders keep sort order");
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
    assert.match(res.text, /Youth Ministry/);
    assert.match(res.text, /Music Ministry/);
    assert.match(res.text, /Fridays/);
    assert.doesNotMatch(res.text, /Draft Choir|Hidden draft ministry/);
    assert.doesNotMatch(res.text, /download|View Schedule|Contact Leader|Learn More/i);
    assert.doesNotMatch(res.text, /Explore ministries serving/);
    const youthIdx = res.text.indexOf("Youth Ministry");
    const musicIdx = res.text.indexOf("Music Ministry");
    assert.ok(youthIdx > 0 && musicIdx > youthIdx);

    const emptyHost = await request(app).get("/ministries").set("Host", HOST_B);
    assert.equal(emptyHost.status, 200);
    assert.doesNotMatch(emptyHost.text, /Youth Ministry|Music Ministry/);
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
    assert.match(home.text, /bb-tp-nav__link is-active[^>]*>Home</);
    assert.match(home.text, /Powered by/);
    assert.match(home.text, /GetPro/);
    assert.doesNotMatch(home.text, /1\.2k\+|Active Members|lorem ipsum/i);
    assert.doesNotMatch(home.text, /We are glad you are here/);

    const about = await request(app).get("/about").set("Host", HOST_A);
    assert.equal(about.status, 200);
    assert.match(about.text, /data-bb-page="about"/);
    assert.match(about.text, /bb-tp-nav__link is-active[^>]*>About</);
    assert.match(about.text, /data-bb-about="1"|bb-tp-about/);
    assert.match(about.text, /href="\/contact"/);
    assert.match(about.text, /href="\/register"/);
  });

  it("home empty state is intentional without fabricated metrics", async () => {
    requireDb();
    await pool.query(
      `UPDATE blessboard.page_sections ps
          SET status = 'draft'
         FROM blessboard.public_pages p
        WHERE ps.page_id = p.id
          AND p.church_id = $1
          AND p.page_key = 'home'`,
      [churchA.id]
    );
    const res = await request(app).get("/").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /bb-tp-empty|data-bb-home="1"/);
    assert.doesNotMatch(res.text, /\d+\+?\s*(Members|Hearts|Ministries|Active)/i);
    assert.doesNotMatch(res.text, /Annual Youth Summit|Service Times|Need Prayer/i);
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
    assert.match(res.text, /Soon Gathering/);
    assert.match(res.text, /Later Conference/);
    assert.doesNotMatch(res.text, /Draft Picnic|Cancelled Retreat|Past Fellowship/);
    assert.doesNotMatch(res.text, /javascript:alert|5\+ Events|event count/i);
    assert.doesNotMatch(res.text, /Find a place to grow/);
    const soonIdx = res.text.indexOf("Soon Gathering");
    const laterIdx = res.text.indexOf("Later Conference");
    assert.ok(soonIdx > 0 && laterIdx > soonIdx);
    assert.doesNotMatch(res.text, /data-bb-event-register="1"[^>]*javascript:/);
    // Featured (soon) has unsafe registration stripped; later still has safe register link.
    assert.match(res.text, /https:\/\/example\.org\/register-later/);

    const isolated = await request(app).get("/events").set("Host", HOST_B);
    assert.doesNotMatch(isolated.text, /Soon Gathering|Later Conference/);
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
      mediaUrl: "https://example.org/watch",
      resourceUrl: "https://example.org/notes.pdf",
      status: "published",
    });
    assert.equal(draft.ok && unsafe.ok && live.ok, true, live.message || unsafe.message);
    await pool.query(
      `UPDATE blessboard.sermons
          SET media_url = $1, resource_url = $2
        WHERE church_id = $3 AND title = $4`,
      ["javascript:alert(1)", "data:text/html,hi", churchA.id, "Safe Title Unsafe Links"]
    );

    const res = await request(app).get("/sermons").set("Host", HOST_A);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-sermons="1"/);
    assert.match(res.text, /Living Hope/);
    assert.match(res.text, /Safe Title Unsafe Links/);
    assert.doesNotMatch(res.text, /Draft Message/);
    assert.match(res.text, /https:\/\/example\.org\/watch/);
    assert.match(res.text, /https:\/\/example\.org\/notes\.pdf/);
    assert.doesNotMatch(res.text, /javascript:alert|data:text\/html|<iframe|youtube\.com\/embed/i);
    assert.doesNotMatch(res.text, /Weekly teachings and spiritual resources|demo sermon|placeholder/i);

    const isolated = await request(app).get("/sermons").set("Host", HOST_B);
    assert.doesNotMatch(isolated.text, /Living Hope|Safe Title Unsafe Links/);
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
    assert.match(res.text, /data-bb-header="1"/);
    assert.match(res.text, /data-bb-footer="1"/);
    assert.match(res.text, /bb-tp-nav__link is-active[^>]*>Contact</);
    assert.match(res.text, /church-office@example\.org|\+260900000001/);
    assert.doesNotMatch(res.text, /data-bb-contact-map=/);
    assert.doesNotMatch(res.text, /123 Faith Lane|Send a Message|Service Times|Office Hours|<form/i);
    assert.doesNotMatch(res.text, /name="message"|newsletter|mailing list/i);

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
    // Branch overrides church for settings cards when channel type not already published.
    assert.match(res.text, /hq-branch@example\.org/);
    assert.match(res.text, /\+260900000099/);
    assert.match(res.text, /12 Faith Lane/);
    assert.match(res.text, /data-bb-contact-map="1"/);
    assert.match(res.text, /openstreetmap\.org\/export\/embed/);
    assert.match(res.text, /Get Directions/);
    assert.doesNotMatch(res.text, /<form|Send a Message|Full Name|Prayer Request/i);

    // Clear coordinates — map must not render without a valid pair.
    await pool.query(
      `UPDATE blessboard.branch_settings SET latitude = NULL, longitude = NULL WHERE branch_id = $1`,
      [branchA.id]
    );
    res = await request(app).get("/contact").set("Host", HOST_A);
    assert.doesNotMatch(res.text, /data-bb-contact-map=/);
    assert.doesNotMatch(res.text, /openstreetmap\.org\/export\/embed/);

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
    assert.match(emptyRes.text, /data-bb-empty="giving"|does not process payments/i);
    assert.doesNotMatch(emptyRes.text, /<form|card number|cvv|account number|amount/i);

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
    assert.match(res.text, /bb-tp-nav__link is-active[^>]*>Giving</);
    assert.match(res.text, /Online Giving/);
    assert.match(res.text, /Sunday Offering/);
    assert.match(res.text, /https:\/\/example\.org\/give/);
    assert.match(res.text, /data-bb-giving-link="1"/);
    assert.doesNotMatch(res.text, /Draft Bank|Hidden draft account/);
    assert.doesNotMatch(res.text, /javascript:alert/);
    assert.doesNotMatch(res.text, /<form|card number|cvv|iban|account number|donate now amount/i);
    assert.match(res.text, /does not process payments|does not collect payment|financial account/i);

    const isolated = await request(app).get("/giving").set("Host", HOST_B);
    assert.doesNotMatch(isolated.text, /Online Giving|Sunday Offering/);
  });
});
