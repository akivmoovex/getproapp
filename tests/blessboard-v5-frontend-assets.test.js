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
  designSystem: "5",
  apex: "12",
  apexAuth: "6",
  tenantPublic: "28",
  tenantAuth: "13",
  memberPortal: "22",
  branchAdmin: "37",
  hqAdmin: "54",
  platformAdmin: "30",
  mediaPickerCss: "8",
  mediaPickerJs: "6",
  designSystemJs: "3",
  shellNav: "2",
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

  it("content preview loads design-system head and versioned public CSS", () => {
    const preview = read("views/blessboard/v5/content-admin/preview.ejs");
    assert.match(preview, /head-design-system/);
    assert.match(preview, new RegExp(`tenant-public\\.css\\?v=${VERSIONS.tenantPublic}`));
    assert.match(preview, new RegExp(`hq-admin\\.css\\?v=${VERSIONS.hqAdmin}`));
    assert.match(preview, new RegExp(`branch-admin\\.css\\?v=${VERSIONS.branchAdmin}`));
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
