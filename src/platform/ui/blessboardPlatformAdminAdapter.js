const { normalizeAdminShellContract } = require("./adminShellContract");
const { getAdminNavigation } = require("./adminNavigationRegistry");

function createBlessboardPlatformAdminAdapter(locals = {}) {
  return normalizeAdminShellContract({
    pageTitle: locals.pageTitle || "Platform Admin",
    pageSubtitle: locals.pageSubtitle || "",
    breadcrumbs: locals.breadcrumbs,
    activeNavigationKey: locals.activeNav || "home",
    user: locals.displayName ? { displayName: locals.displayName } : null,
    roleLabel: locals.roleLabel || "Platform admin",
    csrfToken: locals.csrfToken || "",
    logoutAction: "/admin/logout",
    skipTarget: "#bb-pa-main",
    mainId: "bb-pa-main",
  });
}

function getBlessboardPlatformAdminNavigation(locals = {}, viewport = "desktop") {
  return getAdminNavigation("blessboard", {
    path: locals.path || "",
  }, viewport);
}

module.exports = {
  createBlessboardPlatformAdminAdapter,
  getBlessboardPlatformAdminNavigation,
};

