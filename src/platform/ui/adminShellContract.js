/**
 * Presentation-only contract shared by Admin Console shell adapters.
 *
 * Adapters normalize existing product locals without owning routes,
 * authorization, persistence, or business behavior.
 */
const DEFAULT_ADMIN_SHELL_CONTRACT = Object.freeze({
  pageTitle: "",
  pageSubtitle: "",
  breadcrumbs: [],
  activeNavigationKey: "",
  user: null,
  roleLabel: "",
  csrfToken: "",
  logoutAction: "",
  skipTarget: "#admin-main",
  mainId: "admin-main",
  responsiveNavigation: "closed",
  landmarks: {
    navigation: true,
    main: true,
    header: true,
  },
});

function normalizeAdminShellContract(input = {}) {
  const value = input && typeof input === "object" ? input : {};
  const landmarks = value.landmarks && typeof value.landmarks === "object"
    ? value.landmarks
    : {};

  return {
    ...DEFAULT_ADMIN_SHELL_CONTRACT,
    ...value,
    breadcrumbs: Array.isArray(value.breadcrumbs) ? value.breadcrumbs : [],
    responsiveNavigation: value.responsiveNavigation === "open" ? "open" : "closed",
    landmarks: {
      ...DEFAULT_ADMIN_SHELL_CONTRACT.landmarks,
      ...landmarks,
    },
  };
}

module.exports = {
  DEFAULT_ADMIN_SHELL_CONTRACT,
  normalizeAdminShellContract,
};

