"use strict";

/**
 * Church HQ / Branch admin mobile grouped navigation.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { describe, it } = require("node:test");

const {
  buildHqMobileNav,
  buildBranchMobileNav,
  flattenMobileNavKeys,
} = require("../src/blessboard/http/adminMobileNavGroups");
const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");
const { BRANCH_ADMIN_NAV } = require("../src/blessboard/http/branchAdminNav");
const { filterHqNavItems } = require("../src/blessboard/http/hqAdminShellLocals");
const { FEATURE_KEYS } = require("../src/platform/services/entitlementService");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function enabledNav(items) {
  return items.filter((item) => item.nav && item.enabled);
}

describe("blessboard admin mobile nav groups", () => {
  it("HQ foundation plan omits network-only links and never duplicates keys", () => {
    const navItems = filterHqNavItems(HQ_ADMIN_NAV, {
      [FEATURE_KEYS.EXECUTIVE_REPORTS]: false,
      [FEATURE_KEYS.ADVANCED_AUDIT]: false,
    });
    const model = buildHqMobileNav(navItems, "home");
    const keys = flattenMobileNavKeys(model);
    assert.equal(new Set(keys).size, keys.length, "duplicate nav keys");
    assert.deepEqual(
      keys.sort(),
      navItems.map((i) => i.key).sort(),
      "mobile model must cover filtered nav exactly"
    );
    assert.ok(!keys.includes("executive"));
    assert.ok(!keys.includes("governance"));
    assert.ok(model.primary.some((i) => i.key === "home"));
    assert.ok(model.primary.some((i) => i.key === "members"));
    assert.ok(model.primary.some((i) => i.key === "attendance"));
    assert.ok(model.primary.some((i) => i.key === "giving"));
    assert.ok(model.primary.some((i) => i.key === "broadcasts"));
    assert.ok(model.primary.some((i) => i.key === "content"));
    assert.equal(model.account.length, 1);
    assert.equal(model.account[0].key, "account");
  });

  it("HQ network plan keeps executive + governance under Administration only", () => {
    const navItems = filterHqNavItems(HQ_ADMIN_NAV, {
      [FEATURE_KEYS.EXECUTIVE_REPORTS]: true,
      [FEATURE_KEYS.ADVANCED_AUDIT]: true,
    });
    const model = buildHqMobileNav(navItems, "executive");
    const admin = model.sections.find((s) => s.id === "administration");
    assert.ok(admin);
    assert.equal(admin.open, true);
    assert.ok(admin.items.some((i) => i.key === "executive"));
    assert.ok(admin.items.some((i) => i.key === "governance"));
    assert.equal(model.sections.filter((s) => s.open).length, 1);
  });

  it("HQ Website and Broadcasts point at canonical routes and stay separate from Attendance/Giving", () => {
    const navItems = filterHqNavItems(HQ_ADMIN_NAV, {});
    const model = buildHqMobileNav(navItems, "content");
    const website = model.primary.find((i) => i.key === "content");
    const broadcasts = model.primary.find((i) => i.key === "broadcasts");
    const attendance = model.primary.find((i) => i.key === "attendance");
    const giving = model.primary.find((i) => i.key === "giving");
    assert.equal(website.href, "/hq/website");
    assert.equal(broadcasts.href, "/hq/broadcasts");
    assert.equal(attendance.href, "/hq/attendance");
    assert.equal(giving.href, "/hq/giving");
    assert.notEqual(attendance.href, giving.href);
    assert.ok(!model.sections.some((s) => s.items.some((i) => i.key === "content")));
    assert.ok(!model.sections.some((s) => s.items.some((i) => i.key === "giving")));
  });

  it("Branch admin model uses branch routes, separates Attendance and Giving, no duplicates", () => {
    const navItems = enabledNav(BRANCH_ADMIN_NAV);
    const model = buildBranchMobileNav(navItems, "website_submissions");
    const keys = flattenMobileNavKeys(model);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(keys.sort(), navItems.map((i) => i.key).sort());
    assert.equal(model.primary.find((i) => i.key === "website").href, "/branch-admin/website");
    assert.equal(model.primary.find((i) => i.key === "attendance").href, "/branch-admin/attendance");
    assert.equal(model.primary.find((i) => i.key === "giving").href, "/branch-admin/giving");
    const websiteGroup = model.sections.find((s) => s.id === "website");
    assert.ok(websiteGroup);
    assert.equal(websiteGroup.open, true);
    assert.ok(websiteGroup.items.some((i) => i.key === "content"));
    assert.ok(websiteGroup.items.some((i) => i.key === "website_submissions"));
    assert.ok(!model.primary.some((i) => i.key === "content"));
  });

  it("empty groups are omitted when items are filtered out", () => {
    const slim = [
      { key: "home", label: "Dashboard", href: "/hq", icon: "dashboard" },
      { key: "members", label: "Members", href: "/hq/members", icon: "badge" },
      { key: "account", label: "Account", href: "/hq/account", icon: "person" },
    ];
    const model = buildHqMobileNav(slim, "members");
    assert.equal(model.sections.length, 0);
    assert.equal(model.primary.length, 2);
    assert.equal(model.account.length, 1);
  });

  it("shared partial renders accordion toggles with a11y attributes", () => {
    const navItems = filterHqNavItems(HQ_ADMIN_NAV, {
      [FEATURE_KEYS.EXECUTIVE_REPORTS]: true,
      [FEATURE_KEYS.ADVANCED_AUDIT]: false,
    });
    const mobileNav = buildHqMobileNav(navItems, "branches");
    const file = path.join(root, "views/blessboard/v5/partials/admin-mobile-nav-groups.ejs");
    const html = ejs.render(read("views/blessboard/v5/partials/admin-mobile-nav-groups.ejs"), {
      mobileNav,
      activeNav: "branches",
      linkClass: "bb-hq-nav-link",
      listClass: "bb-hq-drawer__list",
      itemClass: "bb-hq-drawer__item",
      idPrefix: "bb-hq",
    }, { filename: file });
    assert.match(html, /data-bb-mobile-nav="grouped"/);
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /aria-controls="bb-hq-nav-group-administration"/);
    assert.match(html, /href="\/hq\/website"/);
    assert.match(html, /href="\/hq\/broadcasts"/);
    assert.match(html, /href="\/hq\/attendance"/);
    assert.match(html, /href="\/hq\/giving"/);
    assert.match(html, /aria-current="page"/);
    assert.match(html, /type="button"/);
    assert.doesNotMatch(html, /data-bb-nav-key="account"/);
  });

  it("HQ and Branch shells wire grouped mobile nav without changing desktop flat list", () => {
    const hq = read("views/blessboard/v5/partials/hq-shell-start.ejs");
    const ba = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    assert.match(hq, /admin-mobile-nav-groups/);
    assert.match(ba, /admin-mobile-nav-groups/);
    assert.match(hq, /data-bb-nav="desktop"/);
    assert.match(ba, /data-bb-nav="desktop"/);
    assert.match(hq, /hqNav\.forEach/);
    assert.match(ba, /baNav\.forEach/);
    assert.match(hq, /bb-hq-drawer__account/);
    assert.match(ba, /bb-ba-drawer__account/);
    assert.match(hq, /method="post" action="\/hq\/logout"/);
    assert.match(ba, /method="post" action="\/branch-admin\/logout"/);
  });

  it("drawer CSS scrolls links independently and locks body overflow", () => {
    const hqCss = read("public/blessboard/v5/hq-admin.css");
    const baCss = read("public/blessboard/v5/branch-admin.css");
    assert.match(hqCss, /body\.bb-hq-drawer-open\s*\{\s*overflow:\s*hidden/);
    assert.match(baCss, /body\.bb-ba-drawer-open\s*\{[\s\S]*?overflow:\s*hidden/);
    assert.match(hqCss, /\.bb-hq-drawer__links\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(baCss, /\.bb-ba-drawer__links\s*\{[\s\S]*?overflow-y:\s*auto/);
    assert.match(hqCss, /\.bb-hq-drawer__panel\s*\{[\s\S]*?overflow:\s*hidden/);
    assert.match(baCss, /\.bb-ba-drawer__panel\s*\{[\s\S]*?overflow:\s*hidden/);
    assert.match(hqCss, /safe-area-inset/);
    assert.match(baCss, /safe-area-inset/);
    assert.match(hqCss, /max-width:\s*100vw/);
    assert.match(baCss, /max-width:\s*100vw/);
  });

  it("shell-nav provides exclusive accordion + Escape/focus return contracts", () => {
    const js = read("public/blessboard/v5/shell-nav.js");
    assert.match(js, /bindMobileNavAccordion/);
    assert.match(js, /data-bb-nav-group-toggle/);
    assert.match(js, /Escape/);
    assert.match(js, /toggle\.focus/);
    assert.match(js, /bodyOpenClass/);
    assert.match(js, /isHiddenInTree/);
  });
});
