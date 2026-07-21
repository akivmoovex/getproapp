"use strict";

/**
 * BlessBoard V5 responsive / accessibility structure contracts.
 * No layout redesign assertions — landmarks, drawers, focus CSS, reduced motion, media picker.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("blessboard v5 a11y structure — shells", () => {
  const shells = [
    {
      name: "hq",
      start: "views/blessboard/v5/partials/hq-shell-start.ejs",
      end: "views/blessboard/v5/partials/hq-shell-end.ejs",
      skip: "#bb-hq-main",
      main: 'id="bb-hq-main"',
      drawer: "bb-hq-drawer",
      toggle: 'aria-controls="bb-hq-drawer"',
      css: "public/blessboard/v5/hq-admin.css",
      body: "bb-hq-body",
      openClass: "bb-hq-drawer-open",
    },
    {
      name: "branch",
      start: "views/blessboard/v5/partials/branch-admin-shell-start.ejs",
      end: "views/blessboard/v5/partials/branch-admin-shell-end.ejs",
      skip: "#bb-ba-main",
      main: 'id="bb-ba-main"',
      drawer: "bb-ba-drawer",
      toggle: 'aria-controls="bb-ba-drawer"',
      css: "public/blessboard/v5/branch-admin.css",
      body: "bb-ba-body",
      openClass: "bb-ba-drawer-open",
    },
    {
      name: "member",
      start: "views/blessboard/v5/partials/member-shell-start.ejs",
      end: "views/blessboard/v5/partials/member-shell-end.ejs",
      skip: "#bb-mp-main",
      main: 'id="bb-mp-main"',
      drawer: "bb-mp-drawer",
      toggle: 'aria-controls="bb-mp-drawer"',
      css: "public/blessboard/v5/member-portal.css",
      body: "bb-mp-body",
      openClass: "bb-mp-drawer-open",
    },
    {
      name: "platform",
      start: "views/blessboard/v5/partials/platform-admin-shell-start.ejs",
      end: "views/blessboard/v5/partials/platform-admin-shell-end.ejs",
      skip: "#bb-pa-main",
      main: 'id="bb-pa-main"',
      drawer: "bb-pa-drawer",
      toggle: 'aria-controls="bb-pa-drawer"',
      css: "public/blessboard/v5/platform-admin.css",
      body: "bb-pa-body",
      openClass: "bb-pa-drawer-open",
    },
  ];

  for (const shell of shells) {
    it(`${shell.name} shell has skip link, main landmark, and drawer wiring`, () => {
      const start = read(shell.start);
      const end = read(shell.end);
      assert.match(start, new RegExp(`href="${shell.skip}"`));
      assert.match(start, new RegExp(shell.main));
      assert.match(start, new RegExp(`id="${shell.drawer}"`));
      assert.match(start, new RegExp(shell.toggle));
      assert.match(start, /aria-expanded="false"/);
      assert.match(end, /shell-nav\.js/);
      if (shell.name === "hq") {
        assert.match(start, /role="dialog"/);
        assert.match(start, /aria-modal="true"/);
        assert.match(start, /\binert\b/);
        assert.match(start, /tabindex="-1"/);
        assert.match(start, /bb-hq-drawer__close/);
        assert.match(start, /data-bb-footer="drawer"/);
        assert.match(start, /powered-by-getpro|bb-powered-by/);
        assert.match(start, /data-bb-hq-role/);
        assert.match(start, /data-bb-page-area/);
        assert.match(start, /data-bb-stitch-shell="51-hq-dashboard"/);
        assert.match(start, /aria-label="Open navigation"/);
        assert.match(start, /data-bb-nav="mobile-drawer"/);
        assert.match(start, /bb-shell-burger/);
        assert.doesNotMatch(end, /data-bb-nav="mobile-tabs"/);
        assert.match(end, /powered-by-getpro/);
        assert.doesNotMatch(start, /href="\/hq\/broadcast"/i);
        assert.doesNotMatch(start, /Broadcasts?/i);
        assert.doesNotMatch(start, /data-bb-component="branch-selector"/);
        assert.doesNotMatch(start, /data-bb-empty="branches"/);
      }
      if (shell.name === "member") {
        assert.match(start, /role="dialog"/);
        assert.match(start, /aria-modal="true"/);
        assert.match(start, /\binert\b/);
        assert.match(start, /tabindex="-1"/);
        assert.match(start, /bb-mp-drawer__close/);
        assert.match(start, /data-bb-footer="drawer"/);
        assert.match(start, /powered-by-getpro/);
        assert.match(start, /data-bb-member-role/);
        assert.match(start, /data-bb-page-area/);
        assert.match(start, /aria-label="Open navigation"/);
        assert.match(start, /bb-shell-burger/);
        assert.doesNotMatch(end, /data-bb-nav="mobile-tabs"/);
        assert.match(end, /powered-by-getpro/);
        assert.doesNotMatch(start, /href="\/member\/prayer"/);
        assert.doesNotMatch(start, /notifications/i);
      }
      if (shell.name === "branch") {
        assert.match(start, /role="dialog"/);
        assert.match(start, /aria-modal="true"/);
        assert.match(start, /\binert\b/);
        assert.match(start, /tabindex="-1"/);
        assert.match(start, /bb-ba-drawer__close/);
        assert.match(start, /data-bb-footer="drawer"/);
        assert.match(start, /powered-by-getpro|bb-powered-by/);
        assert.match(start, /data-bb-branch-role/);
        assert.match(start, /data-bb-page-area/);
        assert.match(start, /data-bb-stitch-shell="25-branch-admin-dashboard"/);
        assert.match(start, /aria-label="Open navigation"/);
        assert.match(start, /data-bb-nav="mobile-drawer"/);
        assert.match(start, /bb-shell-burger/);
        assert.doesNotMatch(end, /data-bb-nav="mobile-tabs"/);
        assert.match(end, /powered-by-getpro/);
        assert.doesNotMatch(start, /href="\/branch-admin\/reports"/);
        assert.doesNotMatch(start, /Support/i);
      }
      if (shell.name === "platform") {
        assert.match(start, /role="dialog"/);
        assert.match(start, /aria-modal="true"/);
        assert.match(start, /\binert\b/);
        assert.match(start, /tabindex="-1"/);
        assert.match(start, /bb-pa-drawer__close/);
        assert.match(start, /data-bb-footer="drawer"/);
        assert.match(start, /powered-by-getpro|bb-powered-by/);
        assert.match(start, /data-bb-pa-role/);
        assert.match(start, /data-bb-page-area/);
        assert.match(start, /data-bb-stitch-shell="62-platform-admin-dashboard"/);
        assert.match(start, /aria-label="Open navigation"/);
        assert.match(start, /aria-controls="bb-pa-drawer"/);
        assert.match(start, /data-bb-nav="mobile-drawer"/);
        assert.match(start, /data-bb-nav="mobile-toggle"/);
        assert.match(start, /bb-pa-nav-toggle__bar/);
        assert.match(start, /id="bb-shell-nav-live"/);
        assert.match(start, /aria-label="Close navigation"/);
        assert.doesNotMatch(end, /data-bb-nav="mobile-tabs"/);
        assert.match(end, /powered-by-getpro/);
        assert.match(end, /desktopMediaQuery/);
        assert.doesNotMatch(start, /href="\/admin\/organizations\/new"/);
        assert.doesNotMatch(start, /Support Tickets|Open Tickets|Platform Health|MRR|Tenants/i);
        assert.doesNotMatch(end, /Health|Tenants/i);
      }
    });

    it(`${shell.name} CSS locks scroll, clips overflow, exposes focus-visible and reduced motion`, () => {
      const css = read(shell.css);
      assert.match(css, new RegExp(`${shell.openClass}[^{]*\\{[^}]*overflow:\\s*hidden`));
      assert.match(css, new RegExp(`${shell.body}[^{]*\\{[^}]*overflow-x:\\s*clip`));
      assert.match(css, /:focus-visible/);
      assert.match(css, /prefers-reduced-motion:\s*reduce/);
      assert.match(css, /--bb-touch-min|min-height:\s*var\(--bb-touch-min/);
      if (shell.name === "hq") {
        assert.match(css, /\.bb-hq-bottom__link > span:last-child/);
        assert.match(css, /\.bb-hq-bottom\s*\{[^}]*display:\s*none\s*!important/);
        assert.match(css, /\.bb-hq-drawer__footer/);
        assert.match(css, /\.bb-hq-drawer__close/);
        assert.match(css, /\.bb-hq-page\b/);
        assert.match(css, /\.bb-hq-dash\b/);
        assert.match(css, /\.bb-hq-dash-actions__item:focus-visible/);
        assert.match(css, /@media \(max-width:\s*320px\)/);
        assert.match(css, /@media \(min-width:\s*900px\)/);
      }
      if (shell.name === "member") {
        assert.match(css, /\.bb-mp-ann-filter:focus-visible/);
        assert.match(css, /\.bb-mp-part-card:focus-visible/);
        assert.match(css, /\.bb-mp-req-type:focus-within/);
        assert.match(css, /\.bb-mp-bottom__link > span:last-child/);
        assert.match(css, /\.bb-mp-bottom\s*\{[^}]*display:\s*none\s*!important/);
        assert.match(css, /\.bb-mp-drawer__footer/);
        assert.match(css, /\.bb-mp-form--profile\.is-view/);
        assert.match(css, /@media \(max-width:\s*320px\)/);
        assert.match(css, /@media \(min-width:\s*900px\)/);
      }
      if (shell.name === "branch") {
        assert.match(css, /\.bb-ba-bottom__link > span:last-child/);
        assert.match(css, /\.bb-ba-bottom\s*\{[^}]*display:\s*none\s*!important/);
        assert.match(css, /\.bb-ba-drawer__footer/);
        assert.match(css, /\.bb-ba-drawer__close/);
        assert.match(css, /\.bb-ba-page\b/);
        assert.match(css, /\.bb-ba-dash-stats/);
        assert.match(css, /\.bb-ba-dash-actions__item:focus-visible/);
        assert.match(css, /@media \(max-width:\s*320px\)/);
        assert.match(css, /@media \(min-width:\s*900px\)/);
      }
      if (shell.name === "platform") {
        assert.match(css, /\.bb-pa-bottom__link > span:last-child/);
        assert.match(css, /\.bb-pa-drawer__footer/);
        assert.match(css, /\.bb-pa-drawer__close/);
        assert.match(css, /\.bb-pa-page\b/);
        assert.match(css, /\.bb-pa-dash\b/);
        assert.match(css, /\.bb-pa-dash-actions__item:focus-visible/);
        assert.match(css, /#283236/);
        assert.match(css, /\.bb-pa-nav-toggle__bar/);
        assert.match(css, /\.bb-pa-drawer__panel\s*\{[^}]*left:\s*0/);
        assert.match(css, /\.bb-pa-bottom\s*\{[^}]*display:\s*none\s*!important/);
        assert.match(css, /@media \(max-width:\s*320px\)/);
        assert.match(css, /@media \(min-width:\s*900px\)/);
      }
    });
  }

  it("platform mobile nav uses burger drawer (no bottom tab strip)", () => {
    const css = read("public/blessboard/v5/platform-admin.css");
    const start = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    const end = read("views/blessboard/v5/partials/platform-admin-shell-end.ejs");
    const nav = read("src/platform/http/platformAdminNav.js");
    assert.match(nav, /PLATFORM_ADMIN_NAV/);
    assert.match(start, /aria-label="Open navigation"/);
    assert.match(start, /data-bb-nav="mobile-toggle"/);
    assert.match(start, /data-bb-nav="mobile-drawer"/);
    assert.doesNotMatch(end, /data-bb-nav="mobile-tabs"/);
    assert.match(css, /\.bb-pa-bottom\s*\{[^}]*display:\s*none\s*!important/);
    assert.doesNotMatch(css, /\.bb-pa-bottom\s*\{[^}]*repeat\(4,/);
  });

  it("tenant public shell keeps Escape focus trap and reduced motion", () => {
    const start = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const end = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    const js = read("public/blessboard/v5/tenant-public.js");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(start, /href="#bb-tp-main"/);
    assert.match(start, /id="bb-tp-main"/);
    assert.match(start, /tabindex="-1"/);
    assert.match(start, /role="dialog"/);
    assert.match(start, /aria-modal="true"/);
    assert.match(start, /\binert\b/);
    assert.match(start, /id="bb-tp-header"/);
    assert.match(end, /footerNavItems|navItems\.forEach|href="\/leadership"|hrefFor\('\/leadership'\)/);
    assert.match(end, /href="\/contact"|hrefFor\('\/contact'\)/);
    assert.match(end, /powered-by-getpro/);
    assert.match(js, /Escape/);
    assert.match(js, /Tab/);
    assert.match(js, /bb-tp-drawer-open/);
    assert.match(js, /setDrawerInert|inert/);
    assert.match(js, /prefersReducedMotion|prefers-reduced-motion/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /\.bb-tp-nav__link:focus-visible/);
    assert.match(css, /overflow-x:\s*clip/);
    assert.match(css, /@media \(max-width:\s*320px\)/);
    assert.match(css, /--bb-shadow-md/);
    assert.match(css, /width:\s*30px/);
    assert.match(css, /width:\s*24px/);
  });

  it("apex shell retains dialog drawer semantics and reduced motion", () => {
    const start = read("views/blessboard/v5/partials/apex-shell-start.ejs");
    const css = read("public/blessboard/v5/apex.css");
    const js = read("public/blessboard/v5/apex.js");
    assert.match(start, /role="dialog"/);
    assert.match(start, /aria-modal="true"/);
    assert.match(start, /href="#bb-apex-main"/);
    assert.match(start, /id="bb-apex-main"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="bb-apex-main"/);
    assert.match(start, /id="bb-apex-drawer"[^>]*\binert\b|\binert\b[^>]*id="bb-apex-drawer"/);
    assert.match(js, /Escape/);
    assert.match(js, /inert/);
    assert.match(js, /\.focus\(/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /:focus-visible/);
  });
});

describe("blessboard v5 a11y structure — auth landmarks + heading parity", () => {
  it("auth pages use main landmarks and focusable skip targets", () => {
    const login = read("views/blessboard/v5/apex/login.ejs");
    const authError = read("views/blessboard/v5/apex/auth-error.ejs");
    const register = read("views/blessboard/v5/public/register.ejs");
    const submitted = read("views/blessboard/v5/public/register-submitted.ejs");
    assert.match(login, /<main[^>]*class="bb-auth-main"/);
    assert.match(login, /id="bb-auth-login-form"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="bb-auth-login-form"/);
    assert.match(authError, /<main[^>]*id="bb-auth-error-main"/);
    assert.match(authError, /id="bb-auth-error-main"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="bb-auth-error-main"/);
    assert.match(register, /<main[^>]*class="bb-auth-main"/);
    assert.match(register, /id="bb-auth-form"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="bb-auth-form"/);
    assert.match(submitted, /<main[^>]*class="bb-auth-main"/);
    assert.match(submitted, /id="bb-auth-submitted"[^>]*tabindex="-1"|tabindex="-1"[^>]*id="bb-auth-submitted"/);
  });

  it("branch dashboard keeps a single h1", () => {
    const dash = read("views/blessboard/v5/branch-admin/dashboard.ejs");
    assert.equal((dash.match(/<h1\b/g) || []).length, 1);
    assert.match(dash, /bb-ba-dash__pulse-title/);
    assert.match(dash, /<p class="bb-ba-dash__pulse-title">Daily Pulse<\/p>/);
  });

  it("admin shells expose aria-current for the active page", () => {
    for (const start of [
      "views/blessboard/v5/partials/hq-shell-start.ejs",
      "views/blessboard/v5/partials/branch-admin-shell-start.ejs",
      "views/blessboard/v5/partials/member-shell-start.ejs",
      "views/blessboard/v5/partials/platform-admin-shell-start.ejs",
    ]) {
      assert.match(read(start), /aria-current="page"/);
    }
  });

  it("platform directory tables are named regions", () => {
    assert.match(
      read("views/blessboard/v5/platform-admin/organizations.ejs"),
      /role="region"[^>]*aria-label="Organizations table"|aria-label="Organizations table"[^>]*role="region"/
    );
    assert.match(
      read("views/blessboard/v5/platform-admin/domains.ejs"),
      /aria-label="Domains table"/
    );
    assert.match(
      read("views/blessboard/v5/platform-admin/deployments.ejs"),
      /aria-label="Deployments table"/
    );
    assert.match(
      read("views/blessboard/v5/platform-admin/subscriptions.ejs"),
      /aria-label="Subscriptions table"/
    );
    assert.match(
      read("views/blessboard/v5/platform-admin/plans.ejs"),
      /aria-label="Plans catalogue table"/
    );
  });
});

describe("blessboard v5 a11y structure — shell-nav + media picker", () => {
  it("shell-nav binds Escape, focus restore, dialog semantics, Tab cycle, link close, and desktop MQ", () => {
    const js = read("public/blessboard/v5/shell-nav.js");
    assert.match(js, /Escape/);
    assert.match(js, /aria-modal/);
    assert.match(js, /role.*dialog|setAttribute\("role", "dialog"\)/);
    assert.match(js, /toggle\.focus/);
    assert.match(js, /Tab/);
    assert.match(js, /inert/);
    assert.match(js, /matchMedia/);
    assert.match(js, /closeOnNavigate/);
    assert.match(js, /Navigation opened|Navigation closed/);
    assert.doesNotMatch(js, /fetch\s*\(/);
  });

  it("media picker dialogs are labelled; focus trap/restore; archive confirm and reduced motion", () => {
    const js = read("public/blessboard/v5/media-picker.js");
    const css = read("public/blessboard/v5/media-picker.css");
    const dsJs = read("public/blessboard/v5/design-system.js");
    const partial = read("views/blessboard/v5/content-admin/media-upload.ejs");
    const baStart = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqStart = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(js, /aria-labelledby/);
    assert.match(js, /aria-modal/);
    assert.match(js, /bb-media-picker-title/);
    assert.match(js, /bb-media-archive-title/);
    assert.match(js, /showModal/);
    assert.match(js, /returnFocusEl/);
    assert.match(js, /onDialogKeydown/);
    assert.match(js, /BlessBoardDesignSystem/);
    assert.match(js, /trapTabKey/);
    assert.match(js, /role="tablist"/);
    assert.match(js, /aria-controls/);
    assert.match(js, /data-bb-media-library-loading/);
    assert.match(js, /data-bb-media-library-q/);
    assert.match(js, /data-bb-media-filter/);
    assert.match(js, /bb-media-library--grid/);
    assert.match(js, /onLibraryKeydown/);
    assert.match(js, /restoreSelectionFromTarget/);
    assert.match(js, /aria-activedescendant/);
    assert.match(js, /setTab\("library"\)/);
    assert.match(js, /data-bb-stitch-media["'],\s*["']shared-ui-states["']/);
    assert.match(js, /setAttribute\(["']role["'],\s*["']option["']\)/);
    assert.doesNotMatch(js, /unsplash|pexels|stock.?image|shutterstock/i);
    assert.doesNotMatch(js, /supabase|STORAGE_KEY|service_role|createSignedUrl/i);
    assert.match(dsJs, /BlessBoardDesignSystem/);
    assert.match(dsJs, /trapTabKey/);
    assert.match(partial, /data-bb-stitch-media="shared-ui-states"/);
    assert.match(partial, /aria-haspopup="dialog"/);
    assert.match(baStart, /loadMediaPicker/);
    assert.match(baStart, /media-picker\.css\?v=8/);
    assert.match(hqStart, /loadMediaPicker/);
    assert.match(hqStart, /media-picker\.css\?v=8/);
    assert.match(read("views/blessboard/v5/announcements/admin-form.ejs"), /loadMediaPicker:\s*true/);
    assert.match(read("views/blessboard/v5/content-admin/page.ejs"), /loadMediaPicker:\s*true/);
    assert.match(js, /data-bb-media-drop-state/);
    assert.match(js, /data-bb-media-success/);
    assert.match(js, /data-bb-media-error-text/);
    assert.match(js, /aria-live="assertive"/);
    assert.match(js, /showSuccess/);
    assert.match(js, /setDropState/);
    assert.match(js, /Please try again\./);
    assert.doesNotMatch(js, /Upload failed:\s*"\s*\+\s*key/);
    assert.doesNotMatch(js, /storageKey|storageBucket|service_role|STORAGE_/);
    assert.match(js, /data-bb-media-detail="1"/);
    assert.match(js, /data-bb-media-lib-meta/);
    assert.match(js, /data-bb-media-detail-archive/);
    assert.match(js, /bb-media-archive-desc/);
    assert.match(js, /data-bb-media-archive-error/);
    assert.match(js, /aria-describedby/);
    assert.match(css, /bb-media-picker-success/);
    assert.match(css, /bb-media-picker-file/);
    assert.match(css, /data-bb-media-drop-state="error"/);
    assert.match(css, /\.bb-media-detail__/);
    assert.match(css, /\.bb-media-confirm__warnings/);
    assert.match(css, /\.bb-media-confirm__error/);
    assert.match(css, /@media \(max-width:\s*699px\)/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /--bb-touch-min/);
    assert.match(css, /--bb-color-primary/);
    assert.match(css, /--bb-radius/);
    assert.match(css, /bb-media-library__empty/);
    assert.match(css, /bb-media-library--grid/);
    assert.match(css, /bb-media-picker-dialog--drawer/);
    assert.match(css, /@media \(max-width:\s*767px\)/);
    assert.match(css, /@media \(max-width:\s*480px\)/);
  });

  it("form error summary partial remains an assertive alert", () => {
    const src = read("views/blessboard/v5/partials/form-errors.ejs");
    assert.match(src, /role="alert"/);
    assert.match(src, /aria-live="assertive"/);
    assert.match(src, /tabindex="-1"/);
  });

  it("member dashboard keeps Stitch sections without fabricated metrics or missing routes", () => {
    const dash = read("views/blessboard/v5/member/dashboard.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(dash, /data-bb-stitch-dashboard="14-member-dashboard"/);
    assert.match(dash, /data-bb-dash-hero="1"/);
    assert.match(dash, /Quick actions/);
    assert.match(dash, /Upcoming events/);
    assert.match(dash, /data-bb-dash-empty="events"/);
    assert.match(dash, /data-bb-dash-empty="announcements"/);
    assert.match(dash, /data-bb-dash-empty="ministries"/);
    assert.match(dash, /aria-labelledby="bb-mp-dash-quick-heading"/);
    assert.doesNotMatch(dash, /href="\/member\/prayer"|href="\/member\/check-in"|Member Directory/i);
    assert.match(css, /\.bb-mp-dash__hero/);
    assert.match(css, /\.bb-mp-dash-actions/);
    assert.match(css, /\.bb-mp-dash-event__date/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });

  it("HQ branch registry keeps searchable list without fabricated metrics", () => {
    const page = read("views/blessboard/v5/hq/branches.ejs");
    const createPage = read("views/blessboard/v5/hq/branch-new.ejs");
    const selector = read("views/blessboard/v5/partials/branch-selector.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(hqShell, /aria-label="Open navigation"/);
    assert.match(hqShell, /data-bb-nav="mobile-toggle"/);
    assert.match(page, /data-bb-hq-branches="1"/);
    assert.match(page, /data-bb-stitch-branches="52-hq-branch-registry"/);
    assert.match(page, /data-bb-branch-filter="1"/);
    assert.match(page, /data-bb-branch-list="1"/);
    assert.match(page, /data-bb-branch-cards="1"/);
    assert.match(page, /data-bb-branch-selector-panel="1"/);
    assert.match(page, /data-bb-empty="branches"/);
    assert.match(page, /data-bb-empty="branch-no-results"/);
    assert.match(page, /name="q"/);
    assert.match(page, /\/hq\/branches\//);
    assert.match(page, /branch\.displayName/);
    assert.match(page, /branch\.key/);
    assert.match(page, /branch\.branchType/);
    assert.match(page, /branch\.isPrimary/);
    assert.doesNotMatch(page, /memberCount|lastReport|Needs Attention|Quick Export|New Branch Registry/i);
    assert.match(page, /href="\/hq\/branches\/new"/);
    assert.match(page, /data-bb-add-branch/);
    assert.match(createPage, /include\('\.\.\/partials\/hq-shell-start'\)/);
    assert.match(createPage, /data-bb-hq-branch-new="1"/);
    assert.match(selector, /data-bb-component="branch-selector"/);
    assert.match(selector, /\/hq\/branches\//);
    assert.doesNotMatch(selector, /branch\.id\b/);
    assert.doesNotMatch(selector, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    assert.match(css, /\.bb-hq-branches\b/);
    assert.match(css, /\.bb-hq-branches-cards/);
    assert.match(css, /\.bb-hq-branches-chip:focus-visible/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("HQ member directory keeps desktop table and mobile cards without private fields", () => {
    const directory = read("views/blessboard/v5/hq/members.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(directory, /data-bb-hq-member-directory="1"/);
    assert.match(directory, /data-bb-stitch-members="28-branch-member-directory"/);
    assert.match(directory, /data-bb-hq-member-filter="1"/);
    assert.match(directory, /data-bb-member-status-chips="1"/);
    assert.match(directory, /data-bb-member-table="1"/);
    assert.match(directory, /data-bb-member-cards="1"/);
    assert.match(directory, /data-bb-member-empty="catalog"/);
    assert.match(directory, /data-bb-member-empty="no-results"/);
    assert.match(directory, /data-bb-branch-selector-panel="1"/);
    assert.match(directory, /data-bb-member-action="view"/);
    assert.match(directory, /name="q"/);
    assert.match(directory, /name="status"/);
    assert.match(directory, /name="branch"/);
    assert.match(directory, /href="\/hq\/members\/<%= item\.id %>"/);
    assert.match(directory, /item\.branchDisplayName|item\.branchKey/);
    assert.match(directory, /item\.phoneDisplay/);
    assert.match(directory, /item\.emailDisplay/);
    assert.doesNotMatch(directory, /type="checkbox"|Export CSV|Bulk|Demographic|Add Member/i);
    assert.doesNotMatch(directory, /email_normalized|phone_normalized|churchId|branchId|user_id|userId/);
    assert.match(css, /\.bb-hq-members-cards/);
    assert.match(css, /\.bb-hq-members-table-wrap/);
    assert.match(css, /\.bb-hq-members-chip:focus-visible/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.bb-hq-members-table-wrap\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.bb-hq-members-cards\s*\{[^}]*display:\s*none/);
  });

  it("HQ roles page keeps landmarks, CSRF, and fixed-role copy only", () => {
    const roles = read("views/blessboard/v5/hq/roles.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const nav = read("src/blessboard/http/hqAdminNav.js");
    assert.match(roles, /data-bb-hq-roles="1"/);
    assert.match(roles, /data-bb-stitch-roles="59-hq-permission-role-management"/);
    assert.match(roles, /aria-label="Staff permissions"/);
    assert.match(roles, /data-bb-hq-role-assign="1"/);
    assert.match(roles, /data-bb-hq-role-revoke="1"/);
    assert.match(roles, /name="<%= csrfField %>"/);
    assert.match(roles, /confirm_assign/);
    assert.match(roles, /confirm_revoke/);
    assert.match(roles, /church_hq_admin/);
    assert.match(roles, /branch_admin/);
    assert.match(roles, /role="navigation"/);
    assert.match(roles, /aria-current="page"/);
    assert.doesNotMatch(roles, /role="tablist"/);
    assert.doesNotMatch(roles, /Ministry Leader|Financial Ledger|permission toggle/i);
    assert.match(nav, /href: "\/hq\/roles"/);
    assert.match(css, /\.bb-hq-roles__summary/);
    assert.match(css, /\.bb-hq-roles__cards-mobile/);
    assert.match(css, /\.bb-hq-roles \.bb-hq-chip:focus-visible/);
    assert.match(css, /@media \(max-width:\s*320px\)[\s\S]*\.bb-hq-roles__summary/);
  });

  it("HQ registration queue keeps desktop table and mobile cards without approval actions", () => {
    const queue = read("views/blessboard/v5/hq/registrations.ejs");
    const detail = read("views/blessboard/v5/hq/registration-detail.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(queue, /data-bb-hq-registration-queue="1"/);
    assert.match(queue, /data-bb-stitch-registrations="26-branch-member-verification-queue"/);
    assert.match(queue, /data-bb-hq-reg-filter="1"/);
    assert.match(queue, /data-bb-reg-status-chips="1"/);
    assert.match(queue, /data-bb-reg-table="1"/);
    assert.match(queue, /data-bb-reg-cards="1"/);
    assert.match(queue, /data-bb-reg-empty="catalog"/);
    assert.match(queue, /data-bb-reg-empty="no-results"/);
    assert.match(queue, /data-bb-reg-checklist="1"/);
    assert.match(queue, /data-bb-branch-selector-panel="1"/);
    assert.match(queue, /data-bb-reg-action="review"/);
    assert.match(queue, /name="q"/);
    assert.match(queue, /name="status"/);
    assert.match(queue, /name="branch"/);
    assert.match(queue, /href="\/hq\/registrations\/<%= item\.id %>"/);
    assert.match(queue, /item\.branchDisplayName|item\.branchKey/);
    assert.match(queue, /item\.phoneDisplay/);
    assert.match(queue, /item\.emailDisplay/);
    assert.doesNotMatch(queue, /data-bb-reg-approve|data-bb-reg-reject|method="post"|name="_csrf"/);
    assert.doesNotMatch(queue, /type="checkbox"|Export CSV|Bulk|Pending KPI|Goal/i);
    assert.doesNotMatch(queue, /email_normalized|phone_normalized|churchId|branchId|user_id|userId/);
    assert.match(detail, /data-bb-hq-registration-detail="1"/);
    assert.doesNotMatch(detail, /data-bb-reg-approve|data-bb-reg-reject|method="post"/);
    assert.match(css, /\.bb-hq-reg-cards/);
    assert.match(css, /\.bb-hq-reg-table-wrap/);
    assert.match(css, /\.bb-hq-reg-chip:focus-visible/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.bb-hq-reg-table-wrap\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.bb-hq-reg-cards\s*\{[^}]*display:\s*none/);
  });

  it("HQ dashboard keeps Stitch sections without fabricated metrics", () => {
    const dash = read("views/blessboard/v5/hq/dashboard.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(dash, /data-bb-hq-dashboard="1"/);
    assert.match(dash, /data-bb-stitch-dashboard="51-hq-dashboard"/);
    assert.match(dash, /data-bb-dash-welcome="1"/);
    assert.match(dash, /data-bb-dash-notices="1"/);
    assert.match(dash, /data-bb-dash-stats="1"/);
    assert.match(dash, /data-bb-dash-branches="1"/);
    assert.match(dash, /data-bb-dash-attention="1"/);
    assert.match(dash, /data-bb-dash-activity="1"/);
    assert.match(dash, /data-bb-dash-trends="1"/);
    assert.match(dash, /data-bb-dash-quick="desktop"/);
    assert.match(dash, /data-bb-dash-quick="mobile"/);
    assert.match(dash, /data-bb-dash-empty="notices"/);
    assert.match(dash, /data-bb-dash-empty="attention"/);
    assert.match(dash, /data-bb-dash-empty="activity"/);
    assert.match(dash, /data-bb-dash-empty="trends"/);
    assert.match(dash, /data-bb-dash-stat-available="<%= availAttr %>"/);
    assert.match(dash, /available:\s*true/);
    assert.match(dash, /available:\s*false/);
    assert.match(dash, /data-bb-component="branch-selector"|branch-selector/);
    assert.match(dash, /\/hq\/branches/);
    assert.match(dash, /\/hq\/registrations/);
    assert.match(dash, /\/hq\/reports/);
    assert.match(dash, /\/hq\/audit/);
    assert.match(dash, /\/hq\/members/);
    assert.match(dash, /\/hq\/announcements/);
    assert.match(dash, /\/hq\/giving/);
    assert.match(dash, /\/hq\/attendance/);
    assert.doesNotMatch(dash, /\/hq\/broadcast/i);
    assert.doesNotMatch(dash, /4,?250|\+12%|Report Overdue|Quick Export|New Branch Registry|Year-to-Date Growth/i);
    assert.match(css, /\.bb-hq-dash\b/);
    assert.match(css, /\.bb-hq-dash-stats/);
    assert.match(css, /\.bb-hq-dash-actions/);
    assert.match(css, /\.bb-hq-dash-stat:focus-visible|\.bb-hq-dash-stat--link:focus-visible/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("platform admin dashboard keeps Stitch sections without fabricated metrics", () => {
    const dash = read("views/blessboard/v5/platform-admin/dashboard.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(dash, /data-bb-pa-dashboard="1"/);
    assert.match(dash, /data-bb-stitch-dashboard="62-platform-admin-dashboard"/);
    assert.match(dash, /System Overview/);
    assert.match(dash, /data-bb-dash-welcome="1"/);
    assert.match(dash, /data-bb-dash-notices="1"/);
    assert.match(dash, /data-bb-dash-stats="1"/);
    assert.match(dash, /data-bb-pa-registration-analytics="1"/);
    assert.match(dash, /data-bb-dash-directory="1"/);
    assert.match(dash, /data-bb-dash-activity="1"/);
    assert.match(dash, /data-bb-dash-health="1"/);
    assert.match(dash, /data-bb-dash-quick="desktop"/);
    assert.match(dash, /data-bb-dash-quick="mobile"/);
    assert.match(dash, /data-bb-dash-empty="notices"/);
    assert.match(dash, /data-bb-dash-empty="activity"/);
    assert.match(dash, /data-bb-dash-empty="health"/);
    assert.match(dash, /data-bb-dash-empty="create-org"/);
    assert.match(dash, /data-bb-dash-stat-available="<%= availAttr %>"/);
    assert.match(dash, /available:\s*true/);
    assert.match(dash, /key:\s*'foundation-recent'/);
    assert.match(dash, /key:\s*'growth-trials'/);
    assert.match(dash, /key:\s*'network-support'/);
    assert.match(dash, /\/admin\/organizations/);
    assert.match(dash, /\/admin\/plans/);
    assert.match(dash, /\/admin\/registration-applications/);
    assert.match(dash, /\/admin\/subscriptions/);
    assert.match(dash, /\/admin\/deployments/);
    assert.match(dash, /\/admin\/account/);
    assert.doesNotMatch(dash, /\/admin\/organizations\/new/);
    assert.doesNotMatch(dash, /\bMRR\b|\+12%|12\.8k|99\.8%|New Organization|Export Report/i);
    assert.match(css, /\.bb-pa-dash\b/);
    assert.match(css, /\.bb-pa-dash-stats/);
    assert.match(css, /\.bb-pa-dash-actions/);
    assert.match(css, /\.bb-pa-dash-stat--link:focus-visible/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("platform admin organizations directory keeps Stitch layout without fabricated metrics", () => {
    const page = read("views/blessboard/v5/platform-admin/organizations.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(page, /data-bb-pa-organizations="1"/);
    assert.match(page, /data-bb-stitch-organizations="63-platform-church-organizations"/);
    assert.match(page, /Organization Governance/);
    assert.match(page, /data-bb-pa-org-filter="1"/);
    assert.match(page, /name="q"/);
    assert.match(page, /name="limit"/);
    assert.match(page, /data-bb-org-table="1"/);
    assert.match(page, /data-bb-org-cards="1"/);
    assert.match(page, /data-bb-pa-empty="catalog"/);
    assert.match(page, /data-bb-pa-empty="no-results"/);
    assert.match(page, /data-bb-pager="organizations"/);
    assert.match(page, /data-bb-count="directory-total"/);
    assert.match(page, /data-bb-first-branch="1"|firstBranchName/);
    assert.match(page, /data-bb-plan-label="1"|planLabel/);
    assert.match(page, /data-bb-linked-registration="1"|registrationApplicationId/);
    assert.match(page, /organizationKey/);
    assert.match(page, /displayName/);
    assert.match(page, /organizationStatus/);
    assert.match(page, /subscriptionStatus/);
    assert.match(page, /bb-pa-orgs-card--/);
    assert.match(page, /statusTone/);
    assert.match(css, /\.bb-pa-orgs-card--ok/);
    assert.match(css, /\.bb-pa-orgs-card--danger/);
    assert.doesNotMatch(page, /\/admin\/organizations\/new/);
    assert.doesNotMatch(page, /Create New Organization|Monthly Revenue|Pending Verifications|\$142k|Export CSV|file_download/i);
    assert.doesNotMatch(page, /\borg\.id\b|organization_id|church_id/i);
    assert.match(page, /Optional filters narrow this same list|No second onboarding or support queue/i);
    assert.match(css, /\.bb-pa-orgs\b/);
    assert.match(css, /\.bb-pa-orgs-cards/);
    assert.match(css, /\.bb-pa-orgs-table-wrap/);
    assert.match(css, /\.bb-pa-orgs-card__link:focus-visible|\.bb-pa-orgs__name-link:focus-visible/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.bb-pa-orgs-table-wrap\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.bb-pa-orgs-cards\s*\{[^}]*display:\s*none/);
  });

  it("platform admin plans catalogue keeps Stitch layout without invented billing KPIs", () => {
    const page = read("views/blessboard/v5/platform-admin/plans.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(page, /data-bb-pa-plans="1"/);
    assert.match(page, /data-bb-pa-plans-directory="1"/);
    assert.match(page, /data-bb-stitch-plans="66-platform-plans-limits"/);
    assert.match(page, /Platform Plans/);
    assert.match(page, /Foundation, Growth, and Network/);
    assert.match(page, /data-bb-pa-plan-grid="1"/);
    assert.match(page, /data-bb-plan-table="1"/);
    assert.match(page, /data-bb-plan-cards="1"/);
    assert.match(page, /data-bb-pa-plans-active="1"/);
    assert.match(page, /data-bb-pa-plans-inactive="1"/);
    assert.match(page, /data-bb-plan-legacy-badge="1"/);
    assert.match(page, /data-bb-plan-key=/);
    assert.match(page, /data-bb-plan-display=/);
    assert.match(page, /data-bb-plan-status=/);
    assert.match(page, /data-bb-pa-plans-notice="1"/);
    assert.match(page, /data-bb-pa-plans-orgs-link="1"/);
    assert.match(page, /href="\/admin\/organizations"/);
    assert.match(page, /plan\.displayName/);
    assert.match(page, /plan\.planKey/);
    assert.match(page, /plan\.features/);
    assert.match(page, /plan\.isActive/);
    assert.match(page, /plan\.isLegacy/);
    assert.doesNotMatch(page, /Create Custom Tier|Configure Parameters|Paid Tenants|Free Tenants|Churn Rate|\bMRR\b/i);
    assert.doesNotMatch(page, /\$249|\$2,?499|Conversion|Uptime SLA|API Throughput|Tenant Slots/i);
    assert.doesNotMatch(page, /plan_key migration|Phase B|rename plan_key/i);
    assert.doesNotMatch(page, /plan_id|organization_id|DATABASE_URL|session_cookie/i);
    assert.doesNotMatch(page, /Create plan|New plan|Add plan/i);
    assert.match(css, /\.bb-pa-plans\b/);
    assert.match(css, /\.bb-pa-plan-grid/);
    assert.match(css, /\.bb-pa-plans-table/);
    assert.match(css, /\.bb-pa-plans-cards/);
    assert.match(css, /\.bb-pa-plan-card--accent/);
    assert.match(css, /\.bb-pa-plan-card__cta:focus-visible/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /@media \(min-width:\s*1200px\)/);
    assert.match(css, /\.bb-pa-plan-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3/);
  });

  it("platform admin subscriptions directory keeps Stitch layout without invented billing", () => {
    const page = read("views/blessboard/v5/platform-admin/subscriptions.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(page, /data-bb-pa-subscriptions="1"/);
    assert.match(page, /data-bb-stitch-subscriptions="66-platform-plans-limits"/);
    assert.match(page, /Subscription configuration/);
    assert.match(page, /Payment collection is not implemented/);
    assert.match(page, /Foundation, Growth, Network/);
    assert.match(page, /data-bb-pa-subs-filter="1"/);
    assert.match(page, /data-bb-subs-table="1"/);
    assert.match(page, /data-bb-subs-cards="1"/);
    assert.match(page, /name="q"/);
    assert.match(page, /name="status"/);
    assert.match(page, /name="limit"/);
    assert.match(page, /data-bb-sub-org=/);
    assert.match(page, /data-bb-sub-plan-key=/);
    assert.match(page, /data-bb-sub-plan-display=/);
    assert.match(page, /data-bb-sub-status=/);
    assert.match(page, /#pa-org-subscription/);
    assert.match(page, /row\.planDisplayName/);
    assert.match(page, /row\.planKey/);
    assert.match(page, /row\.startsAt/);
    assert.match(page, /row\.endsAt/);
    assert.doesNotMatch(page, /\$\d+|invoice|checkout|refund|\bMRR\b|stripe|balance due/i);
    assert.doesNotMatch(page, /organization_id|subscription_id|DATABASE_URL/i);
    assert.match(css, /\.bb-pa-subs\b/);
    assert.match(css, /\.bb-pa-subs-table/);
    assert.match(css, /\.bb-pa-subs-cards/);
    assert.match(css, /\.bb-pa-subs-filter/);
    assert.match(css, /\.bb-pa-subs-card__cta:focus-visible/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("platform admin organization detail keeps Stitch layout with preserved entitlement actions", () => {
    const page = read("views/blessboard/v5/platform-admin/organization-detail.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(page, /data-bb-pa-organization-detail="1"/);
    assert.match(page, /data-bb-stitch-organization-detail="65-platform-branch-tenants"/);
    assert.match(page, /data-bb-pa-org-summary="1"/);
    assert.match(page, /data-bb-pa-org-catalogue="1"/);
    assert.match(page, /data-bb-pa-org-domains="1"/);
    assert.match(page, /data-bb-stitch-org-domains="67-platform-settings"/);
    assert.match(page, /data-bb-pa-org-branches="1"/);
    assert.match(page, /data-bb-pa-subscription-config="1"/);
    assert.match(page, /id="pa-org-subscription"/);
    assert.match(page, /data-bb-pa-org-entitlements="1"/);
    assert.match(page, /data-bb-stitch-entitlements="66-platform-plans-limits"/);
    assert.match(page, /data-bb-pa-entitlement-groups="1"/);
    assert.match(page, /data-bb-entitlement-group="limits"/);
    assert.match(page, /data-bb-entitlement-group="capabilities"/);
    assert.match(page, /data-bb-pa-entitlement-sources="1"/);
    assert.match(page, /data-bb-entitlement-source="plan"/);
    assert.match(page, /data-bb-entitlement-source="override"/);
    assert.match(page, /data-bb-feature-state=/);
    assert.match(page, /data-bb-feature-source=/);
    assert.match(page, /data-bb-pa-usage="1"/);
    assert.match(page, /data-bb-pa-org-overrides="1"/);
    assert.match(page, /data-bb-pa-plan-form="1"/);
    assert.match(page, /data-bb-pa-override-form="1"/);
    assert.match(page, /name="plan_key"/);
    assert.match(page, /name="confirm_plan_change"/);
    assert.match(page, /name="confirm_override"/);
    assert.match(page, /name="feature_key"/);
    assert.match(page, /name="reason"/);
    assert.match(page, /optgroup label="Capacity limits"/);
    assert.match(page, /optgroup label="Capability flags"/);
    assert.match(page, /action="\/admin\/organizations\/<%= org\.organizationKey %>\/plan"/);
    assert.match(page, /action="\/admin\/organizations\/<%= org\.organizationKey %>\/entitlement-override"/);
    assert.match(page, /bb-pa-org-detail__ro/);
    assert.match(page, /bb-pa-org-detail__edit/);
    assert.match(page, /Inherited from plan/);
    assert.match(page, /Organization override/);
    assert.doesNotMatch(page, /free-form|invented entitlement|white-label portal|24\/7 Priority/i);
    assert.doesNotMatch(page, /Export CSV|New Branch|impersonat|DATABASE_URL|connection string|\$249|payment gateway/i);
    assert.match(css, /\.bb-pa-org-detail\b/);
    assert.match(css, /\.bb-pa-entitlements\b/);
    assert.match(css, /\.bb-pa-entitlement-group/);
    assert.match(css, /\.bb-pa-entitlement-cards/);
    assert.match(css, /\.bb-pa-entitlements-sources/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("platform admin settings keeps Stitch DNS patterns without automation or save controls", () => {
    const page = read("views/blessboard/v5/platform-admin/settings.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(page, /aria-label="Breadcrumb"/);
    assert.match(page, /href="\/admin"/);
    assert.match(page, /data-bb-pa-settings="1"/);
    assert.match(page, /data-bb-stitch-settings="67-platform-settings"/);
    assert.match(page, /data-bb-pa-dns-patterns="1"/);
    assert.match(page, /data-bb-pa-hostname-pattern="1"/);
    assert.match(page, /data-bb-pa-settings-deployment="1"/);
    assert.match(page, /data-bb-pa-settings-reserved="1"/);
    assert.match(page, /data-bb-pa-settings-unavailable="1"/);
    assert.match(page, /data-bb-pa-unavailable="branding"/);
    assert.match(page, /data-bb-pa-unavailable="security"/);
    assert.match(page, /data-bb-pa-unavailable="failover"/);
    assert.match(page, /data-bb-pa-unavailable="dns-automation"/);
    assert.match(page, /data-bb-pa-reserved="organization"/);
    assert.match(page, /data-bb-pa-reserved="host"/);
    assert.match(page, /hostnamePattern/);
    assert.match(page, /currentDeployment/);
    assert.match(page, /href="\/admin\/deployments"/);
    assert.doesNotMatch(page, /method="post"|Save Changes|Export Logs|Primary Color|\+ Add Keyword|Reset All Platform Settings/i);
    assert.doesNotMatch(page, /session_cookie|DATABASE_URL/i);
    assert.match(css, /\.bb-pa-settings\b/);
    assert.match(css, /\.bb-pa-settings-grid/);
    assert.match(css, /\.bb-pa-settings-unavailable/);
    assert.match(css, /\.bb-pa-pattern__label/);
    assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*\.bb-pa-settings-grid/);
  });

  it("platform admin deployments directory keeps Stitch layout without ops or secrets", () => {
    const page = read("views/blessboard/v5/platform-admin/deployments.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const repo = read("src/platform/repositories/platformAdminRepository.js");
    const service = read("src/platform/services/listPlatformDeployments.js");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(page, /data-bb-pa-deployments="1"/);
    assert.match(page, /data-bb-pa-deployments-directory="1"/);
    assert.match(page, /data-bb-stitch-deployments="68-platform-support-monitoring"/);
    assert.match(page, /data-bb-pa-deploy-summary="1"/);
    assert.match(page, /data-bb-deploy-table="1"/);
    assert.match(page, /data-bb-deploy-cards="1"/);
    assert.match(page, /data-bb-pa-deploy-unavailable="1"/);
    assert.match(page, /data-bb-deploy-unavailable="ops"/);
    assert.match(page, /data-bb-deploy-unavailable="logs"/);
    assert.match(page, /data-bb-pa-unavailable="deploy"/);
    assert.match(page, /data-bb-pa-unavailable="restart"/);
    assert.match(page, /data-bb-pa-unavailable="rollback"/);
    assert.match(page, /data-bb-pa-unavailable="env-edit"/);
    assert.match(page, /data-bb-pa-unavailable="log-stream"/);
    assert.doesNotMatch(page, /data-bb-pa-unavailable="detail"/);
    assert.match(page, /data-bb-pa-empty="deployments"/);
    assert.match(page, /data-bb-count="deployments-total"/);
    assert.match(page, /data-bb-env-badge=/);
    assert.match(page, /data-bb-status-badge=/);
    assert.match(page, /data-bb-deployment-environment=/);
    assert.match(page, /data-bb-deployment-host=/);
    assert.match(page, /data-bb-deployment-product=/);
    assert.match(page, /href="\/admin\/deployments\/<%= encodeURIComponent\(d\.deploymentCode\) %>"/);
    assert.match(page, /d\.deploymentCode/);
    assert.match(page, /d\.canonicalDomain/);
    assert.match(page, /d\.environmentCode/);
    assert.match(page, /d\.applicationCode/);
    assert.match(page, /d\.status/);
    assert.match(page, /href="\/admin\/settings"/);
    assert.doesNotMatch(page, /method="post"/);
    assert.doesNotMatch(page, /Force Sync|Export Reports|Support Tickets|99\.98%|Critical Error Rate/i);
    assert.doesNotMatch(page, /session_cookie|SESSION_SECRET|DATABASE_URL|credential/i);
    assert.match(repo, /listDeploymentsSafe/);
    assert.match(repo, /findDeploymentSafeByCode/);
    assert.match(repo, /listDomainsForDeploymentSafe/);
    assert.doesNotMatch(repo, /session_cookie_name/);
    assert.match(service, /presentDeployment/);
    assert.doesNotMatch(service, /session_cookie|DATABASE_URL|SESSION_SECRET/);
    assert.match(css, /\.bb-pa-deployments\b/);
    assert.match(css, /\.bb-pa-deploy-summary/);
    assert.match(css, /\.bb-pa-deploy-cards/);
    assert.match(css, /\.bb-pa-deploy-table-wrap/);
    assert.match(css, /\.bb-pa-deploy-card__badges/);
    assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*\.bb-pa-deploy-table-wrap\.bb-pa-show-desktop/);
  });

  it("platform admin deployment detail keeps safe diagnostics without secrets or ops", () => {
    const page = read("views/blessboard/v5/platform-admin/deployment-detail.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const service = read("src/platform/services/getPlatformDeploymentDetail.js");
    const routes = read("src/platform/http/platformAdminRoutes.js");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(page, /data-bb-pa-deployment-detail="1"/);
    assert.match(page, /aria-label="Breadcrumb"/);
    assert.match(page, /data-bb-stitch-deployment-detail="68-platform-support-monitoring"/);
    assert.match(page, /data-bb-pa-deploy-summary-panel="1"/);
    assert.match(page, /data-bb-pa-deploy-environment="1"/);
    assert.match(page, /data-bb-pa-deploy-products="1"/);
    assert.match(page, /data-bb-pa-deploy-domains="1"/);
    assert.match(page, /data-bb-pa-deploy-diagnostics="1"/);
    assert.match(page, /data-bb-pa-diag=/);
    assert.match(page, /data-bb-pa-diag-state=/);
    assert.match(page, /data-bb-pa-deploy-detail-unavailable="1"/);
    assert.match(page, /data-bb-pa-unavailable="env-edit"/);
    assert.match(page, /data-bb-pa-unavailable="process-control"/);
    assert.match(page, /data-bb-pa-unavailable="log-access"/);
    assert.match(page, /data-bb-pa-unavailable="secrets"/);
    assert.match(page, /data-bb-pa-empty="deploy-products"/);
    assert.match(page, /data-bb-pa-empty="deploy-domains"/);
    assert.match(page, /href="\/admin\/deployments"/);
    assert.doesNotMatch(page, /method="post"/);
    assert.doesNotMatch(page, /session_cookie|SESSION_SECRET|DATABASE_URL|credential/i);
    assert.doesNotMatch(page, /Force Sync|Export Reports|Support Tickets|99\.98%|Critical Error Rate/i);
    assert.match(service, /getPlatformDeploymentDetail/);
    assert.match(service, /buildSafeDiagnostics/);
    assert.match(service, /getPlatformDeploymentCode/);
    assert.doesNotMatch(service, /session_cookie_name|DATABASE_URL|SESSION_SECRET|transfer.?token|token_hash/);
    assert.match(routes, /\/admin\/deployments\/:deploymentCode/);
    assert.match(routes, /getPlatformDeploymentDetail/);
    assert.match(css, /\.bb-pa-deployment-detail\b/);
    assert.match(css, /\.bb-pa-deploy-diag-list/);
    assert.match(css, /\.bb-pa-deploy-product-list/);
    assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*\.bb-pa-deployment-detail-grid/);
  });

  it("platform admin domains directory keeps Stitch layout without DNS or certificate automation", () => {
    const page = read("views/blessboard/v5/platform-admin/domains.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const nav = read("src/platform/http/platformAdminNav.js");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(nav, /href:\s*"\/admin\/domains"/);
    assert.match(page, /data-bb-pa-domains="1"/);
    assert.match(page, /data-bb-pa-domains-directory="1"/);
    assert.match(page, /data-bb-stitch-domains="67-platform-settings"/);
    assert.match(page, /data-bb-pa-domains-filter="1"/);
    assert.match(page, /data-bb-domains-table="1"/);
    assert.match(page, /data-bb-domains-cards="1"/);
    assert.match(page, /data-bb-pa-empty="domains"/);
    assert.match(page, /data-bb-pa-empty="no-results"/);
    assert.match(page, /name="q"/);
    assert.match(page, /name="org"/);
    assert.match(page, /name="status"/);
    assert.match(page, /name="type"/);
    assert.match(page, /name="verified"/);
    assert.match(page, /row\.hostname/);
    assert.match(page, /row\.domainType/);
    assert.match(page, /row\.status/);
    assert.match(page, /row\.isVerified/);
    assert.match(page, /row\.organizationKey/);
    assert.match(page, /row\.productKey|productLabel/);
    assert.match(page, /#pa-org-domains/);
    assert.doesNotMatch(page, /method="post"/);
    assert.doesNotMatch(page, /DNS lookup|certificate provisioning|domain purchase|Buy Domain|Force Verify|automatic verification/i);
    assert.doesNotMatch(page, /session_cookie|DATABASE_URL|ResolveHostname|expectedDeploymentCode/i);
    assert.match(css, /\.bb-pa-domains\b/);
    assert.match(css, /\.bb-pa-domains-filter/);
    assert.match(css, /\.bb-pa-domains-table/);
    assert.match(css, /\.bb-pa-domains-cards/);
    assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*\.bb-pa-domains-table-wrap\.bb-pa-show-desktop/);
  });

  it("platform admin domain detail keeps operational vs verification chrome with CSRF forms", () => {
    const page = read("views/blessboard/v5/platform-admin/domain-detail.ejs");
    const css = read("public/blessboard/v5/platform-admin.css");
    const paShell = read("views/blessboard/v5/partials/platform-admin-shell-start.ejs");
    assert.match(paShell, /platform-admin.css\?v=32/);
    assert.match(page, /data-bb-pa-domain-detail="1"/);
    assert.match(page, /aria-label="Breadcrumb"/);
    assert.match(page, /data-bb-stitch-domain-detail="67-platform-settings"/);
    assert.match(page, /data-bb-pa-domain-summary="1"/);
    assert.match(page, /data-bb-pa-domain-states="1"/);
    assert.match(page, /data-bb-domain-state="operational"/);
    assert.match(page, /data-bb-domain-state="verification"/);
    assert.match(page, /data-bb-pa-domain-organization="1"/);
    assert.match(page, /data-bb-pa-domain-org-form="1"/);
    assert.match(page, /data-bb-pa-domain-status-form="1"/);
    assert.match(page, /name="confirm_status"/);
    assert.match(page, /name="confirm_organization"/);
    assert.match(page, /name="organization_key"/);
    assert.match(page, /name="status"/);
    assert.match(page, /name="<%= csrfName %>"|csrfField|csrfToken/);
    assert.match(page, /action="<%= detailPath %>\/status"/);
    assert.match(page, /action="<%= detailPath %>\/organization"/);
    assert.match(page, /data-bb-pa-domain-unavailable="1"/);
    assert.match(page, /data-bb-pa-unavailable="dns"/);
    assert.match(page, /data-bb-pa-unavailable="ssl"/);
    assert.match(page, /data-bb-pa-unavailable="verify-jobs"/);
    assert.doesNotMatch(page, /Buy Domain|Force Verify|certificate issuance job|DNS lookup API/i);
    assert.doesNotMatch(page, /session_cookie|DATABASE_URL|ResolveHostname|expectedDeploymentCode/);
    assert.match(css, /\.bb-pa-domain-detail\b/);
    assert.match(css, /\.bb-pa-domain-detail-grid/);
    assert.match(css, /\.bb-pa-domain-form/);
    assert.match(css, /@media \(min-width:\s*900px\)[\s\S]*\.bb-pa-domain-detail-grid/);
  });

  it("branch admin dashboard keeps Stitch sections without fabricated metrics", () => {
    const dash = read("views/blessboard/v5/branch-admin/dashboard.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const start = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    assert.match(dash, /data-bb-stitch-dashboard="25-branch-admin-dashboard"/);
    assert.match(dash, /data-bb-dash-stats="1"/);
    assert.match(dash, /data-bb-dash-notices="1"/);
    assert.match(dash, /data-bb-dash-activity="1"/);
    assert.match(dash, /data-bb-dash-requests="1"/);
    assert.match(dash, /data-bb-dash-quick="desktop"/);
    assert.match(dash, /data-bb-dash-quick="mobile"/);
    assert.match(dash, /data-bb-dash-empty="notices"/);
    assert.match(dash, /data-bb-dash-empty="activity"/);
    assert.match(dash, /data-bb-dash-empty="requests"/);
    assert.match(dash, /data-bb-dash-stat-available="0"/);
    assert.match(dash, /aria-labelledby="bb-ba-dash-stats-heading"/);
    assert.match(dash, /\/branch-admin\/registrations/);
    assert.match(dash, /\/branch-admin\/announcements\/new/);
    assert.match(dash, /\/branch-admin\/attendance/);
    assert.match(dash, /\/branch-admin\/requests/);
    assert.match(dash, /\/branch-admin\/content\/events/);
    assert.match(dash, /\/branch-admin\/giving/);
    assert.doesNotMatch(dash, /\/branch-admin\/reports/);
    assert.doesNotMatch(dash, /1,248|Ministry Budget|USD 42,000|Assign Deacon|Luka Mwamba/i);
    assert.match(css, /\.bb-ba-dash-stats/);
    assert.match(css, /\.bb-ba-dash-actions/);
    assert.match(css, /\.bb-ba-dash-quick-icons/);
    assert.match(css, /\.bb-ba-dash-stat--desktop-only/);
    assert.match(css, /@media \(max-width:\s*320px\)/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(start, /branch-admin.css\?v=38/);
  });

  it("branch admin account keeps identity summary without unsupported security surfaces", () => {
    const account = read("views/blessboard/v5/branch-admin/account.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    assert.match(account, /data-bb-stitch-account="missing"/);
    assert.match(account, /data-bb-account-identity="1"/);
    assert.match(account, /data-bb-account-context="1"/);
    assert.match(account, /data-bb-account-info="1"/);
    assert.match(account, /data-bb-account-role="1"/);
    assert.match(account, /aria-labelledby="bb-ba-account-heading"/);
    assert.match(account, /method="post"/);
    assert.match(account, /action="\/branch-admin\/logout"/);
    assert.match(account, /name="_csrf"/);
    assert.match(account, /data-bb-account-logout="1"/);
    assert.match(account, /displayName|roleLabel|churchDisplayName|branchDisplayName/);
    assert.doesNotMatch(account, /name="current_password"|name="new_password"|type="file"|href="\/branch-admin\/account\/edit"/i);
    assert.doesNotMatch(account, /emailNormalized|session\.id|user_status/i);
    assert.match(css, /\.bb-ba-account__identity/);
    assert.match(css, /\.bb-ba-account__context/);
    assert.match(css, /\.bb-ba-account__info/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
    assert.match(css, /@media \(max-width:\s*320px\)/);
  });

  it("branch admin settings keeps editable V5 fields and unavailable HQ/product sections", () => {
    const settings = read("views/blessboard/v5/branch-admin/settings.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    assert.match(settings, /data-bb-stitch-settings="missing"/);
    assert.match(settings, /data-bb-settings-nav="1"/);
    assert.match(settings, /data-bb-settings-form="1"/);
    assert.match(settings, /data-bb-settings-section="profile"/);
    assert.match(settings, /data-bb-settings-section="location"/);
    assert.match(settings, /data-bb-settings-readonly="1"/);
    assert.match(settings, /data-bb-settings-unavailable="product"/);
    assert.match(settings, /method="post"/);
    assert.match(settings, /action="\/branch-admin\/settings"/);
    assert.match(settings, /name="publicName"/);
    assert.match(settings, /name="email"/);
    assert.match(settings, /name="phone"/);
    assert.match(settings, /name="timezone"/);
    assert.match(settings, /name="countryCode"/);
    assert.match(settings, /name="addressLine1"/);
    assert.match(settings, /name="addressLine2"/);
    assert.match(settings, /name="city"/);
    assert.match(settings, /name="provinceState"/);
    assert.match(settings, /name="postalCode"/);
    assert.match(settings, /name="latitude"/);
    assert.match(settings, /name="longitude"/);
    assert.match(settings, /name="_csrf"/);
    assert.match(settings, /form-errors|flash-message/);
    assert.doesNotMatch(settings, /name="denomination"|name="websiteStatus"|name="primaryEmail"/);
    assert.doesNotMatch(settings, /name="branding"|name="billing"|type="file"/);
    assert.match(css, /\.bb-ba-settings-nav/);
    assert.match(css, /\.bb-ba-settings-grid/);
    assert.match(css, /\.bb-ba-settings-unavailable/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });

  it("branch admin registration queue keeps desktop table and mobile cards without fabricated metrics", () => {
    const queue = read("views/blessboard/v5/branch-admin/registrations.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    assert.match(queue, /data-bb-stitch-registrations="26-branch-member-verification-queue"/);
    assert.match(queue, /data-bb-reg-filter="1"/);
    assert.match(queue, /data-bb-reg-status-chips="1"/);
    assert.match(queue, /data-bb-reg-table="1"/);
    assert.match(queue, /data-bb-reg-cards="1"/);
    assert.match(queue, /data-bb-reg-empty="catalog"/);
    assert.match(queue, /data-bb-reg-empty="no-results"/);
    assert.match(queue, /data-bb-reg-action="review"/);
    assert.match(queue, /name="q"/);
    assert.match(queue, /name="status"/);
    assert.match(queue, /href="\/branch-admin\/registrations\/<%= item\.id %>"/);
    assert.doesNotMatch(queue, /type="checkbox"|Export List|Today's Subs|High Priority|PRIORITY GUEST/i);
    assert.match(css, /\.bb-ba-reg-cards/);
    assert.match(css, /\.bb-ba-reg-table-wrap/);
    assert.match(css, /\.bb-ba-reg-chip/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.bb-ba-reg-table-wrap\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.bb-ba-reg-cards\s*\{[^}]*display:\s*none/);
  });

  it("branch admin registration detail keeps review modals without unsupported verification chrome", () => {
    const detail = read("views/blessboard/v5/branch-admin/registration-detail.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    assert.match(detail, /data-bb-stitch-registration-detail="26-branch-member-verification-queue"/);
    assert.match(detail, /data-bb-reg-summary="1"/);
    assert.match(detail, /data-bb-reg-submitted="1"/);
    assert.match(detail, /data-bb-reg-history="1"/);
    assert.match(detail, /data-bb-reg-review="1"/);
    assert.match(detail, /data-bb-reg-approve="1"/);
    assert.match(detail, /data-bb-reg-reject="1"/);
    assert.match(detail, /data-bb-ds-modal-open="bb-ba-approve-modal"/);
    assert.match(detail, /data-bb-ds-modal-open="bb-ba-reject-modal"/);
    assert.match(detail, /action="\/branch-admin\/registrations\/<%= reg\.id %>\/approve"/);
    assert.match(detail, /action="\/branch-admin\/registrations\/<%= reg\.id %>\/reject"/);
    assert.match(detail, /name="review_notes"/);
    assert.match(detail, /name="_csrf"/);
    assert.match(detail, /role="dialog"/);
    assert.match(detail, /aria-modal="true"/);
    assert.doesNotMatch(detail, /Identity Document|Background Check|identity score|send message|type="file"/i);
    assert.doesNotMatch(detail, /churchId|branchId|emailNormalized|phoneNormalized/);
    assert.match(css, /\.bb-ba-reg-detail__layout/);
    assert.match(css, /\.bb-ba-reg-summary/);
    assert.match(css, /\.bb-ba-reg-timeline/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("branch admin member directory keeps desktop table and mobile cards without fabricated metrics", () => {
    const directory = read("views/blessboard/v5/branch-admin/members.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(directory, /data-bb-stitch-members="28-branch-member-directory"/);
    assert.match(directory, /data-bb-member-directory="1"/);
    assert.match(directory, /data-bb-member-filter="1"/);
    assert.match(directory, /data-bb-member-status-chips="1"/);
    assert.match(directory, /data-bb-member-table="1"/);
    assert.match(directory, /data-bb-member-cards="1"/);
    assert.match(directory, /data-bb-member-empty="catalog"/);
    assert.match(directory, /data-bb-member-empty="no-results"/);
    assert.match(directory, /data-bb-member-action="view"/);
    assert.match(directory, /name="q"/);
    assert.match(directory, /name="status"/);
    assert.match(directory, /href="\/branch-admin\/members\/<%= item\.id %>"/);
    assert.doesNotMatch(directory, /type="checkbox"|Export CSV|Add Member|Small Groups/i);
    assert.doesNotMatch(directory, /email_normalized|phone_normalized|churchId|branchId/);
    assert.match(css, /\.bb-ba-members-cards/);
    assert.match(css, /\.bb-ba-members-table-wrap/);
    assert.match(css, /\.bb-ba-members-chip/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.bb-ba-members-table-wrap\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.bb-ba-members-cards\s*\{[^}]*display:\s*none/);
  });

  it("branch admin member detail keeps read-only profile sections without unsupported Stitch chrome", () => {
    const detail = read("views/blessboard/v5/branch-admin/member-detail.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    assert.match(detail, /data-bb-stitch-member-detail="27-branch-member-profile"/);
    assert.match(detail, /data-bb-member-detail="1"/);
    assert.match(detail, /data-bb-member-summary="1"/);
    assert.match(detail, /data-bb-member-contact="1"/);
    assert.match(detail, /data-bb-member-membership="1"/);
    assert.match(detail, /data-bb-member-account="1"/);
    assert.match(detail, /data-bb-member-sections="1"/);
    assert.match(detail, /data-bb-member-unavailable="1"/);
    assert.match(detail, /data-bb-member-section-unavailable="attendance"/);
    assert.match(detail, /bb-ba-chip--readonly/);
    assert.match(detail, /Read-only/);
    assert.doesNotMatch(detail, /method="post"|name="_csrf"|name="status"/);
    assert.doesNotMatch(detail, /\bSuspend\b|Add Note|Verify Member|Edit Roles|Assign to Ministry/i);
    assert.doesNotMatch(detail, /email_normalized|phone_normalized|churchId|branchId|userId/);
    assert.doesNotMatch(detail, /Attendance Rate|Volunteer Hours|Birthday|Home Address|ECCL-/i);
    assert.match(css, /\.bb-ba-member-detail__layout/);
    assert.match(css, /\.bb-ba-member-summary/);
    assert.match(css, /\.bb-ba-member-dl/);
    assert.match(css, /\.bb-ba-chip--readonly/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.bb-ba-member-detail__layout\s*\{[^}]*grid-template-columns/);
  });

  it("branch admin announcements keep desktop table and mobile cards without fabricated insights", () => {
    const list = read("views/blessboard/v5/announcements/admin-list.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(list, /35-branch-announcements-management/);
    assert.match(list, /data-bb-announcement-admin-list="1"/);
    assert.match(list, /data-bb-ann-filter="1"/);
    assert.match(list, /data-bb-ann-status-chips="1"/);
    assert.match(list, /data-bb-ann-audience-chips="1"/);
    assert.match(list, /data-bb-ann-table="1"/);
    assert.match(list, /data-bb-ann-cards="1"/);
    assert.match(list, /data-bb-ann-empty="catalog"/);
    assert.match(list, /data-bb-ann-empty="no-results"/);
    assert.match(list, /data-bb-ann-create="1"/);
    assert.match(list, /data-bb-ann-action="open"/);
    assert.match(list, /name="q"/);
    assert.match(list, /name="status"/);
    assert.match(list, /name="audience"/);
    assert.match(list, /href="<%= listBase %>\/<%= item\.id %>"/);
    assert.match(list, /data-bb-hq-ann-branches="1"/);
    assert.doesNotMatch(list, /Active Today|Total Views|Admin Tip|Announcement Insights|1,240|Engagement|delivery rate|branch reach/i);
    assert.doesNotMatch(list, /Filter by Audience:\s*Public|Date Range|More Filters/i);
    assert.doesNotMatch(list, /data-bb-ann-action="edit"|SMS|WhatsApp/);
    assert.match(list, /shellKind === 'hq'/);
    assert.match(list, /data-bb-stitch-announcements="<%= stitchKey %>"|61-hq-broadcast-center/);
    assert.match(css, /\.bb-ba-ann-cards/);
    assert.match(css, /\.bb-ba-ann-table-wrap/);
    assert.match(css, /\.bb-ba-ann-chip/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
    assert.match(css, /\.bb-ba-ann-table-wrap\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.bb-ba-ann-cards\s*\{[^}]*display:\s*none/);
  });

  it("HQ announcements list uses broadcast Stitch pair and real delivery counts only", () => {
    const list = read("views/blessboard/v5/announcements/admin-list.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(list, /61-hq-broadcast-center/);
    assert.match(list, /data-bb-hq-announcements="1"/);
    assert.match(list, /data-bb-delivery="overview"/);
    assert.match(list, /data-bb-delivery="row"/);
    assert.match(list, /data-bb-delivery="unavailable"/);
    assert.match(list, /data-bb-eligible=/);
    assert.match(list, /data-bb-read=/);
    assert.match(list, /data-bb-unread=/);
    assert.match(list, /showDelivery\(item\)/);
    assert.match(list, /hasMembersAudience/);
    assert.doesNotMatch(list, /delivery rate|% read|branch reach|email blast/i);
    assert.match(css, /\.bb-hq-ann-delivery-note/);
    assert.match(css, /\.bb-hq-ann-delivery\b/);
  });

  it("branch admin public content overview links only to existing modules without fabricated metrics", () => {
    const index = read("views/blessboard/v5/content-admin/index.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(index, /data-bb-stitch-content="34-branch-website-editor"/);
    assert.match(index, /data-bb-content-admin="1"/);
    assert.match(index, /data-bb-content-pages="1"/);
    assert.match(index, /data-bb-content-entities="1"/);
    assert.match(index, /data-bb-content-page-cards="1"/);
    assert.match(index, /data-bb-content-entity-cards="1"/);
    assert.match(index, /data-bb-content-hq-controlled="1"/);
    assert.match(index, /data-bb-content-unavailable-modules="1"/);
    assert.match(index, /data-bb-content-action="edit"/);
    assert.match(index, /data-bb-content-action="preview"/);
    assert.match(index, /scope\.basePath %>\/pages\/<%= page\.pageKey %>/);
    assert.match(index, /scope\.basePath %>\/preview\/<%= page\.pageKey %>/);
    assert.match(index, /basePath \+ '\/leadership'/);
    assert.match(index, /basePath \+ '\/ministries'/);
    assert.match(index, /basePath \+ '\/events'/);
    assert.match(index, /basePath \+ '\/sermons'/);
    assert.match(index, /basePath \+ '\/contact'/);
    assert.match(index, /basePath \+ '\/giving'/);
    assert.doesNotMatch(index, /85%|unsaved changes|custom domain settings|theme picker/i);
    assert.doesNotMatch(index, /href="[^"]*\/theme"|href="[^"]*\/seo"|href="[^"]*\/domain"/);
    assert.match(css, /\.bb-ba-content-cards/);
    assert.match(css, /\.bb-ba-content-card/);
    assert.match(css, /\.bb-ba-content-unavailable/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });

  it("HQ public content oversight reuses website Stitch pair with scope filters and unavailable modules", () => {
    const index = read("views/blessboard/v5/content-admin/index.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(index, /data-bb-stitch-content="34-branch-website-editor"/);
    assert.match(index, /data-bb-hq-content="1"/);
    assert.match(index, /data-bb-content-scope-panel="1"/);
    assert.match(index, /data-bb-content-filter="1"/);
    assert.match(index, /data-bb-content-status-chips="1"/);
    assert.match(index, /data-bb-hq-content-branches="1"/);
    assert.match(index, /data-bb-content-branch-table="1"/);
    assert.match(index, /data-bb-content-branch-cards="1"/);
    assert.match(index, /data-bb-content-summary="1"/);
    assert.match(index, /data-bb-content-stat="archived"/);
    assert.match(index, /key: 'theme'/);
    assert.match(index, /key: 'domain'/);
    assert.match(index, /key: 'seo'/);
    assert.match(index, /key: 'builder'/);
    assert.match(index, /key: 'templates'/);
    assert.match(index, /data-bb-content-unavailable="<%= mod\.key %>"/);
    assert.match(index, /href="\/hq\/announcements"/);
    assert.doesNotMatch(index, /85%|completion percentage is \d+/i);
    assert.doesNotMatch(index, /href="[^"]*\/theme"|href="[^"]*\/seo"|href="[^"]*\/domain"/);
    assert.match(css, /\.bb-hq-content-scope/);
    assert.match(css, /\.bb-hq-content-chips/);
    assert.match(css, /\.bb-hq-content-branch-table/);
    assert.match(css, /\.bb-hq-content-branch-cards/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("HQ attendance report uses consolidated analytics Stitch pair with accessible bars and no fabricated trends", () => {
    const report = read("views/blessboard/v5/hq/attendance-report.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(report, /data-bb-hq-attendance-report="1"/);
    assert.match(report, /data-bb-batch="fg-08a"/);
    assert.match(report, /data-bb-stitch-attendance-report="57-hq-consolidated-analytics"/);
    assert.match(report, /data-bb-stitch-desktop="2a577dc15d4342acb152f16aed21c267"/);
    assert.match(report, /data-bb-att-report-entitlement=/);
    assert.match(report, /data-bb-att-report-denied="1"/);
    assert.match(report, /data-bb-hq-att-report-filter="1"/);
    assert.match(report, /name="month"/);
    assert.match(report, /name="branch"/);
    assert.match(report, /data-bb-att-report-summary="1"/);
    assert.match(report, /data-bb-attendance-grand-total=/);
    assert.match(report, /data-bb-attendance-summary-table="1"/);
    assert.match(report, /data-bb-attendance-summary-cards="1"/);
    assert.match(report, /data-bb-attendance-by-branch="1"/);
    assert.match(report, /data-bb-attendance-branch-cards="1"/);
    assert.match(report, /role="img"/);
    assert.match(report, /data-bb-att-bar-pct=/);
    assert.match(report, /data-bb-att-report-empty="1"/);
    assert.match(report, /data-bb-att-report-unavailable="1"/);
    assert.match(report, /data-bb-att-unavailable="trend"/);
    assert.match(report, /data-bb-att-unavailable="forecast"/);
    assert.doesNotMatch(report, /chart\.js|<canvas|projectedGrowth|\+12%|YoY/i);
    assert.match(css, /\.bb-hq-att-report-summary/);
    assert.match(css, /\.bb-hq-att-bar__/);
    assert.match(css, /\.bb-hq-att-report-cards/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("HQ governance audit uses Network gate, privacy markers, and accessible tables", () => {
    const report = read("views/blessboard/v5/hq/governance-audit.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    const nav = read("src/blessboard/http/hqAdminNav.js");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(nav, /href: "\/hq\/audit\/governance"/);
    assert.match(report, /data-bb-hq-governance-audit="1"/);
    assert.match(report, /data-bb-batch="nw-gov-01"/);
    assert.match(report, /data-bb-stitch-governance="58-hq-global-audit-trail"/);
    assert.match(report, /data-bb-gov-entitlement=/);
    assert.match(report, /data-bb-gov-denied="1"/);
    assert.doesNotMatch(report, /data-bb-gov-denied="1"[^>]*role="status"/);
    assert.match(report, /data-bb-gov-filter="1"/);
    assert.match(report, /name="from"/);
    assert.match(report, /name="branch"/);
    assert.match(report, /name="actor"/);
    assert.match(report, /name="category"/);
    assert.match(report, /name="outcome"/);
    assert.match(report, /data-bb-gov-table="1"/);
    assert.match(report, /data-bb-gov-cards="1"/);
    assert.match(report, /data-bb-gov-unavailable="product"/);
    assert.match(report, /data-bb-gov-privacy="1"/);
    assert.doesNotMatch(report, /chart\.js|<canvas|export\.csv/i);
    assert.match(css, /\.bb-hq-gov-/);
    assert.match(css, /\.bb-hq-gov-filter/);
    assert.match(css, /@media \(min-width:\s*768px\)/);
  });

  it("HQ executive dashboard uses Network gate, approved metrics, and accessible tables", () => {
    const report = read("views/blessboard/v5/hq/executive-dashboard.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    const nav = read("src/blessboard/http/hqAdminNav.js");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(nav, /href: "\/hq\/reports\/executive"/);
    assert.match(report, /data-bb-hq-executive="1"/);
    assert.match(report, /data-bb-batch="nw-ex-01"/);
    assert.match(report, /data-bb-stitch-executive="57-hq-consolidated-analytics"/);
    assert.match(report, /data-bb-exec-entitlement=/);
    assert.match(report, /data-bb-exec-denied="1"/);
    assert.doesNotMatch(report, /data-bb-exec-denied="1"[^>]*role="status"/);
    assert.match(report, /data-bb-exec-filter="1"/);
    assert.match(report, /name="month"/);
    assert.match(report, /name="branch"/);
    assert.match(report, /data-bb-exec-summary="1"/);
    assert.match(report, /data-bb-exec-table="members"/);
    assert.match(report, /data-bb-exec-cards="members"/);
    assert.match(report, /data-bb-exec-unavailable="product"/);
    assert.match(report, /role="img"/);
    assert.match(report, /read receipts/i);
    assert.match(report, /Unavailable analytics/);
    assert.doesNotMatch(report, /chart\.js|<canvas|projectedGrowth|\+12%|YoY/i);
    assert.match(css, /\.bb-hq-exec__/);
    assert.match(css, /\.bb-hq-exec-cards/);
    assert.match(css, /\.bb-hq-exec-card__title[\s\S]*overflow-wrap/);
    assert.match(css, /@media \(max-width:\s*320px\)/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("HQ giving report uses consolidated analytics Stitch pair with privacy-safe aggregates and accessible bars", () => {
    const report = read("views/blessboard/v5/hq/giving-report.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(report, /data-bb-hq-giving-report="1"/);
    assert.match(report, /data-bb-batch="fg-q12"/);
    assert.match(report, /data-bb-stitch-giving-report="57-hq-consolidated-analytics"/);
    assert.match(report, /data-bb-stitch-desktop="2a577dc15d4342acb152f16aed21c267"/);
    assert.match(report, /data-bb-giv-report-entitlement=/);
    assert.match(report, /data-bb-giv-report-denied="1"/);
    assert.match(report, /role="status"/);
    assert.match(report, /Growth advanced reports required/);
    assert.match(report, /data-bb-hq-giv-report-filter="1"/);
    assert.match(report, /name="month"/);
    assert.match(report, /name="branch"/);
    assert.match(report, /data-bb-giv-report-summary="1"/);
    assert.match(report, /data-bb-giving-summary-table="1"/);
    assert.match(report, /data-bb-giving-summary-cards="1"/);
    assert.match(report, /data-bb-giving-by-branch="1"/);
    assert.match(report, /data-bb-giving-branch-cards="1"/);
    assert.match(report, /role="img"/);
    assert.match(report, /data-bb-giv-bar-pct=/);
    assert.match(report, /data-bb-giv-report-empty="1"/);
    assert.match(report, /data-bb-giv-report-unavailable="1"/);
    assert.match(report, /data-bb-giv-unavailable="donor"/);
    assert.match(report, /data-bb-giv-unavailable="bank"/);
    assert.doesNotMatch(report, /chart\.js|<canvas|projectedGrowth|\+12%|YoY|donorEmail|iban|cardNumber/i);
    assert.match(css, /\.bb-hq-giv-report-summary/);
    assert.match(css, /\.bb-hq-giv-report-denied/);
    assert.match(css, /\.bb-hq-giv-bar__/);
    assert.match(css, /\.bb-hq-giv-report-cards/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("HQ audit trail uses global audit Stitch with privacy-safe event rows", () => {
    const audit = read("views/blessboard/v5/hq/audit.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(audit, /data-bb-hq-audit="1"/);
    assert.match(audit, /data-bb-stitch-audit="58-hq-global-audit-trail"/);
    assert.match(audit, /data-bb-hq-audit-filter="1"/);
    assert.match(audit, /data-bb-audit-summary="1"/);
    assert.match(audit, /data-bb-hq-audit-table="1"/);
    assert.match(audit, /data-bb-hq-audit-cards="1"/);
    assert.match(audit, /data-bb-hq-audit-empty=/);
    assert.match(audit, /data-bb-audit-privacy="1"/);
    assert.match(audit, /data-bb-audit-unavailable="1"/);
    assert.match(audit, /data-bb-audit-unavailable-row="payload"/);
    assert.match(audit, /name="action"/);
    assert.match(audit, /name="entity"/);
    assert.match(audit, /name="outcome"/);
    assert.doesNotMatch(audit, /export\.csv|session_token|password_hash|metadata\.json/i);
    assert.match(css, /\.bb-hq-audit-summary/);
    assert.match(css, /\.bb-hq-audit-cards/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("HQ reports index uses consolidated analytics Stitch with entitled report links only", () => {
    const reports = read("views/blessboard/v5/hq/reports.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(reports, /data-bb-hq-reports="1"/);
    assert.match(reports, /data-bb-batch="fg-08a"/);
    assert.match(reports, /data-bb-stitch-reports="57-hq-consolidated-analytics"/);
    assert.match(reports, /data-bb-stitch-desktop="2a577dc15d4342acb152f16aed21c267"/);
    assert.match(reports, /data-bb-report-tier=/);
    assert.match(reports, /data-bb-report-links="1"/);
    assert.match(reports, /data-bb-report-link="attendance"/);
    assert.match(reports, /data-bb-report-link="giving"/);
    assert.match(reports, /data-bb-report-link-tier=/);
    assert.match(reports, /bb-hq-report-card--gated/);
    assert.match(reports, /advancedOk/);
    assert.match(reports, /href="<%= attHref %>"/);
    assert.match(reports, /href="<%= givHref %>"/);
    assert.match(reports, /Requires Growth — not linked on Foundation/);
    assert.match(reports, /data-bb-reports-summary="1"/);
    assert.match(reports, /data-bb-hq-report-filter="1"/);
    assert.match(reports, /name="month"/);
    assert.match(reports, /name="branch"/);
    assert.match(reports, /data-bb-reports-unavailable="1"/);
    assert.match(reports, /data-bb-reports-unavailable-row="generators"/);
    assert.doesNotMatch(reports, /chart\.js|<canvas|projectedGrowth|compliance score \d+/i);
    assert.match(css, /\.bb-hq-report-card/);
    assert.match(css, /\.bb-hq-report-card--gated:not\(a\)/);
    assert.match(css, /\.bb-hq-reports-summary/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("branch admin public page editor preserves fields and omits unsupported builder chrome", () => {
    const page = read("views/blessboard/v5/content-admin/page.ejs");
    const section = read("views/blessboard/v5/content-admin/section.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(page, /data-bb-content-page-editor="1"/);
    assert.match(page, /data-bb-stitch-page-editor="34-branch-website-editor"/);
    assert.match(page, /method="post"/);
    assert.match(page, /name="_csrf"/);
    assert.match(page, /name="expected_updated_at"/);
    assert.match(page, /name="title"/);
    assert.match(page, /name="status"/);
    assert.match(page, /name="confirm_publish"/);
    assert.match(page, /name="section_key"/);
    assert.match(page, /name="section_type"/);
    assert.match(page, /name="heading"/);
    assert.match(page, /name="body_text"/);
    assert.match(page, /name="media_url"/);
    assert.match(page, /name="sort_order"/);
    assert.match(page, /data-bb-page-section-cards="1"/);
    assert.match(page, /data-bb-page-add-section="1"/);
    assert.match(page, /data-bb-content-action="preview"/);
    assert.match(page, /media-upload/);
    assert.doesNotMatch(page, /drag.?and.?drop|live.?edit|custom HTML|theme editor|SEO settings/i);
    assert.match(section, /data-bb-content-section-editor="1"/);
    assert.match(section, /data-bb-stitch-section-editor="34-branch-website-editor"/);
    assert.match(section, /name="_csrf"/);
    assert.match(section, /name="expected_updated_at"/);
    assert.match(section, /name="section_type"/);
    assert.match(section, /name="heading"/);
    assert.match(section, /name="body_text"/);
    assert.match(section, /name="media_url"/);
    assert.match(section, /name="sort_order"/);
    assert.match(section, /name="status"/);
    assert.match(section, /name="confirm_publish"/);
    assert.match(section, /media-upload/);
    assert.doesNotMatch(section, /custom HTML|theme widget|drag.?and.?drop/i);
    assert.match(css, /\.bb-ba-page-editor/);
    assert.match(css, /\.bb-ba-page-section-card/);
    assert.match(css, /\.bb-ba-section-editor/);
    assert.match(css, /@media \(min-width:\s*960px\)/);
  });

  it("branch admin ministries admin preserves fields, search, and omits fabricated roster metrics", () => {
    const entities = read("views/blessboard/v5/content-admin/entities.ejs");
    const fields = read("views/blessboard/v5/content-admin/entity-fields.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(entities, /data-bb-ministries-admin="1"/);
    assert.match(entities, /29-branch-ministries-directory/);
    assert.match(entities, /data-bb-stitch-ministries=/);
    assert.match(entities, /data-bb-ministries-filter="1"/);
    assert.match(entities, /data-bb-ministries-status-chips="1"/);
    assert.match(entities, /data-bb-ministries-table="1"/);
    assert.match(entities, /data-bb-ministries-cards="1"/);
    assert.match(entities, /data-bb-ministries-create="1"/);
    assert.match(entities, /data-bb-ministries-editors="1"/);
    assert.match(entities, /data-bb-ministries-empty="catalog"/);
    assert.match(entities, /data-bb-ministries-empty="no-results"/);
    assert.match(entities, /name="q"/);
    assert.match(entities, /name="_csrf"/);
    assert.match(entities, /name="action" value="create"/);
    assert.match(entities, /name="action" value="update"/);
    assert.match(entities, /name="item_id"/);
    assert.match(entities, /name="expected_updated_at"/);
    assert.match(fields, /name="name"/);
    assert.match(fields, /name="summary"/);
    assert.match(fields, /name="description"/);
    assert.match(fields, /name="meeting_day"/);
    assert.match(fields, /name="contact_email"/);
    assert.match(fields, /name="image_url"/);
    assert.match(fields, /name="sort_order"/);
    assert.match(fields, /name="status"/);
    assert.match(fields, /name="confirm_publish"/);
    assert.match(fields, /data-bb-entity-status-select/);
    assert.match(fields, /data-bb-entity-confirm-wrap/);
    assert.match(fields, /data-bb-ministries-section="content"/);
    assert.match(fields, /data-bb-ministries-section="media"/);
    assert.match(fields, /media-upload/);
    assert.doesNotMatch(entities, /Total Members|Active Leaders|1,248|\+12%/i);
    assert.doesNotMatch(entities, /href="[^"]*\/export"|bb-ba-btn[^>]*>\s*Export/i);
    assert.doesNotMatch(entities, /Leader:\s|Members:<\/th>|data-bb-entity-leader=|data-bb-entity-member-count=/i);
    assert.match(entities, /data-bb-entity-unavailable-row="leaders"/);
    assert.match(entities, /data-bb-entity-unavailable-row="members"/);
    assert.match(entities, /data-bb-entity-unavailable-row="departments"/);
    assert.match(css, /\.bb-ba-entities/);
    assert.match(css, /\.bb-ba-entities-table/);
    assert.match(css, /\.bb-ba-entities-cards/);
    assert.match(css, /\.bb-ba-entities-filter/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("branch admin events admin preserves schedule fields and omits fabricated registration totals", () => {
    const entities = read("views/blessboard/v5/content-admin/entities.ejs");
    const fields = read("views/blessboard/v5/content-admin/entity-fields.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(entities, /data-bb-events-admin="1"/);
    assert.match(entities, /32-branch-events-management/);
    assert.match(entities, /data-bb-stitch-events=/);
    assert.match(entities, /data-bb-events-filter="1"/);
    assert.match(entities, /data-bb-events-when-chips="1"/);
    assert.match(entities, /data-bb-events-status-chips="1"/);
    assert.match(entities, /data-bb-events-cards="1"/);
    assert.match(entities, /data-bb-events-create="1"/);
    assert.match(entities, /data-bb-events-editors="1"/);
    assert.match(entities, /data-bb-events-empty="catalog"/);
    assert.match(entities, /data-bb-events-empty="no-results"/);
    assert.match(entities, /name="when"/);
    assert.match(entities, /name="q"/);
    assert.match(fields, /name="title"/);
    assert.match(fields, /name="starts_at"/);
    assert.match(fields, /name="ends_at"/);
    assert.match(fields, /name="timezone"/);
    assert.match(fields, /name="location"/);
    assert.match(fields, /name="registration_url"/);
    assert.match(fields, /name="image_url"/);
    assert.match(fields, /name="confirm_publish"/);
    assert.match(fields, /data-bb-events-section="details"/);
    assert.match(fields, /data-bb-events-section="schedule"/);
    assert.match(fields, /data-bb-events-section="registration"/);
    assert.match(fields, /data-bb-events-section="media"/);
    assert.match(fields, /media-upload/);
    assert.doesNotMatch(entities, /43 Registered|data-bb-events-registration-count=/i);
    assert.doesNotMatch(entities, /href="[^"]*\/roster"|bb-ba-btn[^>]*>\s*Manage roster|ticket sales|payment gateway/i);
    assert.doesNotMatch(entities, /19-member-resources/);
    assert.match(entities, /data-bb-entity-unavailable-row="roster"/);
    assert.match(entities, /data-bb-entity-unavailable-row="registrations"/);
    assert.match(entities, /data-bb-entity-unavailable-row="ticketing"/);
    assert.match(css, /\.bb-ba-entities-cards--events/);
    assert.match(css, /\.bb-ba-entities-card--event/);
    assert.match(css, /\.bb-ba-entities-card--create/);
    assert.match(css, /@media \(min-width:\s*1100px\)/);
  });

  it("branch admin sermons admin preserves media fields and omits analytics hosting chrome", () => {
    const entities = read("views/blessboard/v5/content-admin/entities.ejs");
    const fields = read("views/blessboard/v5/content-admin/entity-fields.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(entities, /data-bb-sermons-admin="1"/);
    assert.match(entities, /data-bb-stitch-sermons="sermons-admin"/);
    assert.match(entities, /Sermons management/);
    assert.match(entities, /data-bb-sermons-filter="1"/);
    assert.match(entities, /data-bb-sermons-status-chips="1"/);
    assert.match(entities, /data-bb-sermons-cards="1"/);
    assert.match(entities, /data-bb-sermons-create="1"/);
    assert.match(entities, /data-bb-sermons-editors="1"/);
    assert.match(entities, /data-bb-sermons-empty="catalog"/);
    assert.match(entities, /data-bb-sermons-empty="no-results"/);
    assert.match(entities, /name="q"/);
    assert.match(entities, /name="_csrf"/);
    assert.match(entities, /name="action" value="create"/);
    assert.match(entities, /name="action" value="update"/);
    assert.match(entities, /name="item_id"/);
    assert.match(entities, /name="expected_updated_at"/);
    assert.match(fields, /name="title"/);
    assert.match(fields, /name="speaker_name"/);
    assert.match(fields, /name="preached_at"/);
    assert.match(fields, /name="summary"/);
    assert.match(fields, /name="media_url"/);
    assert.match(fields, /name="resource_url"/);
    assert.match(fields, /name="status"/);
    assert.match(fields, /name="confirm_publish"/);
    assert.match(fields, /data-bb-sermons-section="details"/);
    assert.match(fields, /data-bb-sermons-section="schedule"/);
    assert.match(fields, /data-bb-sermons-section="media"/);
    assert.match(fields, /data-bb-sermons-section="publication"/);
    assert.match(fields, /media-upload/);
    assert.match(fields, /entityKind !== 'sermons'[\s\S]{0,160}?name="sort_order"/);
    assert.doesNotMatch(entities, /1\.2k views|downloads today|engagement rate|livestream studio/i);
    assert.doesNotMatch(entities, /iframe|youtube\.com\/embed/i);
    assert.match(entities, /data-bb-entity-unavailable-row="hosting"/);
    assert.match(entities, /data-bb-entity-unavailable-row="analytics"/);
    assert.match(entities, /data-bb-entity-unavailable-row="series"/);
    assert.match(css, /\.bb-ba-entities-cards--sermons/);
    assert.match(css, /\.bb-ba-entities-card--sermon/);
    assert.match(css, /\.bb-ba-entities-card--create/);
    assert.match(css, /\.bb-ba-field__hint/);
  });

  it("branch admin attendance preserves aggregate fields and omits fabricated trends", () => {
    const list = read("views/blessboard/v5/attendance/admin-list.ejs");
    const form = read("views/blessboard/v5/attendance/admin-form.ejs");
    const detail = read("views/blessboard/v5/attendance/admin-detail.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(list, /data-bb-attendance-admin-list="1"/);
    assert.match(list, /data-bb-stitch-attendance="36-branch-attendance-tracker"/);
    assert.match(list, /data-bb-attendance-monthly="1"/);
    assert.match(list, /data-bb-att-summary-cards="1"/);
    assert.match(list, /data-bb-att-status-chips="1"/);
    assert.match(list, /data-bb-att-type-chips="1"/);
    assert.match(list, /data-bb-att-table="1"/);
    assert.match(list, /data-bb-att-cards="1"/);
    assert.match(list, /data-bb-att-history-empty=/);
    assert.match(list, /data-bb-att-unavailable="1"/);
    assert.match(list, /name="month"/);
    assert.match(list, /name="status"/);
    assert.match(list, /name="event_type"/);
    assert.match(list, /data-bb-attendance-grand-total=/);
    assert.match(list, /data-bb-attendance-category=/);
    assert.match(list, /\['first_time_visitors','adults','youth','children'\]/);
    assert.doesNotMatch(list, /\+12%|Last 30 days avg|Pending Drafts|Average Sunday|projectedGrowth/i);
    assert.doesNotMatch(list, /bb-ba-btn[^>]*>\s*QR|fingerprint scanner|sync now/i);
    assert.match(list, /data-bb-att-unavailable-row="individual"/);
    assert.match(list, /data-bb-att-unavailable-row="trends"/);
    assert.match(form, /data-bb-attendance-admin-form="1"/);
    assert.match(form, /data-bb-stitch-attendance-form="36-branch-attendance-tracker"/);
    assert.match(form, /name="_csrf"/);
    assert.match(form, /name="title"/);
    assert.match(form, /name="event_type"/);
    assert.match(form, /name="event_date"/);
    assert.match(form, /name="event_at"/);
    assert.match(form, /does not record individual members/);
    assert.match(detail, /data-bb-attendance-admin-detail="1"/);
    assert.match(detail, /data-bb-stitch-attendance-detail="37-branch-attendance-record-detail"/);
    assert.match(detail, /data-bb-att-totals="1"/);
    assert.match(detail, /data-bb-att-entry-form="1"/);
    assert.match(detail, /name="category"/);
    assert.match(detail, /name="count"/);
    assert.match(detail, /name="notes"/);
    assert.match(detail, /name="_csrf"/);
    assert.match(detail, /action="<%= basePath %>\/<%= event\.id %>\/entries"/);
    assert.match(detail, /action="<%= basePath %>\/<%= event\.id %>\/submit"/);
    assert.match(detail, /bb-att-submit-modal/);
    assert.doesNotMatch(detail, /member check-in|scan QR|fingerprint/i);
    assert.match(css, /\.bb-att-summary-cards/);
    assert.match(css, /\.bb-att-stat--primary/);
    assert.match(css, /\.bb-att-card/);
    assert.match(css, /\.bb-att-cards/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("branch admin giving preserves aggregate fields and omits fabricated trends", () => {
    const list = read("views/blessboard/v5/giving/admin-list.ejs");
    const form = read("views/blessboard/v5/giving/admin-form.ejs");
    const detail = read("views/blessboard/v5/giving/admin-detail.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(list, /data-bb-giving-admin-list="1"/);
    assert.match(list, /data-bb-stitch-giving="39-branch-giving-summary"/);
    assert.match(list, /data-bb-giv-disclaimer="1"/);
    assert.match(list, /data-bb-giving-categories="1"/);
    assert.match(list, /data-bb-giv-summary-cards="1"/);
    assert.match(list, /data-bb-giv-status-chips="1"/);
    assert.match(list, /data-bb-giv-history="1"/);
    assert.match(list, /data-bb-giv-table="1"/);
    assert.match(list, /data-bb-giv-cards="1"/);
    assert.match(list, /data-bb-giv-history-empty=/);
    assert.match(list, /data-bb-giv-unavailable="1"/);
    assert.match(list, /name="month"/);
    assert.match(list, /name="status"/);
    assert.match(list, /grandTotalsByCurrency|gt\.totalAmount/);
    assert.match(list, /formatGivingMoney/);
    assert.doesNotMatch(list, /\+12%|YTD Tithes|projectedGrowth|vs last month/i);
    assert.doesNotMatch(list, /Bank Name|Account Number|Upload QR|Airtel Money|Stripe|PayPal/i);
    assert.match(list, /data-bb-giv-unavailable-row="donors"/);
    assert.match(list, /data-bb-giv-unavailable-row="payments"/);
    assert.match(list, /data-bb-giv-unavailable-row="exports"/);
    assert.match(form, /data-bb-giving-admin-form="1"/);
    assert.match(form, /data-bb-stitch-giving-form="39-branch-giving-summary"/);
    assert.match(form, /name="_csrf"/);
    assert.match(form, /name="category_key"/);
    assert.match(form, /name="giving_date"/);
    assert.match(form, /name="amount"/);
    assert.match(form, /name="currency"/);
    assert.match(form, /name="reference"/);
    assert.match(form, /name="notes"/);
    assert.match(form, /Do not record donor names/);
    assert.match(form, /NUMERIC/);
    assert.match(detail, /data-bb-giving-admin-detail="1"/);
    assert.match(detail, /data-bb-stitch-giving-detail="39-branch-giving-summary"/);
    assert.match(detail, /data-bb-giv-amount=/);
    assert.match(detail, /data-bb-giv-privacy="1"/);
    assert.match(detail, /action="<%= basePath %>\/<%= entry\.id %>\/submit"/);
    assert.match(detail, /action="<%= basePath %>\/<%= entry\.id %>\/void"/);
    assert.match(detail, /bb-giv-submit-modal/);
    assert.match(detail, /bb-giv-void-modal/);
    assert.match(detail, /name="_csrf"/);
    assert.doesNotMatch(detail, /donor email|card number|bank account/i);
    assert.match(css, /\.bb-giv-summary-cards/);
    assert.match(css, /\.bb-giv-stat--primary/);
    assert.match(css, /\.bb-giv-card/);
    assert.match(css, /\.bb-giv-cards/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("branch admin forms preserves allowlisted editor and submission privacy", () => {
    const list = read("views/blessboard/v5/forms-requests/admin-forms.ejs");
    const detail = read("views/blessboard/v5/forms-requests/admin-form-detail.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(list, /data-bb-forms-admin-list="1"/);
    assert.match(list, /data-bb-stitch-forms="<%= stitchKey %>"/);
    assert.match(list, /20-member-forms-documents|shared-ui-states/);
    assert.match(list, /data-bb-hq-forms="1"/);
    assert.match(list, /data-bb-forms-create="1"/);
    assert.match(list, /data-bb-forms-editor="1"/);
    assert.match(list, /data-bb-forms-status-chips="1"/);
    assert.match(list, /data-bb-forms-table="1"/);
    assert.match(list, /data-bb-forms-cards="1"/);
    assert.match(list, /data-bb-forms-empty=/);
    assert.match(list, /data-bb-forms-unavailable="1"/);
    assert.match(list, /name="_csrf"/);
    assert.match(list, /name="title"/);
    assert.match(list, /name="description"/);
    assert.match(list, /name="schema_json"/);
    assert.match(list, /text.*textarea.*email.*phone.*number.*select.*checkbox.*date/s);
    assert.doesNotMatch(list, /signature pad|Stripe Checkout|PayPal|drag-and-drop builder/i);
    assert.match(list, /data-bb-forms-unavailable-row="signatures"/);
    assert.match(list, /data-bb-forms-unavailable-row="logic"/);
    assert.match(detail, /data-bb-forms-admin-detail="1"/);
    assert.match(detail, /data-bb-stitch-forms-detail="shared-ui-states"/);
    assert.match(detail, /data-bb-form-schema="1"/);
    assert.match(detail, /data-bb-form-submissions="1"/);
    assert.match(detail, /data-bb-forms-privacy="1"/);
    assert.match(detail, /data-bb-forms-submissions-empty=/);
    assert.match(detail, /action="<%= basePath %>\/<%= formItem\.id %>\/publish"/);
    assert.match(detail, /name="_csrf"/);
    assert.match(detail, /data-bb-form-publish="1"/);
    assert.doesNotMatch(detail, /member email directory|View Profile|export CSV/i);
    assert.match(css, /\.bb-fr-forms-cards/);
    assert.match(css, /\.bb-fr-form-card/);
    assert.match(css, /\.bb-fr-forms-summary/);
    assert.match(css, /\.bb-fr-resources-cards/);
    assert.match(css, /\.bb-fr-submission-cards/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("HQ forms oversight reuses forms documents Stitch with branch panel and privacy-safe list", () => {
    const list = read("views/blessboard/v5/forms-requests/admin-forms.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(list, /data-bb-hq-forms="1"/);
    assert.match(list, /20-member-forms-documents/);
    assert.match(list, /data-bb-hq-forms-branches="1"/);
    assert.match(list, /data-bb-forms-branch-table="1"/);
    assert.match(list, /data-bb-forms-branch-cards="1"/);
    assert.match(list, /data-bb-forms-filter="1"/);
    assert.match(list, /data-bb-forms-summary="1"/);
    assert.match(list, /data-bb-forms-status-chips="1"/);
    assert.match(list, /data-bb-forms-empty=/);
    assert.match(list, /data-bb-forms-unavailable-row="signatures"/);
    assert.match(list, /data-bb-forms-unavailable-row="builder"/);
    assert.match(list, /data-bb-forms-unavailable-row="export"/);
    assert.match(list, /answers are not listed here|this list does not expose private responses/i);
    assert.doesNotMatch(list, /signature pad|Stripe Checkout|PayPal|drag-and-drop builder/i);
    assert.match(css, /\.bb-hq-forms-branch-table/);
    assert.match(css, /\.bb-hq-forms-branch-cards/);
    assert.match(css, /\.bb-fr-forms-summary/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("HQ resources oversight reuses study resources Stitch with private-file wording", () => {
    const list = read("views/blessboard/v5/forms-requests/admin-resources.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(list, /data-bb-hq-resources="1"/);
    assert.match(list, /data-bb-stitch-resources="19-member-resources-study"/);
    assert.match(list, /data-bb-hq-resources-branches="1"/);
    assert.match(list, /data-bb-resources-branch-table="1"/);
    assert.match(list, /data-bb-resources-branch-cards="1"/);
    assert.match(list, /data-bb-resources-filter="1"/);
    assert.match(list, /data-bb-resources-summary="1"/);
    assert.match(list, /data-bb-resources-status-chips="1"/);
    assert.match(list, /data-bb-resources-cards="1"/);
    assert.match(list, /data-bb-resources-empty=/);
    assert.match(list, /data-bb-resources-unavailable-row="progress"/);
    assert.match(list, /data-bb-resources-unavailable-row="cdn"/);
    assert.match(list, /Private file|never public CDN/i);
    assert.doesNotMatch(list, /learning path progress|public CDN url|certificate download/i);
    assert.match(css, /\.bb-hq-resources-branch-table/);
    assert.match(css, /\.bb-hq-resources-branch-cards/);
    assert.match(css, /\.bb-fr-resources-summary/);
    assert.match(css, /\.bb-fr-resources-cards/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("branch admin requests preserves real statuses and omits fabricated queue metrics", () => {
    const list = read("views/blessboard/v5/forms-requests/admin-requests.ejs");
    const detail = read("views/blessboard/v5/forms-requests/admin-request-detail.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(shell, /branch-admin.css\?v=38/);
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(list, /data-bb-request-admin-list="1"/);
    assert.match(list, /data-bb-stitch-requests="44-branch-request-workflow-queue"/);
    assert.match(list, /data-bb-req-tabs="1"/);
    assert.match(list, /data-bb-req-table="1"/);
    assert.match(list, /data-bb-req-cards="1"/);
    assert.match(list, /data-bb-req-empty=/);
    assert.match(list, /data-bb-req-privacy="1"/);
    assert.match(list, /data-bb-req-unavailable="1"/);
    assert.match(list, /data-bb-req-summary="1"/);
    assert.match(list, /submitted|in_review|resolved|closed/);
    assert.doesNotMatch(list, /PENDING 24|TODAY'S GOAL|Export|My Assigned|Urgent/i);
    assert.doesNotMatch(list, /Active Donor|View Profile|donor email/i);
    assert.match(detail, /data-bb-request-admin-detail="1"/);
    assert.match(detail, /data-bb-stitch-requests-detail="45-branch-request-details"/);
    assert.match(detail, /data-bb-hq-request-detail="1"/);
    assert.match(detail, /data-bb-req-message="1"/);
    assert.match(detail, /data-bb-req-status-form="1"/);
    assert.match(detail, /data-bb-req-history="1"/);
    assert.match(detail, /data-bb-req-detail-privacy="1"/);
    assert.match(detail, /name="_csrf"/);
    assert.match(detail, /name="status"/);
    assert.match(detail, /name="note"/);
    assert.match(detail, /name="internal_only"/);
    assert.match(detail, /action="<%= basePath %>\/<%= reqItem\.id %>\/status"/);
    assert.doesNotMatch(detail, /Reject|Approve Request|Request More Info|Public Correspondence/i);
    assert.doesNotMatch(detail, /Mark Completed|Post Note|Ready to finalize/i);
    assert.match(detail, /data-bb-req-detail-unavailable="1"/);
    assert.match(css, /\.bb-fr-req-cards/);
    assert.match(css, /\.bb-fr-req-card/);
    assert.match(css, /\.bb-fr-req-summary/);
    assert.match(css, /\.bb-fr-timeline/);
    assert.match(css, /@media \(min-width:\s*900px\)/);
  });

  it("HQ requests oversight reuses branch queue Stitch with branch panel and privacy-safe list", () => {
    const list = read("views/blessboard/v5/forms-requests/admin-requests.ejs");
    const detail = read("views/blessboard/v5/forms-requests/admin-request-detail.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(list, /data-bb-hq-requests="1"/);
    assert.match(list, /data-bb-stitch-requests="44-branch-request-workflow-queue"/);
    assert.match(list, /data-bb-hq-requests-branches="1"/);
    assert.match(list, /data-bb-req-branch-table="1"/);
    assert.match(list, /data-bb-req-branch-cards="1"/);
    assert.match(list, /data-bb-req-filter="1"/);
    assert.match(list, /data-bb-req-summary="1"/);
    assert.match(list, /data-bb-req-tabs="1"/);
    assert.match(list, /data-bb-req-empty=/);
    assert.match(list, /data-bb-req-unavailable-row="assignment"/);
    assert.match(list, /data-bb-req-unavailable-row="escalation"/);
    assert.match(list, /truncated member refs|contact details are not listed/i);
    assert.doesNotMatch(list, /PENDING 24|TODAY'S GOAL|My Assigned|Approve Request/i);
    assert.doesNotMatch(list, /href="[^"]*\/export"|Urgent filter|Export CSV/i);
    assert.match(detail, /data-bb-hq-request-detail="1"/);
    assert.match(detail, /data-bb-stitch-requests-detail="45-branch-request-details"/);
    assert.match(detail, /data-bb-req-history="1"/);
    assert.match(detail, /data-bb-req-unavailable-row="chat"/);
    assert.match(detail, /data-bb-req-unavailable-row="escalation"/);
    assert.doesNotMatch(detail, /Approve Request|Reject Request|SLA countdown|donor badge card/i);
    assert.match(css, /\.bb-hq-requests-branch-table/);
    assert.match(css, /\.bb-hq-requests-branch-cards/);
    assert.match(css, /\.bb-fr-req-summary/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("branch admin announcement editor preserves CSRF fields and distinguishes Save draft from Publish", () => {
    const form = read("views/blessboard/v5/announcements/admin-form.ejs");
    const publish = read("views/blessboard/v5/announcements/admin-publish.ejs");
    const css = read("public/blessboard/v5/branch-admin.css");
    assert.match(form, /35-branch-announcements-management/);
    assert.match(form, /data-bb-announcement-admin-form="1"/);
    assert.match(form, /method="post"/);
    assert.match(form, /name="_csrf"/);
    assert.match(form, /name="title"/);
    assert.match(form, /name="body"/);
    assert.match(form, /name="audience_members"/);
    assert.match(form, /name="audience_admins"/);
    assert.match(form, /name="is_pinned"/);
    assert.match(form, /name="is_featured"/);
    assert.match(form, /name="action_url"/);
    assert.match(form, /name="action_label"/);
    assert.match(form, /name="media_asset_id"/);
    assert.match(form, /name="expected_updated_at"/);
    assert.match(form, /name="confirm_publish"/);
    assert.match(form, /data-bb-ann-save-draft="1"/);
    assert.match(form, /data-bb-ann-publish-submit="1"/);
    assert.match(form, /value="draft"/);
    assert.match(form, /value="published"/);
    assert.match(form, /data-bb-ann-section="content"/);
    assert.match(form, /data-bb-ann-section="audience"/);
    assert.match(form, /data-bb-ann-section="attachments"/);
    assert.match(form, /data-bb-ann-live-preview="1"/);
    assert.match(form, /attachments\/<%= att\.id %>\/file/);
    assert.match(form, /data-bb-ann-attachment-download="1"/);
    assert.doesNotMatch(form, /\/_bb\/media\/<%= att\.mediaAssetId %>/);
    assert.doesNotMatch(form, /Schedule for|Template library|SMS channel|Push notification|Total Views/i);
    assert.doesNotMatch(form, /method="post"[^>]*action="[^"]*\/delete"/i);
    assert.match(publish, /data-bb-announcement-admin-publish="1"/);
    assert.match(publish, /name="confirm_publish"/);
    assert.match(publish, /name="_csrf"/);
    assert.match(publish, /action="<%= basePath %>\/<%= item\.id %>\/publish"/);
    assert.match(css, /\.bb-ba-ann-editor__actions/);
    assert.match(css, /\.bb-ba-ann-editor__section--publish/);
    assert.match(css, /\.bb-ann-attachments__item/);
    assert.match(css, /@media \(min-width:\s*960px\)/);
    assert.match(css, /@media \(max-width:\s*899px\)/);
  });

  it("HQ announcement editor uses broadcast Stitch pair and preserves CSRF publish confirm", () => {
    const form = read("views/blessboard/v5/announcements/admin-form.ejs");
    const publish = read("views/blessboard/v5/announcements/admin-publish.ejs");
    const css = read("public/blessboard/v5/hq-admin.css");
    const hqShell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    assert.match(hqShell, /hq-admin.css\?v=56/);
    assert.match(form, /61-hq-broadcast-center/);
    assert.match(form, /data-bb-hq-announcement-editor="1"/);
    assert.match(form, /data-bb-ann-scope-panel="1"/);
    assert.match(form, /data-bb-ann-audience-estimate="1"/);
    assert.match(form, /name="_csrf"/);
    assert.match(form, /name="confirm_publish"/);
    assert.match(form, /data-bb-ann-save-draft="1"/);
    assert.match(form, /data-bb-ann-publish-submit="1"/);
    assert.doesNotMatch(form, /Schedule for|Template library|WhatsApp|Push notification/i);
    assert.match(publish, /61-hq-broadcast-center/);
    assert.match(publish, /data-bb-hq-announcement-publish="1"/);
    assert.match(publish, /data-bb-delivery="eligible"/);
    assert.match(publish, /name="confirm_publish"/);
    assert.match(publish, /name="_csrf"/);
    assert.match(css, /\.bb-hq-ann-editor-scope/);
    assert.match(css, /\.bb-hq-ann-editor\b/);
  });

  it("member profile distinguishes read-only vs editable fields without unsupported Stitch blocks", () => {
    const profile = read("views/blessboard/v5/member/profile.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(profile, /data-bb-stitch-profile="15-member-profile"/);
    assert.match(profile, /data-bb-profile-header="1"/);
    assert.match(profile, /data-bb-profile-readonly="1"/);
    assert.match(profile, /data-bb-profile-form="1"/);
    assert.match(profile, /method="post"/);
    assert.match(profile, /action="\/member\/profile"/);
    assert.match(profile, /name="preferredName"/);
    assert.match(profile, /name="emailDisplay"/);
    assert.match(profile, /name="phone"/);
    assert.match(profile, /name="_csrf"/);
    assert.match(profile, /readonly/);
    assert.match(profile, /is-view/);
    assert.match(profile, /id="profile-error-summary"/);
    assert.match(profile, /role="alert"/);
    assert.match(profile, /Legal Name/);
    assert.match(profile, /Sign-in email/);
    assert.match(profile, /Read-only/);
    assert.match(profile, /Editable/);
    assert.doesNotMatch(profile, /name="firstName"|name="lastName"|name="membershipStatus"/);
    assert.doesNotMatch(profile, /type="file"|change password|notification prefer|avatar upload/i);
    assert.doesNotMatch(
      profile,
      /Date of Birth|Residential Address|Emergency Contact|Medical Notes|Member Digital ID|85% Complete/i
    );
    assert.match(css, /\.bb-mp-profile__header/);
    assert.match(css, /\.bb-mp-profile__avatar/);
    assert.match(css, /\.bb-mp-kv__item--readonly/);
    assert.match(css, /\.bb-mp-chip--readonly/);
    assert.match(css, /\.bb-mp-form--profile/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });

  it("member announcements keep filters, empty states, and authorized attachment links", () => {
    const list = read("views/blessboard/v5/announcements/member-list.ejs");
    const detail = read("views/blessboard/v5/announcements/member-detail.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(list, /data-bb-stitch-announcements="16-member-announcements"/);
    assert.match(list, /data-bb-ann-toolbar="1"/);
    assert.match(list, /data-bb-ann-filter-link="<%= f\.key %>"/);
    assert.match(list, /key: 'unread'/);
    assert.match(list, /key: 'pinned'/);
    assert.match(list, /key: 'featured'/);
    assert.match(list, /data-bb-ann-search="1"/);
    assert.match(list, /data-bb-ann-empty="catalog"/);
    assert.match(list, /data-bb-ann-empty="no-results"/);
    assert.match(list, /data-bb-ann-featured="1"/);
    assert.doesNotMatch(list, /Showing \d+ of \d+|Branch Level|Major Event|1,240/i);
    assert.match(detail, /data-bb-mark-read-form="1"/);
    assert.match(detail, /name="_csrf"/);
    assert.match(detail, /action="\/member\/announcements\/<%= item\.id %>\/read"/);
    assert.match(detail, /isRenderableAttachment/);
    assert.match(detail, /\/member\/announcements\/<%= item\.id %>\/attachments\/<%= att\.id %>\/file/);
    assert.match(detail, /data-bb-ann-attachment-download="1"/);
    assert.doesNotMatch(detail, /\/_bb\/media\/<%= att\.mediaAssetId %>/);
    assert.match(detail, /item\.actionUrl && item\.actionLabel/);
    assert.match(css, /\.bb-mp-ann-toolbar/);
    assert.match(css, /\.bb-mp-ann-filter/);
    assert.match(css, /\.bb-mp-ann-featured__card/);
    assert.match(css, /\.bb-mp-ann-attachment/);
    assert.match(css, /@media \(max-width:\s*699px\)/);
  });

  it("member events keep upcoming/past list chrome without calendar sync or tickets", () => {
    const list = read("views/blessboard/v5/participation/member-events.ejs");
    const card = read("views/blessboard/v5/participation/partials/member-event-card.ejs");
    const detail = read("views/blessboard/v5/participation/member-event-detail.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(list, /data-bb-stitch-events="17-member-events"/);
    assert.match(list, /data-bb-events-toolbar="1"/);
    assert.match(list, /data-bb-event-filter-link="<%= f\.key %>"/);
    assert.match(list, /key: 'upcoming'/);
    assert.match(list, /key: 'past'/);
    assert.match(list, /key: 'registered'/);
    assert.match(list, /data-bb-events-empty="catalog"/);
    assert.match(list, /data-bb-events-empty="no-results"/);
    assert.match(list, /data-bb-events-upcoming="1"/);
    assert.match(list, /data-bb-events-past="1"/);
    assert.doesNotMatch(list, /Calendar View|Add to calendar|Buy ticket|Google Calendar|Apple Calendar/i);
    assert.match(card, /data-bb-event-when=/);
    assert.match(card, /bb-mp-part-card__month/);
    assert.match(card, /item\.location/);
    assert.match(card, /item\.timezone/);
    assert.match(detail, /action="\/member\/events\/<%= item\.id %>\/register"/);
    assert.match(detail, /action="\/member\/events\/<%= item\.id %>\/cancel"/);
    assert.match(detail, /name="_csrf"/);
    assert.match(detail, /data-bb-ds-modal-open="bb-mp-event-cancel"/);
    assert.doesNotMatch(detail, /payment|ticket|calendar sync/i);
    assert.match(css, /\.bb-mp-part-card__month/);
    assert.match(css, /\.bb-mp-part-card\.is-past/);
    assert.match(css, /\.bb-mp-events-toolbar/);
  });

  it("member ministries keep joined/pending/discover states without fabricated leaders or chat", () => {
    const list = read("views/blessboard/v5/participation/member-ministries.ejs");
    const card = read("views/blessboard/v5/participation/partials/member-ministry-card.ejs");
    const detail = read("views/blessboard/v5/participation/member-ministry-detail.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(list, /data-bb-stitch-ministries="18-member-my-ministries"/);
    assert.match(list, /data-bb-ministries-toolbar="1"/);
    assert.match(list, /key: 'mine'/);
    assert.match(list, /key: 'pending'/);
    assert.match(list, /key: 'discover'/);
    assert.match(list, /data-bb-ministries-empty="catalog"/);
    assert.match(list, /data-bb-ministries-empty="no-results"/);
    assert.match(list, /data-bb-ministries-empty="mine"/);
    assert.match(list, /data-bb-ministries-empty="pending"/);
    assert.match(list, /data-bb-ministries-active="1"/);
    assert.match(list, /data-bb-ministries-pending="1"/);
    assert.match(list, /data-bb-ministries-discover="1"/);
    assert.doesNotMatch(list, /Leader:|Member Rating|Hours Monthly|Upcoming Assignments|View All \d+ Ministries/i);
    assert.match(card, /data-bb-status=/);
    assert.match(card, /Waiting for church review/);
    assert.doesNotMatch(card, /Leader:|Roster|chat|Message Group/i);
    assert.match(detail, /action="\/member\/ministries\/<%= item\.id %>\/join"/);
    assert.match(detail, /action="\/member\/ministries\/<%= item\.id %>\/leave"/);
    assert.match(detail, /name="_csrf"/);
    assert.match(detail, /data-bb-ds-modal-open="bb-mp-ministry-leave"/);
    assert.doesNotMatch(detail, /duty roster|ministry chat|attendance feature/i);
    assert.match(css, /\.bb-mp-ministry-grid/);
    assert.match(css, /\.bb-mp-ministry-card\.is-pending/);
    assert.match(css, /\.bb-mp-ministries-toolbar/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });

  it("member resources keep real file metadata without certificates or course progress", () => {
    const list = read("views/blessboard/v5/forms-requests/member-resources.ejs");
    const detail = read("views/blessboard/v5/forms-requests/member-resource-detail.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(list, /data-bb-stitch-resources="19-member-resources-study"/);
    assert.match(list, /data-bb-resources-toolbar="1"/);
    assert.match(list, /data-bb-resources-search="1"/);
    assert.match(list, /key: 'files'/);
    assert.match(list, /key: 'info'/);
    assert.match(list, /data-bb-resources-empty="catalog"/);
    assert.match(list, /data-bb-resources-empty="no-results"/);
    assert.match(list, /r\.typeLabel/);
    assert.match(list, /r\.sizeLabel/);
    assert.match(list, /r\.fileName/);
    assert.doesNotMatch(list, /certificate|course progress|active readers|Sermon Notes|external.?link/i);
    assert.match(detail, /data-bb-resource-download="1"/);
    assert.match(detail, /href="\/member\/resources\/<%= resource\.id %>\/file"/);
    assert.match(detail, /resource\.typeLabel/);
    assert.match(detail, /resource\.sizeLabel/);
    assert.doesNotMatch(detail, /certificate|course progress|quiz|completion/i);
    assert.match(css, /\.bb-mp-resource-grid/);
    assert.match(css, /\.bb-mp-resource-card/);
    assert.match(css, /\.bb-mp-resources-toolbar/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });

  it("member forms keep allowlisted fields and real submission states without PDF or builder chrome", () => {
    const list = read("views/blessboard/v5/forms-requests/member-forms.ejs");
    const detail = read("views/blessboard/v5/forms-requests/member-form-detail.ejs");
    const submission = read("views/blessboard/v5/forms-requests/member-submission.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(list, /data-bb-stitch-forms="20-member-forms-documents"/);
    assert.match(list, /data-bb-forms-toolbar="1"/);
    assert.match(list, /data-bb-forms-search="1"/);
    assert.match(list, /key: 'available'/);
    assert.match(list, /key: 'history'/);
    assert.match(list, /data-bb-forms-empty="catalog"/);
    assert.match(list, /data-bb-forms-empty="no-results"/);
    assert.match(list, /data-bb-forms-empty="history"/);
    assert.match(list, /s\.statusLabel/);
    assert.match(list, /f\.fieldCount/);
    assert.doesNotMatch(list, /Download PDF|form builder|e-?signature|card number|cvv|Approved|Processing/i);
    assert.match(detail, /action="\/member\/forms\/<%= form\.id %>\/submit"/);
    assert.match(detail, /name="_csrf"/);
    assert.match(detail, /data-bb-field-type=/);
    assert.doesNotMatch(detail, /type="file"|e-?signature|card number|form builder/i);
    assert.match(submission, /data-bb-member-submission="1"/);
    assert.match(submission, /data-bb-submission-answers="1"/);
    assert.match(submission, /statusLabel|Submitted|Closed/);
    assert.doesNotMatch(submission, /Approved|Processing|pending/i);
    assert.match(css, /\.bb-mp-forms-grid/);
    assert.match(css, /\.bb-mp-form-card/);
    assert.match(css, /\.bb-mp-forms-toolbar/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });

  it("member requests keep supported categories/statuses without SLA, chat, or attachment upload chrome", () => {
    const list = read("views/blessboard/v5/forms-requests/member-requests.ejs");
    const create = read("views/blessboard/v5/forms-requests/member-request-new.ejs");
    const detail = read("views/blessboard/v5/forms-requests/member-request-detail.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(list, /data-bb-stitch-requests="22-member-request-status"/);
    assert.match(list, /data-bb-requests-toolbar="1"/);
    assert.match(list, /data-bb-requests-search="1"/);
    assert.match(list, /key: 'active'/);
    assert.match(list, /key: 'resolved'/);
    assert.match(list, /key: 'closed'/);
    assert.match(list, /data-bb-requests-empty="catalog"/);
    assert.match(list, /data-bb-requests-empty="no-results"/);
    assert.match(list, /data-bb-request-summary="1"/);
    assert.match(list, /counts\.active/);
    assert.match(list, /r\.statusLabel/);
    assert.match(list, /r\.categoryLabel/);
    assert.doesNotMatch(list, /crisis hotline|24.?48 hours|REQ-20\d{2}|Facility Use|In Progress|chat/i);
    assert.match(create, /data-bb-stitch-request-new="21-member-submit-online-request"/);
    assert.match(create, /action="\/member\/requests"/);
    assert.match(create, /name="_csrf"/);
    assert.match(create, /name="category"/);
    assert.match(create, /value:\s*'prayer'/);
    assert.match(create, /value:\s*'pastoral'/);
    assert.match(create, /value:\s*'practical'/);
    assert.match(create, /value:\s*'other'/);
    assert.match(create, /value="<%= card\.value %>"/);
    assert.match(create, /name="subject"/);
    assert.match(create, /name="message"/);
    assert.match(create, /data-bb-request-next="1"/);
    assert.doesNotMatch(create, /Mark as Urgent|Tap to upload|Max 5MB|24.?48 hours|type="file"|name="attachment"/i);
    assert.match(detail, /data-bb-request-history="1"/);
    assert.match(detail, /data-bb-request-success="1"/);
    assert.match(detail, /bb-mp-timeline/);
    assert.match(detail, /h\.toStatusLabel|h\.note/);
    assert.doesNotMatch(detail, /changedByUserId|memberVisible|crisis hotline|chat/i);
    assert.match(css, /\.bb-mp-req-summary/);
    assert.match(css, /\.bb-mp-req-card/);
    assert.match(css, /\.bb-mp-req-panel/);
    assert.match(css, /\.bb-mp-timeline/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });

  it("member giving keeps published methods only without checkout or fabricated balances", () => {
    const giving = read("views/blessboard/v5/member/giving.ejs");
    const css = read("public/blessboard/v5/member-portal.css");
    assert.match(giving, /data-bb-stitch-giving="24-member-giving-information"/);
    assert.match(giving, /data-bb-member-giving="1"/);
    assert.match(giving, /data-bb-giving-info-only="1"/);
    assert.match(giving, /data-bb-giving-empty="catalog"/);
    assert.match(giving, /data-bb-giving-methods="1"/);
    assert.match(giving, /data-bb-giving-instructions="1"/);
    assert.match(giving, /data-bb-giving-disclaimer="1"/);
    assert.match(giving, /Information only|instructional/i);
    assert.match(giving, /Open published link/);
    assert.match(giving, /method\.typeLabel/);
    assert.match(giving, /method\.instructions/);
    assert.match(giving, /method\.externalUrl/);
    assert.doesNotMatch(
      giving,
      /Scan to Give|Generate One-Time Link|85%|Merchant Code|donation history|Your balance|Give Online|Donate Now/i
    );
    assert.match(css, /\.bb-mp-giving-hero/);
    assert.match(css, /\.bb-mp-giving-notice/);
    assert.match(css, /\.bb-mp-giving-card__instructions/);
    assert.match(css, /\.bb-mp-giving-grid/);
    assert.match(css, /@media \(min-width:\s*700px\)/);
  });
});

describe("blessboard v5 a11y structure — viewport CSS breakpoints present", () => {
  it("admin shells define desktop sidebar breakpoint at 900px", () => {
    for (const rel of [
      "public/blessboard/v5/hq-admin.css",
      "public/blessboard/v5/branch-admin.css",
      "public/blessboard/v5/member-portal.css",
      "public/blessboard/v5/platform-admin.css",
    ]) {
      const css = read(rel);
      assert.match(css, /@media \(min-width:\s*900px\)/, rel);
    }
  });

  it("events and sermons templates expose media/register aria-labels and empty roles", () => {
    const events = read("views/blessboard/v5/public/events.ejs");
    const sermons = read("views/blessboard/v5/public/sermons.ejs");
    assert.match(events, /role="status"/);
    assert.match(events, /data-bb-empty="events"/);
    assert.match(events, /aria-label="Register for/);
    assert.match(events, /aria-label="Featured event"/);
    assert.match(events, /data-bb-stitch-events="populated-v2"/);
    assert.match(events, /Community Calendar/);
    assert.match(events, /Upcoming Events/);
    assert.doesNotMatch(events, /View Past Events|All Events|Conferences|Remind Me|Get Access/i);
    assert.doesNotMatch(events, /Past Events Archive|Weekly Worship|Cell Groups/i);
    assert.doesNotMatch(events, /iframe|youtube\.com\/embed/i);
    assert.match(sermons, /role="status"/);
    assert.match(sermons, /data-bb-empty="sermons"/);
    assert.match(sermons, /aria-label="<%= mediaLabel/);
    assert.match(sermons, /aria-label="<%= resourceLabel/);
    assert.match(sermons, /No sermons published/);
    assert.doesNotMatch(sermons, /iframe|youtube\.com\/embed/i);
  });

  it("events template keeps Stitch list hierarchy without fabricated filters or past archive", () => {
    const events = read("views/blessboard/v5/public/events.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(events, /data-bb-stitch-events="populated-v2"/);
    assert.match(events, /aria-label="Events"/);
    assert.match(events, /Featured Gathering/);
    assert.match(events, /formatEventParts/);
    assert.match(events, /registrationUrl/);
    assert.match(events, /data-bb-event-register="1"/);
    assert.match(events, /role="img"/);
    assert.match(css, /\.bb-tp-events-hero__title-accent/);
    assert.match(css, /\.bb-tp-featured-event__card/);
    assert.match(css, /\.bb-tp-event-card__date/);
    assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*\.bb-tp-event-card/);
  });

  it("sermons template keeps Stitch featured/list hierarchy without series or archive chrome", () => {
    const sermons = read("views/blessboard/v5/public/sermons.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(sermons, /data-bb-stitch-sermons="populated-v2"/);
    assert.match(sermons, /aria-label="Sermons"/);
    assert.match(sermons, /Teaching Library/);
    assert.match(sermons, /Featured Sermon/);
    assert.match(sermons, /Latest Release/);
    assert.match(sermons, /Recent Sermons/);
    assert.match(sermons, /sermonMediaKind/);
    assert.match(sermons, /sermonResourceKind/);
    assert.match(sermons, /role="img"/);
    assert.match(sermons, /data-bb-sermon-media="1"/);
    assert.match(sermons, /data-bb-sermon-resource="1"/);
    assert.doesNotMatch(sermons, /Notify Me|View Past Series|View Archive|All Messages|SERIES:/i);
    assert.doesNotMatch(sermons, /Ephesians|42:15|iframe|youtube\.com\/embed/i);
    assert.match(css, /\.bb-tp-sermons-hero__title-accent/);
    assert.match(css, /\.bb-tp-featured-sermon__card/);
    assert.match(css, /\.bb-tp-sermon-card__media/);
    assert.match(css, /\.bb-tp-featured-sermon__play--mobile/);
  });

  it("home template keeps Stitch hero hierarchy without fabricated widgets", () => {
    const home = read("views/blessboard/v5/public/home.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(home, /data-bb-stitch-home="refined-v2"/);
    assert.match(home, /aria-label="Welcome"/);
    assert.match(home, /Join a Service/);
    assert.match(home, /Join Our Next Service/);
    assert.match(home, /Explore Ministries/);
    assert.match(home, /role="status"/);
    assert.match(home, /data-bb-empty="home"/);
    assert.match(home, /Already a Member\?/);
    assert.doesNotMatch(home, /1\.2k\+|Need Prayer|Weekly Service Times|Active Members/i);
    assert.match(css, /\.bb-tp-hero__title-accent/);
    assert.match(css, /\.bb-tp-hero__cta-desktop/);
    assert.match(css, /@media \(max-width:\s*767px\)/);
    assert.match(css, /aspect-ratio:\s*1\s*\/\s*1/);
  });

  it("about template keeps Stitch hierarchy without fabricated stats or story chrome", () => {
    const about = read("views/blessboard/v5/public/about.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(about, /data-bb-stitch-about="populated-v3"/);
    assert.match(about, /aria-label="About"/);
    assert.match(about, /About Us/);
    assert.match(about, /Our Identity/);
    assert.match(about, /Get Connected/);
    assert.match(about, /Join Our Community/);
    assert.match(about, /Plan Your Visit/);
    assert.match(about, /Member Login/);
    assert.match(about, /role="status"/);
    assert.match(about, /data-bb-empty="about"/);
    assert.match(about, /Our Purpose/);
    assert.match(about, /Core Values/);
    assert.doesNotMatch(about, /Watch Our Story|1,200\+|Year Established|Download Annual Report/i);
    assert.doesNotMatch(about, /Hearts transformed|Active Programs|Community Impact/i);
    assert.match(css, /\.bb-tp-about-hero__title-accent/);
    assert.match(css, /\.bb-tp-about-story__media--collage/);
    assert.match(css, /\.bb-tp-about-purpose__grid--pair/);
    assert.match(css, /\.bb-tp-about__join-cta-mobile/);
  });

  it("leadership template keeps Stitch hierarchy without invented people or groups", () => {
    const leadership = read("views/blessboard/v5/public/leadership.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(leadership, /data-bb-stitch-leadership="populated-v2"/);
    assert.match(leadership, /aria-label="Leadership"/);
    assert.match(leadership, /Faith &amp; Community/);
    assert.match(leadership, /Want to serve with us\?/);
    assert.match(leadership, /Explore Ministries/);
    assert.match(leadership, /role="status"/);
    assert.match(leadership, /data-bb-empty="leadership"/);
    assert.match(leadership, /role="img"/);
    assert.match(leadership, /initials\(/);
    assert.match(leadership, /Ministry Leaders/);
    assert.doesNotMatch(leadership, /Contact Pastor|View Profile|Pastoral Team|Church Elders/i);
    assert.doesNotMatch(leadership, /Community Led|Live Updates|Rev\. Dr\. Samuel/i);
    assert.match(css, /\.bb-tp-leadership-hero__title-accent/);
    assert.match(css, /\.bb-tp-featured-leader__card/);
    assert.match(css, /\.bb-tp-leadership-hero \.bb-tp-dir-hero__title\s*\{[^}]*color:\s*var\(--bb-ink\)/);
    assert.match(leadership, /bb-tp-featured-leader__label/);
    assert.match(leadership, /<h2 class="bb-tp-featured-leader__name"/);
    assert.match(css, /\.bb-tp-leader-card__media\.is-fallback/);
    assert.match(css, /\.bb-tp-avatar--xl/);
  });

  it("ministries template keeps Stitch cards without unsupported actions or sample data", () => {
    const ministries = read("views/blessboard/v5/public/ministries.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(ministries, /data-bb-stitch-ministries="populated-v4"/);
    assert.match(ministries, /aria-label="Ministries"/);
    assert.match(ministries, /Our Impact/);
    assert.match(ministries, /Our Community/);
    assert.match(ministries, /Join a Ministry/);
    assert.match(ministries, /View Events/);
    assert.match(ministries, /Still looking for your place\?/);
    assert.match(ministries, /role="status"/);
    assert.match(ministries, /data-bb-empty="ministries"/);
    assert.match(ministries, /meetingDay/);
    assert.match(ministries, /role="img"/);
    assert.doesNotMatch(ministries, /Learn More|Join Team|View Schedule|Contact Leader|Download/i);
    assert.doesNotMatch(ministries, /All Ministries|Global Missions|500\+|Kingdom Kids/i);
    assert.doesNotMatch(ministries, /bb-tp-ministry-filter|data-bb-filter=/);
    assert.match(css, /\.bb-tp-ministries-hero__title-accent/);
    assert.match(css, /\.bb-tp-ministry-card--featured/);
    assert.match(css, /\.bb-tp-ministry-card__fallback-icon/);
    assert.match(css, /@media \(max-width:\s*767px\)[\s\S]*\.bb-tp-ministry-card/);
  });

  it("tenant public CSS keeps events/sermons overflow and 320px guards", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-event-grid/);
    assert.match(css, /\.bb-tp-sermon-grid/);
    assert.match(css, /\.bb-tp-event-card[^{]*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-tp-sermon-card[^{]*\{[^}]*min-width:\s*0/);
    assert.match(css, /@media \(max-width:\s*320px\)/);
  });

  it("contact and giving templates keep safe semantics without payment or contact forms", () => {
    const contact = read("views/blessboard/v5/public/contact.ejs");
    const giving = read("views/blessboard/v5/public/giving.ejs");
    assert.match(contact, /role="status"/);
    assert.match(contact, /data-bb-empty="contact"/);
    assert.match(contact, /aria-label="Email/);
    assert.match(contact, /aria-label="Call/);
    assert.match(contact, /data-bb-contact-map="unavailable"/);
    assert.match(contact, /data-bb-contact-form="unavailable"/);
    assert.match(contact, /Send a Message/);
    assert.doesNotMatch(contact, /<form|name="_csrf"|csrfField|name="full_name"|name="message"/i);
    assert.match(giving, /role="note"/);
    assert.match(giving, /data-bb-giving-notice="1"/);
    assert.match(giving, /does not process payments/i);
    assert.match(giving, /Open published link/);
    assert.match(giving, /data-bb-giving-instructions="1"/);
    assert.doesNotMatch(giving, /<form|Give Online|Donate Now|card number|cvv/i);
  });

  it("contact template keeps Stitch cards/map hierarchy without invented hours or POST form", () => {
    const contact = read("views/blessboard/v5/public/contact.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(contact, /data-bb-stitch-contact="populated-v2"/);
    assert.match(contact, /aria-label="Contact"/);
    assert.match(contact, /Connect With Us/);
    assert.match(contact, /Contact Us/);
    assert.match(contact, /bb-tp-contact-main/);
    assert.match(contact, /data-bb-contact-message="unavailable"/);
    assert.match(contact, /phoneHref|emailHref|channel\.href/);
    assert.match(contact, /mapEmbedUrl|directionsUrl/);
    assert.doesNotMatch(contact, /Service Times|Office Hours|Stay Connected With|newsletter/i);
    assert.doesNotMatch(contact, /method="post"|action="\/contact"/i);
    assert.match(css, /\.bb-tp-contact-hero__title-accent/);
    assert.match(contact, /bb-tp-contact-card__label/);
    assert.match(contact, /<h3 class="bb-tp-contact-card__label"/);
    assert.match(css, /\.bb-tp-contact-main/);
    assert.match(css, /\.bb-tp-contact-message/);
    assert.match(css, /\.bb-tp-contact-map__frame/);
  });

  it("giving template keeps Stitch info-only hierarchy without payment or invented accounts", () => {
    const giving = read("views/blessboard/v5/public/giving.ejs");
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(giving, /data-bb-stitch-giving="populated-v2"/);
    assert.match(giving, /aria-label="Giving"/);
    assert.match(giving, /Faithful Stewardship/);
    assert.match(giving, /Ways to Give/);
    assert.match(giving, /Explore Ways to Give/);
    assert.match(giving, /data-bb-giving-instructions="1"/);
    assert.match(giving, /Open published link/);
    assert.match(giving, /Contact for details/);
    assert.match(giving, /externalUrl/);
    assert.doesNotMatch(giving, /Give Online|Donate Now|Scan to Give|Merchant ID|Current Impact|Your Recent Contributions/i);
    assert.doesNotMatch(giving, /Standard Chartered|Airtel Money|1\.2k|amount|card number|<form/i);
    assert.match(css, /\.bb-tp-giving-hero__title-accent/);
    assert.match(css, /\.bb-tp-giving-notice/);
    assert.match(css, /\.bb-tp-giving-card__instructions/);
    assert.match(css, /\.bb-tp-giving-card__body/);
  });

  it("tenant public CSS keeps contact/giving overflow guards", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-contact-card[^{]*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-tp-giving-card[^{]*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-tp-giving-notice/);
    assert.match(css, /\.bb-tp-contact-map__unavailable/);
    assert.match(css, /\.bb-tp-sermon-card__actions a:focus-visible/);
    assert.match(css, /\.bb-tp-featured-sermon__play:focus-visible/);
    assert.match(css, /\.bb-tp-contact-card__value a:focus-visible/);
    assert.match(css, /\.bb-tp-featured-sermon__card:has\(\.bb-tp-featured-sermon__play--mobile\)/);
  });

  it("tenant auth templates preserve CSRF fields and omit unsupported auth chrome", () => {
    const register = read("views/blessboard/v5/public/register.ejs");
    const submitted = read("views/blessboard/v5/public/register-submitted.ejs");
    const login = read("views/blessboard/v5/apex/login.ejs");
    const authError = read("views/blessboard/v5/apex/auth-error.ejs");
    assert.match(register, /method="post"/);
    assert.match(register, /action="\/register"/);
    assert.match(register, /name="<%= csrfField %>"/);
    assert.match(register, /name="first_name"/);
    assert.match(register, /name="last_name"/);
    assert.match(register, /name="preferred_name"/);
    assert.match(register, /name="email"/);
    assert.match(register, /name="phone"/);
    assert.match(register, /data-bb-auth-privacy="1"/);
    assert.match(register, /data-bb-auth-group="personal"/);
    assert.match(register, /data-bb-auth-group="contact"/);
    assert.match(register, /role="alert"/);
    assert.match(register, /Submit Registration/);
    assert.match(register, /Email Address/);
    assert.match(register, /Phone Number/);
    assert.doesNotMatch(register, /name="password"|name="gender"|Forgot password|waiting.?verification/i);
    assert.match(submitted, /data-bb-register-submitted="1"/);
    assert.match(submitted, /data-bb-stitch-register-submitted="11-auth-registration-submitted"/);
    assert.match(submitted, /role="status"/);
    assert.match(submitted, /Registration Submitted/);
    assert.match(submitted, /data-bb-register-next="1"/);
    assert.match(submitted, /Return Home/);
    assert.match(submitted, /Contact Office/);
    assert.doesNotMatch(submitted, /24\s*-\s*48|Submission ID|Est\.\s*Processing/i);
    assert.doesNotMatch(submitted, /Watch for a message|email confirmation|email notification|SMS verification/i);
    assert.doesNotMatch(submitted, /account has been created|automatically granted/i);
    assert.match(login, /name="_csrf"/);
    assert.match(login, /name="email"/);
    assert.match(login, /name="password"/);
    assert.match(login, /data-bb-stitch-login="09-auth-member-login"/);
    assert.match(login, /bb-auth-transfer-status/);
    assert.match(login, /data-bb-auth-transfer-status="continue"/);
    assert.match(login, /Skip to sign-in form/);
    assert.doesNotMatch(login, /Forgot password|name="next"|name="return_to"/i);
    assert.doesNotMatch(login, /Register as Member|Continue with Google|social.?login/i);
    assert.match(authError, /href="\/login"/);
    assert.match(authError, /Skip to content/);
    assert.match(authError, /bb-auth-card--error/);
    assert.match(authError, /data-bb-auth-error-card/);
    assert.doesNotMatch(authError, /name="tr"|name="transfer"|name="next"|name="return_to"/i);
    assert.doesNotMatch(authError, /value="<%=.*token|raw-transfer/i);
  });

  it("apex login transfer and auth-error CSS keep status chrome without token surfaces", () => {
    const css = read("public/blessboard/v5/tenant-auth.css");
    const apexCss = read("public/blessboard/v5/apex-auth.css");
    assert.match(css, /\.bb-auth-transfer-status__title/);
    assert.match(css, /\.bb-auth-card--error/);
    assert.match(css, /\.bb-auth-badge--error/);
    assert.match(css, /\.bb-auth-card--login/);
    assert.match(apexCss, /\.bb-auth-login \.bb-auth-card--login/);
    assert.match(apexCss, /prefers-reduced-motion:\s*reduce/);
  });

  it("registration template keeps Stitch grouping without unsupported wizard fields", () => {
    const register = read("views/blessboard/v5/public/register.ejs");
    const css = read("public/blessboard/v5/tenant-auth.css");
    assert.match(register, /data-bb-stitch-register="10-auth-member-registration"/);
    assert.match(register, /Join Our Community/);
    assert.match(register, /Personal Info/);
    assert.match(register, /Personal Information/);
    assert.match(register, /bb-auth-required/);
    assert.match(register, /hint-preferredName/);
    assert.match(register, /bb-auth-contact-hint/);
    assert.doesNotMatch(register, /name="ministry"|name="address"|name="emergency"|Continue\b/i);
    assert.match(css, /\.bb-auth-card__hero-eyebrow--mobile/);
    assert.match(css, /\.bb-auth-fieldset__legend-mobile/);
    assert.match(css, /\.bb-auth-form--register/);
  });

  it("registration submitted template keeps Stitch success chrome without fabricated timing", () => {
    const submitted = read("views/blessboard/v5/public/register-submitted.ejs");
    const css = read("public/blessboard/v5/tenant-auth.css");
    assert.match(submitted, /data-bb-shell="tenant-auth"/);
    assert.match(submitted, /check_circle/);
    assert.match(submitted, /Pending review/);
    assert.match(submitted, /Success/);
    assert.match(submitted, /bb-auth-callout/);
    assert.match(css, /\.bb-auth-card__icon--xl/);
    assert.match(css, /\.bb-auth-callout/);
    assert.match(css, /\.bb-auth-badge--pending/);
    assert.match(css, /\.bb-auth-card--submitted/);
  });

  it("tenant-auth CSS keeps 320px overflow guards and reduced motion", () => {
    const css = read("public/blessboard/v5/tenant-auth.css");
    assert.match(css, /@media \(max-width:\s*320px\)/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /\.bb-auth-card__hero/);
    assert.match(css, /\.bb-auth-transfer-status/);
  });
});
