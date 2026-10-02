"use strict";

/**
 * Classic Church Admin mobile grouped navigation (Branch + HQ drawers).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ejs = require("ejs");
const { describe, it } = require("node:test");

const {
  CLASSIC_BRANCH_ADMIN_NAV,
  CLASSIC_HQ_ADMIN_NAV,
  buildClassicBranchNavItems,
  buildClassicHqNavItems,
  buildClassicBranchMobileNav,
  buildClassicHqMobileNav,
} = require("../src/church/http/classicAdminNav");
const { flattenMobileNavKeys } = require("../src/blessboard/http/adminMobileNavGroups");
const { inferHqActiveNav } = require("../src/routes/church/hqAdminShared");

const root = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("classic church admin mobile nav groups", () => {
  it("Branch canonical routes stay distinct for Attendance and Giving", () => {
    const items = buildClassicBranchNavItems({});
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    assert.equal(byKey.members.href, "/branch/members");
    assert.equal(byKey.verification.href, "/branch/member-verification");
    assert.equal(byKey.attendance.href, "/branch/attendance");
    assert.equal(byKey["giving-summary"].href, "/branch/giving-summary");
    assert.equal(byKey["giving-settings"].href, "/branch/giving-settings");
    assert.equal(byKey.website.href, "/branch/website-editor");
    assert.notEqual(byKey.attendance.href, byKey["giving-summary"].href);
  });

  it("HQ canonical routes keep Attendance, Giving, and Broadcasts separate", () => {
    const items = buildClassicHqNavItems({ includeMemberVerification: true });
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    assert.equal(byKey.members.href, "/hq/members");
    assert.equal(byKey.verification.href, "/hq/member-verification");
    assert.equal(byKey.verification.label, "Member Verification");
    assert.equal(byKey.attendance.href, "/hq/attendance");
    assert.equal(byKey["giving-summary"].href, "/hq/giving-summary");
    assert.equal(byKey.broadcasts.href, "/hq/broadcasts");
    assert.notEqual(byKey.attendance.href, byKey["giving-summary"].href);
    assert.ok(items.findIndex((i) => i.key === "members") < items.findIndex((i) => i.key === "verification"));
  });

  it("HQ Member Verification is omitted without Growth cross-branch access", () => {
    const foundation = buildClassicHqNavItems({ includeMemberVerification: false });
    assert.ok(foundation.some((i) => i.key === "members"));
    assert.ok(!foundation.some((i) => i.key === "verification"));
    assert.equal(foundation.filter((i) => i.href === "/hq/member-verification").length, 0);

    const growth = buildClassicHqNavItems({ includeMemberVerification: true });
    assert.equal(growth.filter((i) => i.key === "verification").length, 1);
    const model = buildClassicHqMobileNav(growth, "verification");
    const people = model.sections.find((s) => s.id === "people");
    assert.ok(people);
    assert.equal(people.open, true);
    assert.ok(people.items.some((i) => i.key === "members"));
    assert.ok(people.items.some((i) => i.key === "verification"));
    assert.equal(people.items.filter((i) => i.key === "verification").length, 1);
  });

  it("inferHqActiveNav marks verification queue separately from members directory", () => {
    assert.equal(inferHqActiveNav({ path: "/hq/member-verification" }), "verification");
    assert.equal(inferHqActiveNav({ path: "/hq/member-verification?q=a&branch_id=2" }), "verification");
    assert.equal(inferHqActiveNav({ path: "/hq/members" }), "members");
    assert.equal(inferHqActiveNav({ path: "/hq/members/12" }), "members");
  });

  it("Branch mobile model groups links, pins Dashboard, opens active group, no duplicates", () => {
    const items = buildClassicBranchNavItems({
      packageFeatureNav: [
        {
          navKey: "groups",
          label: "Groups",
          path: "/branch/groups",
          state: "available",
        },
      ],
    });
    const model = buildClassicBranchMobileNav(items, "giving-settings");
    const keys = flattenMobileNavKeys(model);
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(keys.sort(), items.map((i) => i.key).sort());
    assert.equal(model.primary.length, 1);
    assert.equal(model.primary[0].key, "dashboard");
    assert.equal(model.account[0].key, "account");
    const giving = model.sections.find((s) => s.id === "giving");
    assert.ok(giving);
    assert.equal(giving.open, true);
    assert.ok(giving.items.some((i) => i.key === "giving-summary"));
    assert.ok(giving.items.some((i) => i.key === "giving-settings"));
    assert.equal(model.sections.filter((s) => s.open).length, 1);
    const people = model.sections.find((s) => s.id === "people");
    assert.ok(people.items.some((i) => i.key === "attendance"));
    assert.ok(!people.items.some((i) => i.key === "giving-summary"));
  });

  it("HQ mobile model groups links and omits empty groups", () => {
    const slim = [
      { key: "dashboard", label: "Dashboard", href: "/hq/dashboard", icon: "dashboard" },
      { key: "members", label: "Members", href: "/hq/members", icon: "group" },
      { key: "account", label: "Account", href: "/hq/account", icon: "manage_accounts" },
    ];
    const model = buildClassicHqMobileNav(slim, "members");
    assert.equal(model.sections.length, 1);
    assert.equal(model.sections[0].id, "people");
    assert.equal(model.sections[0].open, true);
    assert.ok(!model.sections.some((s) => s.id === "giving"));
  });

  it("upgrade-only package features stay in the model; hidden features are omitted by listNavFeatureGates callers", () => {
    const items = buildClassicBranchNavItems({
      packageFeatureNav: [
        {
          navKey: "appointments",
          label: "Appointments",
          path: "/branch/appointments",
          state: "upgrade",
        },
      ],
    });
    assert.ok(items.some((i) => i.key === "appointments" && i.lockLabel === "Upgrade"));
    const model = buildClassicBranchMobileNav(items, "appointments");
    const admin = model.sections.find((s) => s.id === "administration");
    assert.ok(admin);
    assert.equal(admin.open, true);
    assert.ok(admin.items.some((i) => i.key === "appointments"));
  });

  it("desktop shell stays flat; mobile drawers use grouped partial", () => {
    const branchShell = read("views/church/partials/branch_admin_shell_start.ejs");
    const hqShell = read("views/church/partials/hq_shell_start.ejs");
    const branchEnd = read("views/church/partials/branch_admin_shell_end.ejs");
    const hqEnd = read("views/church/partials/hq_shell_end.ejs");

    assert.match(branchShell, /church-branch-sidebar__nav[\s\S]*branch_admin_nav/);
    assert.match(branchShell, /church-branch-drawer[\s\S]*admin_mobile_nav_groups/);
    assert.match(hqShell, /hq_admin_nav/);
    assert.match(hqShell, /church-hq-drawer[\s\S]*admin_mobile_nav_groups/);
    assert.match(branchEnd, /data-church-nav-group-toggle/);
    assert.match(hqEnd, /data-church-nav-group-toggle/);
    assert.match(branchEnd, /menuBtn\.focus/);
    assert.match(hqEnd, /menuBtn\.focus/);
    assert.match(branchEnd, /Escape/);
    assert.match(hqEnd, /Escape/);
  });

  it("shared partial renders accordion toggles with a11y attributes", () => {
    const items = buildClassicBranchNavItems({});
    const mobileNav = buildClassicBranchMobileNav(items, "members");
    const html = ejs.render(read("views/church/partials/admin_mobile_nav_groups.ejs"), {
      mobileNav,
      navActive: "members",
      idPrefix: "church-branch",
    });
    assert.match(html, /data-church-mobile-nav="grouped"/);
    assert.match(html, /data-testid="admin-mobile-nav-grouped"/);
    assert.match(html, /aria-controls="church-branch-nav-group-people"/);
    assert.match(html, /aria-expanded="true"/);
    assert.match(html, /data-church-nav-group-toggle="1"/);
    assert.match(html, /href="\/branch\/members"/);
    assert.match(html, /href="\/branch\/dashboard"/);
    assert.equal((html.match(/href="\/branch\/members"/g) || []).length, 1);
  });

  it("canonical branch and HQ base lists do not duplicate keys", () => {
    const branchKeys = CLASSIC_BRANCH_ADMIN_NAV.map((i) => i.key);
    const hqKeys = CLASSIC_HQ_ADMIN_NAV.map((i) => i.key);
    assert.equal(new Set(branchKeys).size, branchKeys.length);
    assert.equal(new Set(hqKeys).size, hqKeys.length);
  });
});
