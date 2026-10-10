const { normalizeAdminShellContract } = require("./adminShellContract");

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

module.exports = { createBlessboardPlatformAdminAdapter };

