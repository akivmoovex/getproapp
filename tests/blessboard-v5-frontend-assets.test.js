"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Canonical cache-bust versions for live V5 shells (keep in sync with templates). */
const VERSIONS = {
  designSystem: "6",
  apex: "14",
  apexAuth: "6",
  tenantPublic: "44",
  tenantAuth: "13",
  memberPortal: "22",
  branchAdmin: "38",
  hqAdmin: "56",
  platformAdmin: "57",
  mediaPickerCss: "8",
  mediaPickerJs: "6",
  designSystemJs: "3",
  shellNav: "3",
  tenantPublicJs: "7",
};

describe("blessboard v5 frontend assets — includes and cache busting", () => {
  it("apex shell loads apex-auth.css only on account pages", () => {
    const start = read("views/blessboard/v5/partials/apex-shell-start.ejs");
    assert.match(start, /activeNav === 'account'/);
    assert.match(start, new RegExp(`apex-auth\\.css\\?v=${VERSIONS.apexAuth}`));
    assert.match(start, new RegExp(`apex\\.css\\?v=${VERSIONS.apex}`));
    const login = read("views/blessboard/v5/apex/login.ejs");
    assert.match(login, new RegExp(`apex-auth\\.css\\?v=${VERSIONS.apexAuth}`));
    assert.match(login, new RegExp(`tenant-auth\\.css\\?v=${VERSIONS.tenantAuth}`));
  });

  it("HQ/branch shells gate media-picker CSS/JS behind loadMediaPicker", () => {
    const baStart = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const baEnd = read("views/blessboard/v5/partials/branch-admin-shell-end.ejs");
    const hqStart = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    const hqEnd = read("views/blessboard/v5/partials/hq-shell-end.ejs");
    for (const src of [baStart, hqStart]) {
      assert.match(src, /typeof loadMediaPicker !== 'undefined' && loadMediaPicker/);
      assert.match(src, new RegExp(`media-picker\\.css\\?v=${VERSIONS.mediaPickerCss}`));
    }
    for (const src of [baEnd, hqEnd]) {
      assert.match(src, /typeof loadMediaPicker !== 'undefined' && loadMediaPicker/);
      assert.match(src, new RegExp(`media-picker\\.js\\?v=${VERSIONS.mediaPickerJs}`));
    }
    const gatedPages = [
      "views/blessboard/v5/announcements/admin-form.ejs",
      "views/blessboard/v5/content-admin/page.ejs",
      "views/blessboard/v5/content-admin/section.ejs",
      "views/blessboard/v5/content-admin/entities.ejs",
      "views/blessboard/v5/forms-requests/admin-resources.ejs",
    ];
    for (const rel of gatedPages) {
      const src = read(rel);
      assert.match(src, /loadMediaPicker:\s*true/, rel);
      assert.match(src, /hq-shell-start',\s*\{\s*loadMediaPicker:\s*true\s*\}/, rel);
      assert.match(src, /hq-shell-end',\s*\{\s*loadMediaPicker:\s*true\s*\}/, rel);
    }
    assert.doesNotMatch(
      read("views/blessboard/v5/branch-admin/dashboard.ejs"),
      /loadMediaPicker:\s*true/
    );
  });

  it("shell scripts use defer including shell-nav (first among deferred)", () => {
    const ends = [
      "views/blessboard/v5/partials/member-shell-end.ejs",
      "views/blessboard/v5/partials/branch-admin-shell-end.ejs",
      "views/blessboard/v5/partials/hq-shell-end.ejs",
      "views/blessboard/v5/partials/platform-admin-shell-end.ejs",
    ];
    for (const rel of ends) {
      const src = read(rel);
      assert.match(src, new RegExp(`shell-nav\\.js\\?v=${VERSIONS.shellNav}" defer`));
      assert.match(src, new RegExp(`design-system\\.js\\?v=${VERSIONS.designSystemJs}" defer`));
      const shellNavIdx = src.indexOf("shell-nav.js");
      const dsIdx = src.indexOf("design-system.js");
      assert.ok(shellNavIdx >= 0 && dsIdx > shellNavIdx, `${rel}: shell-nav before design-system`);
    }
  });

  it("fallback controlled-error HTML uses the same CSS cache versions as shells", () => {
    assert.match(
      read("src/platform/http/v5FoundationServer.js"),
      new RegExp(`tenant-auth\\.css\\?v=${VERSIONS.tenantAuth}`)
    );
    assert.doesNotMatch(read("src/platform/http/v5FoundationServer.js"), /tenant-auth\.css\?v=1"/);
    assert.match(read("src/blessboard/http/hqAdminRoutes.js"), /hq-admin\.css\?v=\d+/);
    assert.match(read("src/blessboard/http/branchAdminRoutes.js"), /branch-admin\.css\?v=\d+/);
    assert.match(
      read("src/platform/http/platformAdminRoutes.js"),
      new RegExp(`platform-admin\\.css\\?v=${VERSIONS.platformAdmin}`)
    );
    assert.match(read("src/blessboard/http/contentAdminRoutes.js"), /hq-admin\.css\?v=\d+/);
    assert.match(read("src/blessboard/http/contentAdminRoutes.js"), /branch-admin\.css\?v=\d+/);
  });

  it("content preview uses public shell CSS and draft-aware renderer", () => {
    const shell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(shell, /head-design-system/);
    assert.match(shell, new RegExp(`tenant-public\\.css\\?v=${VERSIONS.tenantPublic}`));
    assert.match(shell, /data-bb-preview-banner/);
    const routes = read("src/blessboard/http/contentAdminRoutes.js");
    assert.match(routes, /loadTenantPublicPageModel/);
    assert.match(routes, /renderTenantPublicPage/);
    assert.match(routes, /preview:\s*true/);
    const model = read("src/blessboard/http/loadTenantPublicPageModel.js");
    assert.match(model, /cssHref:\s*"\/blessboard\/v5\/tenant-public\.css\?v=44"/);
  });

  it("PHASE2_092 P0/P1 guards: nav nowrap, brand, hero AR, dir-hero density, media soft-fill, contact honesty", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const shell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const home = read("views/blessboard/v5/public/home.ejs");
    const sermons = read("views/blessboard/v5/public/sermons.ejs");
    const events = read("views/blessboard/v5/public/events.ejs");
    const contact = read("views/blessboard/v5/public/contact.ejs");
    const model = read("src/blessboard/http/loadTenantPublicPageModel.js");
    const spec = read("src/blessboard/services/testingWebsiteDemoContentSpec.js");
    const service = read("src/blessboard/services/testingWebsiteDemoContentService.js");

    assert.match(css, /\.bb-tp-nav--desktop[\s\S]*?flex-wrap:\s*nowrap/);
    assert.match(css, /\.bb-tp-header__inner[\s\S]*?flex-wrap:\s*nowrap/);
    assert.doesNotMatch(
      css,
      /@media \(min-width: 900px\)[\s\S]{0,1200}?\.bb-tp-brand\s*\{[^}]*max-width:\s*14rem/
    );
    assert.match(css, /\.bb-tp-hero--phase7/);
    assert.match(css, /\.bb-tp-dir-hero\s*\{[\s\S]*?padding:\s*1\.35rem\s+0\s+0\.85rem/);
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /html\s*\{[\s\S]*?overflow-x:\s*clip/);

    assert.match(home, /staleDemoHeading/);
    assert.match(home, /25de9fa64884455b993abb051adb0d8a|phase7-v1/);
    assert.match(home, /Plan Your Visit/);

    assert.match(sermons, /sermon\.imageUrl/);
    assert.match(sermons, /bb-tp-sermon-card__media<%= sermon\.imageUrl/);
    assert.match(events, /introMediaUrl/);
    assert.match(contact, /data-bb-contact-form="unavailable"/);
    assert.doesNotMatch(contact, /<form[\s>]/i);
    assert.doesNotMatch(contact, /method=["']post["']/i);

    assert.match(model, /softFillDemoEventImages/);
    assert.match(model, /softFillDemoSermonImages/);
    assert.match(model, /cssHref:\s*"\/blessboard\/v5\/tenant-public\.css\?v=44"/);
    assert.match(spec, /eventFeatured:\s*"\/church\/images\/events\//);
    assert.match(spec, /sermonFeatured:\s*"\/church\/images\/sermons\//);
    assert.match(service, /kind === "event"/);

    assert.match(shell, new RegExp(`tenant-public\\.css\\?v=${VERSIONS.tenantPublic}`));
    assert.doesNotMatch(read("views/church/partials/public_shell_start.ejs"), /bb-tp-dir-hero/);
  });

  it("PHASE2_086 home CSS: landscape hero, band grid, violet service card, 390 overflow", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const home = read("views/blessboard/v5/public/home.ejs");
    assert.match(home, /data-bb-stitch-home="phase7-v1"/);
    assert.match(home, /25de9fa64884455b993abb051adb0d8a/);
    assert.match(home, /b82eb087d4b84242aabead19c08eb717/);
    assert.match(home, /partials\/service-times-block/);
    assert.match(css, /\.bb-tp-hero--phase7/);
    assert.match(css, /\.bb-tp-service-times--band/);
    assert.match(css, /\.bb-tp-card-grid/);
    assert.match(css, /overflow-x:\s*clip/);
  });

  it("PHASE2_087 about/leadership CSS: story media, purpose cards, portrait grid", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const about = read("views/blessboard/v5/public/about.ejs");
    const leadership = read("views/blessboard/v5/public/leadership.ejs");
    assert.match(about, /3736c7550483404282d5ba9914962c40/);
    assert.match(about, /aboutDemoFallback/);
    assert.match(leadership, /4d525f9fbba9482f91fadc28ef650d13/);
    assert.match(leadership, /leadershipDemoFallback/);
    assert.match(leadership, /Join a Ministry/);
    assert.match(css, /\.bb-tp-about-story__media|\.bb-tp-about-gallery/);
    assert.match(css, /\.bb-tp-purpose-card--accent|\.bb-tp-cta-band/);
    assert.match(css, /\.bb-tp-leader-card--featured|\.bb-tp-leader-card__media/);
    assert.match(css, /\.bb-tp-leadership-grid__title-mobile/);
  });

  it("PHASE2_088 remaining public pages: Stitch IDs, soft-fill hooks, giving safety", () => {
    const ministries = read("views/blessboard/v5/public/ministries.ejs");
    const events = read("views/blessboard/v5/public/events.ejs");
    const sermons = read("views/blessboard/v5/public/sermons.ejs");
    const contact = read("views/blessboard/v5/public/contact.ejs");
    const giving = read("views/blessboard/v5/public/giving.ejs");
    const model = read("src/blessboard/http/loadTenantPublicPageModel.js");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(ministries, /5a52a893e0414bf6962a0c078808d124/);
    assert.match(ministries, /phase7-v1/);
    assert.match(events, /a68314c0d6a34e0a824ad1a2b309c4ad/);
    assert.match(sermons, /d85d37f3bba84ac48d8d3f24b01b2010/);
    assert.match(contact, /28ba746495424a66a10cf5fb11916dec/);
    assert.match(giving, /e4fe61fbb9eb4b0987ca150d078aa76c/);
    assert.match(model, /ministriesDemoFallback/);
    assert.match(model, /eventsDemoFallback/);
    assert.match(model, /sermonsDemoFallback/);
    assert.match(model, /contactDemoFallback/);
    assert.match(model, /givingDemoFallback/);
    assert.match(model, /Contact the church office for published giving instructions/);
    assert.match(giving, /data-bb-giving-testing/);
    assert.match(contact, /data-bb-contact-hours/);
    assert.match(css, /\.bb-tp-contact-hours/);
    assert.match(css, /\.bb-tp-giving-why__grid/);
    assert.match(css, /overflow-x:\s*clip/);
  });
});

describe("blessboard v5 frontend assets — images and tokens", () => {
  it("CMS section media imgs declare width/height and lazy-load below the fold", () => {
    const files = [
      "views/blessboard/v5/public/home.ejs",
      "views/blessboard/v5/public/page.ejs",
      "views/blessboard/v5/public/about.ejs",
      "views/blessboard/v5/public/contact.ejs",
      "views/blessboard/v5/public/giving.ejs",
      "views/blessboard/v5/public/events.ejs",
      "views/blessboard/v5/public/sermons.ejs",
      "views/blessboard/v5/public/ministries.ejs",
      "views/blessboard/v5/public/leadership.ejs",
      "views/blessboard/v5/content-admin/preview.ejs",
    ];
    for (const rel of files) {
      const src = read(rel);
      assert.match(src, /class="bb-tp-media"/, rel);
      // Section/CMS media blocks (single-line tags); avoid [^>] which breaks on EJS `%>`.
      const sectionMedia =
        src.match(
          /<img class="bb-tp-media" src="<%[^%]+%>" alt="" width="\d+" height="\d+" loading="lazy"[^/]*\/>/g
        ) || [];
      assert.ok(sectionMedia.length > 0, `${rel} should have sized lazy bb-tp-media imgs`);
    }
  });

  it("apex home hero is not lazy-loaded and keeps dimensions", () => {
    const home = read("views/blessboard/v5/apex/home.ejs");
    assert.match(home, /fetchpriority="high"/);
    assert.doesNotMatch(
      home,
      /bb-apex-hero__frame[\s\S]{0,400}loading="lazy"/
    );
    assert.match(home, /width="960"/);
    assert.match(home, /height="720"/);
  });

  it("shell CSS does not redeclare the primary palette :root block", () => {
    const tokens = read("public/blessboard/v5/design-tokens.css");
    assert.match(tokens, /--bb-color-primary:\s*#6c5ce7/);
    for (const rel of [
      "public/blessboard/v5/apex.css",
      "public/blessboard/v5/member-portal.css",
      "public/blessboard/v5/branch-admin.css",
      "public/blessboard/v5/hq-admin.css",
      "public/blessboard/v5/platform-admin.css",
    ]) {
      const css = read(rel);
      assert.doesNotMatch(css, /:root\s*\{[^}]*--bb-color-primary:\s*#6c5ce7/, rel);
    }
  });

  it("no duplicate design-system or shell CSS links in a single shell head", () => {
    const heads = [
      "views/blessboard/v5/partials/apex-shell-start.ejs",
      "views/blessboard/v5/partials/tenant-public-shell-start.ejs",
      "views/blessboard/v5/partials/member-shell-start.ejs",
      "views/blessboard/v5/partials/branch-admin-shell-start.ejs",
      "views/blessboard/v5/partials/hq-shell-start.ejs",
      "views/blessboard/v5/partials/platform-admin-shell-start.ejs",
    ];
    for (const rel of heads) {
      const src = read(rel);
      const ds = src.match(/design-system\.css/g) || [];
      assert.equal(ds.length, 0, `${rel}: design-system via head include only`);
      assert.match(src, /head-design-system/);
    }
  });
});
