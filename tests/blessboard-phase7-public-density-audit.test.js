"use strict";

/**
 * Phase 7 public church website — density + editing-completeness audit contracts.
 * Covers CSS spacing/menu density (no DB) and path-public /c/:key HTTP surface (DB).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("crypto");
const request = require("supertest");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const appRepo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  provisionRegisteredBlessBoardChurch,
} = require("../src/blessboard/services/provisionRegisteredBlessBoardChurch");
const {
  EDITABLE_FIELDS,
  listEditableFieldsForPage,
} = require("../src/blessboard/services/websiteInlineEditableFields");
const {
  DRAFT_KINDS,
} = require("../src/blessboard/services/websiteStructuredDraftValidation");

const ROOT = path.join(__dirname, "..");
const IDENTITY_KEY = "blessboard-platform-v5";
const PASSWORD = "TestPassword99!";
const APEX = "blessboard.org";
const CSS_VERSION = "46";

const PUBLIC_PAGES = Object.freeze([
  { key: "home", suffix: "", stitch: "phase7-v1", headingHint: /Welcome|Church|Home/i },
  { key: "about", suffix: "/about", stitch: 'data-bb-stitch-about="phase7-v1"', headingHint: /About/i },
  { key: "leadership", suffix: "/leadership", stitch: 'data-bb-stitch-leadership="phase7-v1"', headingHint: /Leadership|Pastor|Team/i },
  { key: "ministries", suffix: "/ministries", stitch: 'data-bb-stitch-ministries="phase7-v1"', headingHint: /Ministr/i },
  { key: "events", suffix: "/events", stitch: 'data-bb-stitch-events="phase7-v1"', headingHint: /Event/i },
  { key: "sermons", suffix: "/sermons", stitch: 'data-bb-stitch-sermons="phase7-v1"', headingHint: /Sermon|Message|Teach/i },
  { key: "contact", suffix: "/contact", stitch: 'data-bb-stitch-contact="phase7-v1"', headingHint: /Contact/i },
  { key: "giving", suffix: "/giving", stitch: 'data-bb-stitch-giving="phase7-v1"', headingHint: /Giv/i },
]);

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function uniq(prefix) {
  return `${prefix}-${crypto.randomBytes(3).toString("hex")}`;
}

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

describe("Phase 7 density audit — CSS and inventory contracts", () => {
  it("cache-bust version is 44 after density pass", () => {
    assert.match(read("views/blessboard/v5/partials/tenant-public-shell-start.ejs"), new RegExp(`tenant-public\\.css\\?v=${CSS_VERSION}`));
    assert.match(read("src/blessboard/http/loadTenantPublicPageModel.js"), new RegExp(`tenant-public\\.css\\?v=${CSS_VERSION}`));
    assert.match(read("src/blessboard/http/attachWebsiteAdminChrome.js"), new RegExp(`tenant-public\\.css\\?v=${CSS_VERSION}`));
  });

  it("design tokens keep section rhythm in the 56–72px band", () => {
    const tokens = read("public/blessboard/v5/design-tokens.css");
    assert.match(tokens, /--bb-section:\s*4rem/);
    assert.match(tokens, /--bb-section-desktop:\s*4rem/);
    assert.doesNotMatch(tokens, /--bb-section-desktop:\s*5rem/);
    assert.match(tokens, /--bb-header-h:\s*5rem/);
    assert.match(tokens, /--bb-max:\s*80rem/);
  });

  it("mobile drawer rows are dense (gap 0, ~10–12px padding, 44px min-height)", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const listBlock = css.match(/\.bb-tp-drawer__list\s*\{[^}]+\}/);
    assert.ok(listBlock, "drawer list rule");
    assert.match(listBlock[0], /gap:\s*0/);
    assert.doesNotMatch(listBlock[0], /gap:\s*0\.4rem/);

    const linkBlock = css.match(/\.bb-tp-drawer__link\s*\{[^}]+\}/);
    assert.ok(linkBlock, "drawer link rule");
    assert.match(linkBlock[0], /padding:\s*0\.625rem/);
    assert.match(linkBlock[0], /min-height:\s*var\(--bb-touch-min/);
  });

  it("Phase 7 home hero no longer uses 72vh / 40rem min-height", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-hero--phase7[\s\S]*?min-height:\s*min\(52vh,\s*28rem\)/);
    assert.doesNotMatch(css, /min-height:\s*min\(72vh,\s*40rem\)/);
    assert.doesNotMatch(css, /min-height:\s*min\(68vh,\s*34rem\)/);
    assert.match(css, /min-height:\s*min\(48vh,\s*24rem\)/);
  });

  it("home section bands use controlled desktop padding (3.5rem / 56px)", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(
      css,
      /\.bb-tp-home-welcome,[\s\S]*?\.bb-tp-home-contact\s*\{[\s\S]*?padding:\s*2\.75rem\s+0/
    );
    assert.match(
      css,
      /@media \(min-width: 900px\)\s*\{[\s\S]*?\.bb-tp-home-welcome,[\s\S]*?padding:\s*3\.5rem\s+0/
    );
  });

  it("desktop header stays single-row (nowrap) at public nav breakpoint", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-nav--desktop[\s\S]*?flex-wrap:\s*nowrap/);
    assert.match(css, /\.bb-tp-header__inner[\s\S]*?flex-wrap:\s*nowrap/);
    assert.match(css, /\.bb-tp-header__inner[\s\S]*?height:\s*var\(--bb-header-h\)/);
  });

  it("anonymous shell does not load editor bundles", () => {
    const end = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    assert.match(end, /websiteAdmin && websiteAdmin\.editingMode/);
    assert.match(end, /website-inline-edit\.js/);
    assert.match(end, /website-structured-edit\.js/);
    const gated = end.slice(end.indexOf("editingMode"));
    assert.ok(gated.includes("website-inline-edit.js"));
    assert.match(end, /<% if \(typeof websiteAdmin[\s\S]*website-inline-edit\.js[\s\S]*<% \} %>/);
  });

  it("inline editable inventory covers the eight public page keys expected by the product", () => {
    const byPage = {};
    for (const f of EDITABLE_FIELDS) {
      byPage[f.pageKey] = byPage[f.pageKey] || [];
      byPage[f.pageKey].push(`${f.sectionKey}.${f.fieldKey}`);
    }
    assert.ok(listEditableFieldsForPage("home").length >= 6);
    assert.ok(listEditableFieldsForPage("about").length >= 4);
    assert.ok(listEditableFieldsForPage("contact").length >= 5);
    assert.ok(listEditableFieldsForPage("giving").length >= 4);
    for (const page of ["ministries", "events", "sermons"]) {
      assert.ok(listEditableFieldsForPage(page).some((f) => f.fieldKey === "heading"));
    }
    // Leadership page intro is now Stage 4 inline-editable.
    assert.ok(listEditableFieldsForPage("leadership").length >= 2);
    assert.deepEqual(
      [...DRAFT_KINDS].sort(),
      [
        "event",
        "giving_method",
        "image",
        "leader",
        "ministry",
        "sermon",
        "service_times",
        "social_link",
        "video",
      ].sort()
    );
    // Branding colours remain intentionally not Stage 5 kinds.
    assert.ok(!DRAFT_KINDS.includes("branding"));
  });

  it("Stitch page markers exist on all eight public templates", () => {
    const map = {
      home: "views/blessboard/v5/public/home.ejs",
      about: "views/blessboard/v5/public/about.ejs",
      leadership: "views/blessboard/v5/public/leadership.ejs",
      ministries: "views/blessboard/v5/public/ministries.ejs",
      events: "views/blessboard/v5/public/events.ejs",
      sermons: "views/blessboard/v5/public/sermons.ejs",
      contact: "views/blessboard/v5/public/contact.ejs",
      giving: "views/blessboard/v5/public/giving.ejs",
    };
    for (const [key, rel] of Object.entries(map)) {
      const src = read(rel);
      assert.match(src, new RegExp(`data-bb-stitch-${key}="phase7-v1"`));
    }
  });
});

describe("Phase 7 density audit — path-public /c/:key HTTP", () => {
  let pool;
  let skipSuite = false;
  let skipReason = "";
  let app;
  let orgKeyA;
  let orgKeyB;
  let churchNameA;
  let churchNameB;

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
      app = createV5FoundationApp({
        getPool: () => pool,
        env: baseEnv(),
        apexHosts: new Set([APEX, `www.${APEX}`]),
      });

      async function provisionDemo(label) {
        const key = uniq(label);
        const row = await appRepo.createApplication(pool, {
          church_name: `Demo ${label} ${key}`,
          country: "Zambia",
          city: "Lusaka",
          contact_name: "Site Admin",
          contact_email: `${key}@example.org`,
          contact_phone: `+26097${String(Math.floor(Math.random() * 1e7)).padStart(7, "0")}`,
          selected_plan: "foundation",
          consent_terms: true,
          branch_name: "Main Campus",
        });
        const result = await provisionRegisteredBlessBoardChurch(pool, {
          applicationId: row.id,
          administratorPassword: PASSWORD,
          requestedOrganizationKey: key,
          requestId: `req-${key}`,
          actorContext: { type: "test", source: "phase7-audit", dataEnvironment: "testing" },
        });
        assert.equal(result.ok, true, result.message || result.status);
        return {
          organizationKey: result.records.organizationKey,
          churchName: `Demo ${label} ${key}`,
          churchId: result.records.churchId,
        };
      }

      const a = await provisionDemo("10");
      const b = await provisionDemo("iso");
      orgKeyA = a.organizationKey;
      orgKeyB = b.organizationKey;
      churchNameA = a.churchName;
      churchNameB = b.churchName;
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

  it("all eight public routes return 200 with shell, church name, and no admin chrome", async () => {
    requireDb();
    for (const page of PUBLIC_PAGES) {
      const res = await request(app)
        .get(`/c/${orgKeyA}${page.suffix}`)
        .set("Host", APEX);
      assert.equal(res.status, 200, page.key);
      assert.match(res.text, /data-bb-shell="tenant-public"/);
      assert.match(res.text, new RegExp(churchNameA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
      assert.match(res.text, /bb-tp-header/);
      assert.match(res.text, /bb-tp-footer|bb-tp-footer__/);
      assert.match(res.text, new RegExp(`tenant-public\\.css\\?v=${CSS_VERSION}`));
      assert.doesNotMatch(res.text, /data-bb-inline-edit/);
      assert.doesNotMatch(res.text, /website-inline-edit\.js/);
      assert.doesNotMatch(res.text, /website-structured-edit\.js/);
      assert.doesNotMatch(res.text, /data-bb-website-editing/);
      if (page.key === "home") {
        assert.match(res.text, /data-bb-stitch-home="phase7-v1"/);
      } else {
        assert.match(res.text, new RegExp(page.stitch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }
  });

  it("unknown organization key returns controlled 404", async () => {
    requireDb();
    const res = await request(app).get("/c/does-not-exist-org-zzzz").set("Host", APEX);
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /data-bb-inline-edit/);
  });

  it("tenant isolation: Church A never shows Church B content", async () => {
    requireDb();
    const resA = await request(app).get(`/c/${orgKeyA}`).set("Host", APEX);
    const resB = await request(app).get(`/c/${orgKeyB}`).set("Host", APEX);
    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);
    assert.match(resA.text, new RegExp(churchNameA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.doesNotMatch(resA.text, new RegExp(churchNameB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.match(resB.text, new RegExp(churchNameB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    assert.doesNotMatch(resB.text, new RegExp(churchNameA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  });

  it("nav links for all eight destinations are present without duplicates on home", async () => {
    requireDb();
    const res = await request(app).get(`/c/${orgKeyA}`).set("Host", APEX);
    assert.equal(res.status, 200);
    // Count only primary nav regions (desktop + drawer), not teaser/CTA repeats.
    const desktopNav = (res.text.match(/<nav class="bb-tp-nav bb-tp-nav--desktop"[\s\S]*?<\/nav>/) || [])[0] || "";
    const drawerNav = (res.text.match(/<nav class="bb-tp-drawer__nav"[\s\S]*?<\/nav>/) || [])[0] || "";
    const navHtml = `${desktopNav}\n${drawerNav}`;
    assert.ok(desktopNav, "desktop nav present");
    assert.ok(drawerNav, "drawer nav present");
    for (const page of PUBLIC_PAGES) {
      const href = `/c/${orgKeyA}${page.suffix || ""}`;
      const re = new RegExp(`href="${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g");
      const matches = navHtml.match(re) || [];
      assert.ok(matches.length >= 1, `missing nav for ${href}`);
      assert.ok(matches.length <= 2, `duplicate primary-nav links for ${href}: ${matches.length}`);
    }
  });

  it("SEO: each page has title, description, and canonical under /c/:key", async () => {
    requireDb();
    for (const page of PUBLIC_PAGES) {
      const res = await request(app)
        .get(`/c/${orgKeyA}${page.suffix}`)
        .set("Host", APEX);
      assert.equal(res.status, 200, page.key);
      assert.match(res.text, /<title>[^<]+<\/title>/i);
      assert.match(res.text, /<meta name="description"/i);
      assert.match(res.text, new RegExp(`rel="canonical"[^>]*href="[^"]*/c/${orgKeyA}${page.suffix}"`));
    }
  });
});
