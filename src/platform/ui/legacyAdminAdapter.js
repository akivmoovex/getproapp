const { normalizeAdminShellContract } = require("./adminShellContract");
const { getAdminNavigation } = require("./adminNavigationRegistry");

function createLegacyAdminAdapter(locals = {}) {
  return normalizeAdminShellContract({
    pageTitle: locals.pageTitle || locals.navTitle || "",
    pageSubtitle: locals.pageSubtitle || "",
    breadcrumbs: locals.breadcrumbs,
    activeNavigationKey: locals.activeNav || "",
    user: locals.adminUser || null,
    roleLabel: locals.adminUser && locals.adminUser.role ? locals.adminUser.role : "",
    csrfToken: locals.csrfToken || "",
    logoutAction: "/admin/logout",
    skipTarget: "#admin-main",
    mainId: "admin-main",
  });
}

function getLegacyAdminNavigation(locals = {}, viewport = "desktop") {
  const nav = locals.adminNav || {};
  return getAdminNavigation("legacy", {
    ...nav,
    path: locals.path || "",
    isSuper: !!nav.isSuper,
    tenantScoped: !!nav.tenantScoped,
  }, viewport);
}

module.exports = { createLegacyAdminAdapter, getLegacyAdminNavigation };

