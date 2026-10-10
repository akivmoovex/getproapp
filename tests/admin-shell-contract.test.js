const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_ADMIN_SHELL_CONTRACT,
  normalizeAdminShellContract,
} = require("../src/platform/ui/adminShellContract");
const { createLegacyAdminAdapter } = require("../src/platform/ui/legacyAdminAdapter");
const {
  createBlessboardPlatformAdminAdapter,
} = require("../src/platform/ui/blessboardPlatformAdminAdapter");

test("admin shell contract normalizes presentation defaults", () => {
  const contract = normalizeAdminShellContract({
    pageTitle: "Organizations",
    breadcrumbs: [{ label: "Admin", href: "/admin" }],
    responsiveNavigation: "unexpected",
  });

  assert.equal(contract.pageTitle, "Organizations");
  assert.deepEqual(contract.breadcrumbs, [{ label: "Admin", href: "/admin" }]);
  assert.equal(contract.responsiveNavigation, "closed");
  assert.equal(contract.mainId, DEFAULT_ADMIN_SHELL_CONTRACT.mainId);
  assert.equal(contract.landmarks.main, true);
});

test("legacy adapter preserves legacy shell identity and logout behavior", () => {
  const contract = createLegacyAdminAdapter({
    pageTitle: "Dashboard",
    navTitle: "Admin",
    activeNav: "dashboard",
    adminUser: { role: "super_admin" },
    csrfToken: "csrf",
  });

  assert.equal(contract.activeNavigationKey, "dashboard");
  assert.equal(contract.roleLabel, "super_admin");
  assert.equal(contract.logoutAction, "/admin/logout");
  assert.equal(contract.skipTarget, "#admin-main");
});

test("BlessBoard adapter preserves its independent accessibility target", () => {
  const contract = createBlessboardPlatformAdminAdapter({
    pageTitle: "Organizations",
    activeNav: "organizations",
    roleLabel: "Platform admin",
    csrfToken: "csrf",
  });

  assert.equal(contract.activeNavigationKey, "organizations");
  assert.equal(contract.logoutAction, "/admin/logout");
  assert.equal(contract.skipTarget, "#bb-pa-main");
  assert.equal(contract.mainId, "bb-pa-main");
});

