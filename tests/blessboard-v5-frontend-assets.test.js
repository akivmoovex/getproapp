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
  tenantPublic: "35",
  tenantAuth: "13",
  memberPortal: "22",
  branchAdmin: "38",
  hqAdmin: "56",
  platformAdmin: "33",
  mediaPickerCss: "8",
  mediaPickerJs: "6",
  designSystemJs: "3",
  shellNav: "2",
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
    assert.match(
      read("src/blessboard/http/hqAdminRoutes.js"),
      new RegExp(`hq-admin\\.css\\?v=${VERSIONS.hqAdmin}`)
    );
    assert.match(
      read("src/blessboard/http/branchAdminRoutes.js"),
      new RegExp(`branch-admin\\.css\\?v=${VERSIONS.branchAdmin}`)
    );
    assert.match(
      read("src/platform/http/platformAdminRoutes.js"),
      new RegExp(`platform-admin\\.css\\?v=${VERSIONS.platformAdmin}`)
    );
    assert.match(
      read("src/blessboard/http/contentAdminRoutes.js"),
      new RegExp(`hq-admin\\.css\\?v=${VERSIONS.hqAdmin}`)
    );
    assert.match(
      read("src/blessboard/http/contentAdminRoutes.js"),
      new RegExp(`branch-admin\\.css\\?v=${VERSIONS.branchAdmin}`)
    );
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
    assert.match(model, /cssHref:\s*"\/blessboard\/v5\/tenant-public\.css\?v=35"/);
  });

  it("PHASE2_086 home CSS: landscape hero, band grid, violet service card, 390 overflow", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const home = read("views/blessboard/v5/public/home.ejs");
    const resources = read("views/blessboard/v5/public/_home-digital-resources.ejs");
    assert.match(home, /data-bb-stitch-home="refined-v2"/);
    assert.match(home, /ead45db5be774baa9454412262096ffc/);
    assert.match(home, /89177588fbf8405dbebd5747c38e19ce/);
    assert.match(home, /include\('\.\/_home-digital-resources'\)/);
    assert.match(resources, /data-bb-home-resources/);
    assert.match(css, /\.bb-tp-hero__img[\s\S]*?aspect-ratio:\s*4\s*\/\s*3/);
    assert.match(css, /\.bb-tp-home__band[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.4fr\)/);
    assert.match(css, /\.bb-tp-home-service-card[\s\S]*?background:\s*var\(--bb-violet\)/);
    assert.match(css, /\.bb-tp-home__aside[\s\S]*?order:\s*-1/);
    assert.match(css, /overflow-x:\s*clip/);
  });

  it("PHASE2_087 about/leadership CSS: story media, purpose cards, portrait grid", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const about = read("views/blessboard/v5/public/about.ejs");
    const leadership = read("views/blessboard/v5/public/leadership.ejs");
    assert.match(about, /44492f6abbe849d0a8a89303ce83129b/);
    assert.match(about, /3f0b8a5c30544d9495064df8d5f9e62e/);
    assert.match(about, /aboutDemoFallback/);
    assert.match(leadership, /372faa60f8df4983b627db3cb5d35f9d/);
    assert.match(leadership, /0f4e816fd64d4592bd3677fbde3b7544/);
    assert.match(leadership, /leadershipDemoFallback/);
    assert.match(leadership, /Join a Ministry/);
    assert.match(css, /\.bb-tp-about-story__media \.bb-tp-media[\s\S]*?aspect-ratio:\s*4\s*\/\s*3/);
    assert.match(css, /\.bb-tp-purpose-card--accent[\s\S]*?background:\s*var\(--bb-violet\)/);
    assert.match(css, /\.bb-tp-featured-leader__media img[\s\S]*?aspect-ratio:\s*4\s*\/\s*5/);
    assert.match(css, /\.bb-tp-leader-card__media[\s\S]*?aspect-ratio:\s*4\s*\/\s*5/);
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
    assert.match(ministries, /f146cdccadb34ff3bd8b0b75a0450d15/);
    assert.match(ministries, /d2fd7ecc586541d3beb5d0d3bed98d56/);
    assert.match(events, /6f618576f0304982bd239bfe04946e72/);
    assert.match(sermons, /4f4995dc4ec84354ac80ed022a767ef3/);
    assert.match(contact, /ab93d842bf2e49caa838a1fd414eb35b/);
    assert.match(giving, /59c8fdedf68a43e3a5d2384b0c2212df/);
    assert.match(model, /ministriesDemoFallback/);
    assert.match(model, /eventsDemoFallback/);
    assert.match(model, /sermonsDemoFallback/);
    assert.match(model, /contactDemoFallback/);
    assert.match(model, /givingDemoFallback/);
    assert.match(model, /Contact the church office for published giving instructions/);
    assert.match(giving, /data-bb-giving-testing/);
    assert.match(contact, /data-bb-contact-hours/);
    assert.match(css, /\.bb-tp-contact-hours/);
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
