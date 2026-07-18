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
      if (shell.name === "member") {
        assert.match(start, /role="dialog"/);
        assert.match(start, /aria-modal="true"/);
        assert.match(start, /\binert\b/);
        assert.match(start, /tabindex="-1"/);
        assert.match(start, /bb-mp-drawer__close/);
        assert.match(start, /data-bb-member-role/);
        assert.match(start, /data-bb-page-area/);
        assert.match(start, /aria-label="Profile"/);
        assert.match(end, /data-bb-nav="mobile-tabs"/);
        assert.match(end, /powered-by-getpro/);
        assert.doesNotMatch(start, /href="\/member\/prayer"/);
        assert.doesNotMatch(start, /notifications/i);
      }
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
    assert.match(js, /inert/);
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
    assert.match(detail, /\/_bb\/media\/<%= att\.mediaAssetId %>/);
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
