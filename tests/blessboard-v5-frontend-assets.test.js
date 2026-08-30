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
  apex: "16",
  apexAuth: "6",
  tenantPublic: "54",
  tenantAuth: "14",
  memberPortal: "22",
  branchAdmin: "38",
  hqAdmin: "56",
  platformAdmin: "62",
  mediaPickerCss: "8",
  mediaPickerJs: "6",
  designSystemJs: "3",
  shellNav: "3",
  tenantPublicJs: "10",
};

describe("blessboard v5 frontend assets — includes and cache busting", () => {
  it("apex shell loads apex-auth.css only on account pages", () => {
    const start = read("views/blessboard/v5/partials/apex-shell-start.ejs");
    assert.match(start, /activeNav === 'account'/);
    assert.match(start, new RegExp(`apex-auth\\.css\\?v=${VERSIONS.apexAuth}`));
    assert.match(start, new RegExp(`apex\\.css\\?v=${VERSIONS.apex}`));
    assert.match(start, /activeNav === 'register-church'/);
    assert.match(start, /ac-phone-field\.css\?v=bb-reg-1/);
    const end = read("views/blessboard/v5/partials/apex-shell-end.ejs");
    assert.match(end, /ac-phone-field\.js\?v=bb-reg-1/);
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
    assert.match(model, /cssHref:\s*"\/blessboard\/v5\/tenant-public\.css\?v=54"/);
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
    assert.match(contact, /bb-tp-contact-message__status|data-bb-contact-form="unavailable"/);
    assert.doesNotMatch(contact, /<form[\s>]/i);
    assert.doesNotMatch(contact, /method=["']post["']/i);

    assert.match(model, /softFillDemoEventImages/);
    assert.match(model, /softFillDemoSermonImages/);
    assert.match(model, /cssHref:\s*"\/blessboard\/v5\/tenant-public\.css\?v=54"/);
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
    assert.match(home, /showHomeAbout/);
    assert.match(home, /teasers\.ministries\.slice\(0, 3\)/);
    assert.match(home, /teasers\.events\.slice\(0, 2\)/);
    assert.match(css, /\.bb-tp-hero--phase7/);
    assert.match(css, /\.bb-tp-hero\.bb-tp-hero--phase7|\.bb-tp-hero--phase7[\s\S]*?max-height:\s*min\(/);
    assert.match(css, /aspect-ratio:\s*auto/);
    assert.match(css, /\.bb-tp-service-times--band/);
    assert.match(css, /\.bb-tp-card-grid/);
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /\.bb-tp-nav--desktop[\s\S]*?flex-wrap:\s*nowrap/);
    assert.match(css, /\.bb-tp-drawer__item[\s\S]*?flex:\s*0 0 auto/);
  });

  it("Phase 7 home density: compact sections, footer, and hidden public edit chrome", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const home = read("views/blessboard/v5/public/home.ejs");
    const shellStart = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(css, /\.bb-tp-home-welcome[\s\S]*?padding:\s*2rem 0/);
    assert.match(css, /\.bb-tp-footer__inner[\s\S]*?padding:\s*1\.75rem/);
    assert.match(css, /\.bb-tp-cta-band[\s\S]*?padding:\s*2rem 0/);
    assert.match(home, /websiteAdmin && websiteAdmin\.editingMode/);
    assert.match(shellStart, /bb-tp-nav--desktop/);
    assert.match(shellStart, /data-bb-nav="mobile-drawer"/);
    assert.doesNotMatch(home, /data-bb-inline-edit(?![^<]*websiteAdmin)/);
    // Shell class `body.bb-tp-body` must not inherit prose `white-space: pre-wrap`
    // (that preserved template newlines and inflated sticky header / hero gap).
    assert.match(css, /body\.bb-tp-body\s*\{[^}]*white-space:\s*normal/);
    assert.match(css, /\.bb-tp-body:not\(body\)\s*\{[^}]*white-space:\s*pre-wrap/);
    assert.match(css, /\.bb-tp-branch-switcher:not\(\[open\]\)\s*>\s*\.bb-tp-branch-switcher__panel/);
    assert.match(css, /\.bb-tp-event-card\s*\{[^}]*position:\s*relative/);
  });

  it("PHASE2_087 about/leadership CSS: story media, purpose cards, portrait grid", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const about = read("views/blessboard/v5/public/about.ejs");
    const leadership = read("views/blessboard/v5/public/leadership.ejs");
    assert.match(about, /3736c7550483404282d5ba9914962c40/);
    assert.match(about, /aboutDemoFallback/);
    assert.match(about, /bb-tp-prose-narrow/);
    assert.match(about, /genericSections\.filter/);
    assert.match(leadership, /4d525f9fbba9482f91fadc28ef650d13/);
    assert.match(leadership, /leadershipDemoFallback/);
    assert.match(leadership, /Join a Ministry/);
    assert.match(leadership, /featuredBioMax|teamBioMax/);
    assert.match(css, /\.bb-tp-about-story__media|\.bb-tp-about-gallery/);
    assert.match(css, /\.bb-tp-purpose-card--accent|\.bb-tp-cta-band/);
    assert.match(css, /\.bb-tp-leader-card--featured|\.bb-tp-leader-card__media/);
    assert.match(css, /\.bb-tp-leadership-grid__title-mobile/);
    assert.match(css, /\.bb-tp-prose-narrow/);
    assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
    assert.match(css, /\.bb-tp-leader-grid[\s\S]*?repeat\(3,/);
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
    assert.match(ministries, /ministrySummary/);
    assert.doesNotMatch(ministries, /bb-tp-ministry-card--featured/);
    assert.match(events, /a68314c0d6a34e0a824ad1a2b309c4ad/);
    assert.match(sermons, /d85d37f3bba84ac48d8d3f24b01b2010/);
    assert.match(contact, /28ba746495424a66a10cf5fb11916dec/);
    assert.match(giving, /e4fe61fbb9eb4b0987ca150d078aa76c/);
    assert.match(model, /ministriesDemoFallback/);
    assert.match(model, /eventsDemoFallback/);
    assert.match(model, /sermonsDemoFallback/);
    assert.match(model, /contactDemoFallback/);
    assert.match(model, /givingDemoFallback/);
    assert.match(model, /scrubGivingSecrets/);
    assert.match(giving, /data-bb-giving-testing/);
    assert.match(giving, /data-bb-giving-scope-label/);
    assert.match(giving, /data-bb-copy-ref/);
    assert.match(giving, /data-bb-giving-disclaimer/);
    assert.match(giving, /parseAccountRows|isCopyableReference/);
    assert.match(model, /scope:\s*branchId \? "branch" : "church"/);
    assert.match(contact, /data-bb-contact-hours/);
    assert.match(css, /\.bb-tp-contact-hours/);
    assert.match(css, /\.bb-tp-giving-why__grid/);
    assert.match(css, /\.bb-tp-giving-grid[\s\S]*?repeat\(3,/);
    assert.match(css, /\.bb-tp-giving-card__copy/);
    assert.match(css, /\.bb-tp-giving-card__qr img/);
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /\.bb-tp-ministry-card__summary[\s\S]*?-webkit-line-clamp:\s*3/);
  });

  it("Prompt 4 shared ALM density: equal ministry cards, square portraits, shell v50", () => {
    const shell = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    const leaderCard = read("views/blessboard/v5/public/partials/leader-card.ejs");
    assert.match(shell, /tenant-public\.css\?v=54/);
    assert.match(css, /Prompt 4: About \/ Leadership \/ Ministries density/);
    assert.match(leaderCard, /bioMax/);
    assert.match(css, /\.bb-tp-leader-card:not\(\.bb-tp-leader-card--featured\)[\s\S]*?aspect-ratio:\s*1\s*\/\s*1/);
  });

  it("Prompt 5 ESC density: event/sermon clamps, contact form state, compact footer", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    const events = read("views/blessboard/v5/public/events.ejs");
    const sermons = read("views/blessboard/v5/public/sermons.ejs");
    const contact = read("views/blessboard/v5/public/contact.ejs");
    const js = read("public/blessboard/v5/tenant-public.js");
    assert.match(css, /Prompt 5: Events \/ Sermons \/ Contact \/ nav \/ footer density/);
    assert.match(css, /\.bb-tp-event-card__facts|\.bb-tp-event-card__summary/);
    assert.match(css, /\.bb-tp-contact-message__status/);
    assert.match(css, /\.bb-tp-footer__tagline[\s\S]*?-webkit-line-clamp:\s*2/);
    assert.match(events, /eventSummary/);
    assert.match(sermons, /sermonSummary/);
    assert.match(contact, /bb-tp-contact-message__status|data-bb-contact-form="unavailable"/);
    assert.match(js, /Escape/);
    assert.match(js, /focusableInDrawer|bb-tp-drawer-open/);
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
      // Section/CMS media blocks (single-line tags). The alt attribute carries
      // authored alt text, so match any value while still requiring dimensions.
      const sectionMedia =
        src.match(
          /<img class="bb-tp-media" src="<%=?[\s\S]*?%>" alt="[\s\S]*?" width="\d+" height="\d+" loading="lazy"[^/]*\/>/g
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
