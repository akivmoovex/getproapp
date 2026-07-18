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
    });

    it(`${shell.name} CSS locks scroll, clips overflow, exposes focus-visible and reduced motion`, () => {
      const css = read(shell.css);
      assert.match(css, new RegExp(`${shell.openClass}[^{]*\\{[^}]*overflow:\\s*hidden`));
      assert.match(css, new RegExp(`${shell.body}[^{]*\\{[^}]*overflow-x:\\s*clip`));
      assert.match(css, /:focus-visible/);
      assert.match(css, /prefers-reduced-motion:\s*reduce/);
      assert.match(css, /--bb-touch-min|min-height:\s*var\(--bb-touch-min/);
    });
  }

  it("platform mobile tabs use four columns for four shortcuts", () => {
    const css = read("public/blessboard/v5/platform-admin.css");
    const nav = read("src/platform/http/platformAdminNav.js");
    assert.match(nav, /PLATFORM_ADMIN_MOBILE_TABS/);
    assert.match(css, /grid-template-columns:\s*repeat\(4,/);
    assert.doesNotMatch(css, /\.bb-pa-mobile-tabs\s*\{[^}]*repeat\(3,/);
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
    assert.match(end, /footerNavItems|navItems\.forEach|href="\/leadership"/);
    assert.match(end, /href="\/contact"/);
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
    assert.match(start, /role="dialog"/);
    assert.match(start, /aria-modal="true"/);
    assert.match(start, /href="#bb-apex-main"/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /:focus-visible/);
  });
});

describe("blessboard v5 a11y structure — shell-nav + media picker", () => {
  it("shell-nav binds Escape, focus restore, dialog semantics, and Tab cycle", () => {
    const js = read("public/blessboard/v5/shell-nav.js");
    assert.match(js, /Escape/);
    assert.match(js, /aria-modal/);
    assert.match(js, /role.*dialog|setAttribute\("role", "dialog"\)/);
    assert.match(js, /toggle\.focus/);
    assert.match(js, /Tab/);
    assert.doesNotMatch(js, /fetch\s*\(/);
  });

  it("media picker dialogs are labelled; archive confirm and reduced motion present", () => {
    const js = read("public/blessboard/v5/media-picker.js");
    const css = read("public/blessboard/v5/media-picker.css");
    assert.match(js, /aria-labelledby/);
    assert.match(js, /bb-media-picker-title/);
    assert.match(js, /bb-media-archive-title/);
    assert.match(js, /showModal/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /--bb-touch-min/);
  });

  it("form error summary partial remains an assertive alert", () => {
    const src = read("views/blessboard/v5/partials/form-errors.ejs");
    assert.match(src, /role="alert"/);
    assert.match(src, /aria-live="assertive"/);
    assert.match(src, /tabindex="-1"/);
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
    assert.match(sermons, /role="status"/);
    assert.match(sermons, /data-bb-empty="sermons"/);
    assert.match(sermons, /aria-label="<%= mediaLabel/);
    assert.match(sermons, /aria-label="Open resources for sermon:/);
    assert.doesNotMatch(events, /iframe|youtube\.com\/embed/i);
    assert.doesNotMatch(sermons, /iframe|youtube\.com\/embed/i);
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
    assert.doesNotMatch(contact, /<form|Send a Message|csrf|_csrf/i);
    assert.match(giving, /role="note"/);
    assert.match(giving, /data-bb-giving-notice="1"/);
    assert.match(giving, /does not process payments/i);
    assert.match(giving, /Open published link/);
    assert.doesNotMatch(giving, /<form|Give Online|Donate Now|card number|cvv/i);
  });

  it("tenant public CSS keeps contact/giving overflow guards", () => {
    const css = read("public/blessboard/v5/tenant-public.css");
    assert.match(css, /\.bb-tp-contact-card[^{]*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-tp-giving-card[^{]*\{[^}]*min-width:\s*0/);
    assert.match(css, /\.bb-tp-giving-notice/);
    assert.match(css, /\.bb-tp-contact-map__unavailable/);
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
    assert.match(register, /data-bb-auth-privacy="1"/);
    assert.match(register, /role="alert"/);
    assert.doesNotMatch(register, /name="password"|name="gender"|Forgot password|waiting.?verification/i);
    assert.match(submitted, /data-bb-register-submitted="1"/);
    assert.doesNotMatch(submitted, /24\s*-\s*48|Submission ID|Est\.\s*Processing/i);
    assert.doesNotMatch(submitted, /Watch for a message|SMS|email verification/i);
    assert.match(login, /name="_csrf"/);
    assert.match(login, /name="email"/);
    assert.match(login, /name="password"/);
    assert.doesNotMatch(login, /Forgot password|name="next"|name="return_to"/i);
    assert.match(authError, /href="\/login"/);
    assert.doesNotMatch(authError, /name="tr"|name="transfer"|name="next"|name="return_to"/i);
    assert.doesNotMatch(authError, /value="<%=.*token|raw-transfer/i);
  });

  it("tenant-auth CSS keeps 320px overflow guards and reduced motion", () => {
    const css = read("public/blessboard/v5/tenant-auth.css");
    assert.match(css, /@media \(max-width:\s*320px\)/);
    assert.match(css, /prefers-reduced-motion:\s*reduce/);
    assert.match(css, /\.bb-auth-card__hero/);
    assert.match(css, /\.bb-auth-transfer-status/);
  });
});
