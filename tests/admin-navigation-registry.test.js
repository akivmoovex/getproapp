const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getAdminNavigation,
  isActiveNavigationItem,
} = require("../src/platform/ui/adminNavigationRegistry");
const {
  getLegacyAdminNavigation,
} = require("../src/platform/ui/legacyAdminAdapter");
const {
  getBlessboardPlatformAdminNavigation,
} = require("../src/platform/ui/blessboardPlatformAdminAdapter");

test("registry filters product navigation without leakage", () => {
  const legacy = getLegacyAdminNavigation({
    path: "/admin/crm/tasks/1",
    adminNav: { tenantScoped: true, canAccessCrm: true },
  });
  const blessboard = getBlessboardPlatformAdminNavigation({ path: "/admin/organizations/abc" });

  assert.ok(legacy.some((item) => item.key === "crm"));
  assert.equal(legacy.some((item) => item.key === "organizations"), false);
  assert.ok(blessboard.some((item) => item.key === "organizations"));
  assert.equal(blessboard.some((item) => item.key === "crm"), false);
});

test("registry preserves capability and super-admin filtering", () => {
  const restricted = getAdminNavigation("legacy", {
    tenantScoped: true,
    canAccessCrm: false,
    isSuper: false,
  });
  const superNav = getAdminNavigation("legacy", { isSuper: true });

  assert.equal(restricted.some((item) => item.key === "crm"), false);
  assert.equal(restricted.some((item) => item.key === "db"), false);
  assert.ok(superNav.some((item) => item.key === "db"));
});

test("registry applies desktop/mobile visibility and ordering", () => {
  const desktop = getAdminNavigation("blessboard", {}, "desktop");
  const mobile = getAdminNavigation("blessboard", {}, "mobile");

  assert.equal(desktop[0].key, "home");
  assert.equal(mobile[0].key, "home");
  assert.ok(desktop.some((item) => item.key === "system"));
  assert.equal(mobile.some((item) => item.key === "system"), false);
  assert.ok(mobile.some((item) => item.key === "deployments"));
});

test("active matching handles query strings, detail routes, and exact roots", () => {
  const organizations = { active: ["/admin/organizations"] };
  assert.equal(isActiveNavigationItem(organizations, "/admin/organizations?search=abc"), true);
  assert.equal(isActiveNavigationItem(organizations, "/admin/organizations/acme/edit"), true);
  assert.equal(isActiveNavigationItem({ active: ["/admin"] }, "/administer"), false);
});

