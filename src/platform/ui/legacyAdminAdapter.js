const { normalizeAdminShellContract } = require("./adminShellContract");

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

module.exports = { createLegacyAdminAdapter };

