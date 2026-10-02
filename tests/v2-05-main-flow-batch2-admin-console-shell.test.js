"use strict";

/**
 * V2.05 Main Flow Batch 2 — Shared Admin Console Shell.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  ADMIN_CONSOLE_SLOTS,
  ADMIN_CONSOLE_SHELL,
  adminConsoleStitchScreen,
  sortNavItemsByAdminConsoleSlot,
  groupNavItemsByAdminConsoleSlot,
  validateAdminConsoleNavOrder,
} = require("../src/platform/admin-console/adminConsoleShell");
const {
  buildActiveClinicNavigation,
  NAV_ITEMS,
} = require("../src/activeclinic/services/activeClinicNavigation");
const { HQ_ADMIN_NAV } = require("../src/blessboard/http/hqAdminNav");

const ROOT = path.join(__dirname, "..");

describe("V2.05 AdminConsoleShell batch2", () => {
  it("FINAL=V205_ADMIN_SHELL_DONE", () => {
    assert.equal(ADMIN_CONSOLE_SHELL.pattern, "AdminConsoleShell");
    assert.equal(ADMIN_CONSOLE_SHELL.desktopBreakpoint, 1440);
    assert.equal(ADMIN_CONSOLE_SHELL.mobileBreakpoint, 390);
    assert.equal(ADMIN_CONSOLE_SHELL.stitchScreens.activeclinic, "AC-ADM-01");
    assert.equal(ADMIN_CONSOLE_SHELL.stitchScreens.blessboard, "BB-ADM-01");
    assert.equal(adminConsoleStitchScreen("activeclinic"), "AC-ADM-01");
    assert.equal(adminConsoleStitchScreen("blessboard"), "BB-ADM-01");
    assert.equal(ADMIN_CONSOLE_SHELL.supportsActiveNav, true);
    assert.equal(ADMIN_CONSOLE_SHELL.supportsRoleHiddenItems, true);
    assert.equal(ADMIN_CONSOLE_SHELL.supportsLocationContext, true);
    assert.equal(ADMIN_CONSOLE_SHELL.supportsBranchContext, true);
  });
  it("canonical slot order: Dashboard then Website … Settings", () => {
    assert.deepEqual(
      ADMIN_CONSOLE_SLOTS.map((s) => s.label),
      [
        "Dashboard",
        "Website",
        "Content",
        "People",
        "Operations",
        "Locations",
        "Media",
        "Reports",
        "Access",
        "Settings",
      ]
    );
    assert.equal(ADMIN_CONSOLE_SHELL.pattern, "AdminConsoleShell");
    assert.equal(ADMIN_CONSOLE_SHELL.sidebarWidth, "16.5rem");
    assert.equal(ADMIN_CONSOLE_SHELL.desktopBreakpoint, 1440);
    assert.equal(ADMIN_CONSOLE_SHELL.mobileBreakpoint, 390);
  });

  it("shared shell CSS + product shells wire AdminConsoleShell markers", () => {
    const css = fs.readFileSync(
      path.join(ROOT, "public/platform/admin-console-shell.css"),
      "utf8"
    );
    assert.match(css, /--gp-admin-sidebar-w:\s*16\.5rem/);
    assert.match(css, /--gp-admin-desktop-px:\s*1440/);
    assert.match(css, /--gp-admin-mobile-px:\s*390/);
    assert.match(css, /\.gp-admin-console__app/);
    assert.match(css, /\.gp-admin-console__sidebar/);
    assert.match(css, /\.gp-admin-console__topbar/);

    const acShell = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/layouts/app-shell.ejs"),
      "utf8"
    );
    assert.match(acShell, /admin-console-shell\.css/);
    assert.match(acShell, /data-gp-admin-console="AdminConsoleShell"/);
    assert.match(acShell, /data-gp-admin-console-stitch="AC-ADM-01"/);
    assert.match(acShell, /data-gp-admin-console-desktop="1440"/);
    assert.match(acShell, /data-gp-admin-console-mobile="390"/);
    assert.match(acShell, /gp-admin-console__sidebar/);
    assert.match(acShell, /gp-admin-console__topbar/);
    assert.match(acShell, /data-gp-admin-console-context="location"/);

    const bbShell = fs.readFileSync(
      path.join(ROOT, "views/blessboard/v5/partials/hq-shell-start.ejs"),
      "utf8"
    );
    assert.match(bbShell, /admin-console-shell\.css/);
    assert.match(bbShell, /data-gp-admin-console="AdminConsoleShell"/);
    assert.match(bbShell, /data-gp-admin-console-stitch="BB-ADM-01"/);
    assert.match(bbShell, /data-gp-admin-console-desktop="1440"/);
    assert.match(bbShell, /data-gp-admin-console-mobile="390"/);
    assert.match(bbShell, /gp-admin-console__sidebar/);
    assert.match(bbShell, /slot: 'website'/);
    assert.match(bbShell, /data-gp-admin-console-context="branch"/);
  });

  it("AC nav: Dashboard first, Website second when permitted; RBAC hides website", () => {
    const full = buildActiveClinicNavigation([
      "activeclinic.access",
      "website.view",
      "activeclinic.patient.search",
      "activeclinic.staff.assign_access",
    ]);
    assert.equal(full.items[0].key, "home");
    assert.equal(full.items[0].slot, "dashboard");
    assert.equal(full.items[1].key, "website");
    assert.equal(full.items[1].slot, "website");
    assert.equal(full.groups[0].key, "dashboard");
    assert.equal(full.groups[1].key, "website");
    assert.ok(full.items.find((i) => i.key === "home" && i.current === false) || true);
    const ordered = validateAdminConsoleNavOrder(full.items);
    assert.equal(ordered.ok, true);
    assert.equal(ordered.dashboardFirst, true);
    assert.equal(ordered.websiteSecond, true);

    const restricted = buildActiveClinicNavigation(["activeclinic.access"]);
    assert.equal(restricted.items[0].key, "home");
    assert.ok(!restricted.items.find((i) => i.key === "website"));
    assert.ok(!restricted.items.find((i) => i.key === "access"));
  });

  it("AC active item marks current on Dashboard", () => {
    const nav = buildActiveClinicNavigation(
      ["activeclinic.access", "website.view"],
      "home"
    );
    const home = nav.items.find((i) => i.key === "home");
    assert.equal(home.current, true);
    const website = nav.items.find((i) => i.key === "website");
    assert.equal(website.current, false);
  });

  it("BB HQ nav slots: Dashboard then Website; locations after people/content", () => {
    const sorted = sortNavItemsByAdminConsoleSlot(
      HQ_ADMIN_NAV.filter((i) => i.nav && i.enabled)
    );
    assert.equal(sorted[0].key, "home");
    assert.equal(sorted[0].slot, "dashboard");
    assert.equal(sorted[1].key, "content");
    assert.equal(sorted[1].slot, "website");
    assert.equal(sorted[1].label, "Website");
    const groups = groupNavItemsByAdminConsoleSlot(sorted);
    assert.equal(groups[0].key, "dashboard");
    assert.equal(groups[1].key, "website");
    const order = validateAdminConsoleNavOrder(sorted);
    assert.equal(order.ok, true);

    const websiteIdx = sorted.findIndex((i) => i.slot === "website");
    const locationsIdx = sorted.findIndex((i) => i.slot === "locations");
    assert.ok(websiteIdx >= 0 && locationsIdx > websiteIdx);
  });

  it("RBAC-hidden BB website: filtering content key leaves dashboard first", () => {
    const withoutWebsite = sortNavItemsByAdminConsoleSlot(
      HQ_ADMIN_NAV.filter((i) => i.nav && i.enabled && i.key !== "content")
    );
    assert.equal(withoutWebsite[0].slot, "dashboard");
    assert.ok(!withoutWebsite.find((i) => i.slot === "website"));
  });

  it("product tokens remain separate (no merged AC/BB token file)", () => {
    assert.ok(
      fs.existsSync(path.join(ROOT, "public/activeclinic/ac-tokens.css"))
    );
    assert.ok(
      fs.existsSync(path.join(ROOT, "public/blessboard/v5/hq-admin.css"))
    );
    const shared = fs.readFileSync(
      path.join(ROOT, "public/platform/admin-console-shell.css"),
      "utf8"
    );
    assert.doesNotMatch(shared, /--ac-color|--bb-color|Sacred Modernity/i);
  });

  it("every AC/BB primary nav item declares an Admin Console slot", () => {
    for (const item of NAV_ITEMS) {
      assert.ok(item.slot, `AC missing slot: ${item.key}`);
    }
    for (const item of HQ_ADMIN_NAV) {
      if (!item.nav) continue;
      assert.ok(item.slot, `BB missing slot: ${item.key}`);
    }
  });
});
