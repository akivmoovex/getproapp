"use strict";

/**
 * Shared branch-admin shell locals (nav + branding). Presentation only.
 */

const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const {
  BRANCH_ADMIN_NAV,
  BRANCH_ADMIN_MODULES,
  BRANCH_ADMIN_MOBILE_TABS,
} = require("./branchAdminNav");

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function primaryRoleLabel(req) {
  const roles =
    req.blessBoardAuthorizationContext && req.blessBoardAuthorizationContext.effectiveRoles
      ? req.blessBoardAuthorizationContext.effectiveRoles
      : [];
  if (!roles.length) return "Branch admin";
  const order = ["branch_admin", "church_hq_admin", "platform_admin"];
  for (const key of order) {
    const hit = roles.find((r) => r.roleKey === key);
    if (hit) return formatRoleLabel(hit.roleKey);
  }
  return formatRoleLabel(roles[0].roleKey);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   env: NodeJS.ProcessEnv,
 *   isProduction: boolean,
 *   activeNav: string,
 *   pageTitle?: string,
 *   extra?: object,
 * }} opts
 */
function buildBranchAdminShellLocals(req, res, opts) {
  const env = opts.env || process.env;
  const isProduction = Boolean(opts.isProduction);
  const activeNav = String(opts.activeNav || "home");
  const tenant = resolveTenantForAuthorization(req);
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction });
  const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
  const navItems = BRANCH_ADMIN_NAV.filter((item) => item.nav && item.enabled);
  const mobileTabs = BRANCH_ADMIN_MOBILE_TABS.map((key) =>
    navItems.find((item) => item.key === key)
  ).filter(Boolean);

  const defaultTitles = {
    home: "Branch admin",
    account: "Account",
    settings: "Branch settings",
    registrations: "Registrations",
    members: "Members",
    announcements: "Announcements",
    participation: "Participation",
    attendance: "Attendance",
    giving: "Giving",
    resources: "Resources",
    forms: "Forms",
    requests: "Requests",
    content: "Website",
  };

  return {
    pageTitle: opts.pageTitle || defaultTitles[activeNav] || "Branch admin",
    activeNav,
    csrfToken,
    csrfField: CSRF_FIELD,
    churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
    branchDisplayName: tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "",
    roleLabel: primaryRoleLabel(req),
    displayName: session && session.user ? session.user.displayName : "",
    navItems,
    mobileTabs,
    portalModules: BRANCH_ADMIN_MODULES,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildBranchAdminShellLocals,
  primaryRoleLabel,
  BRANCH_ADMIN_NAV,
  BRANCH_ADMIN_MODULES,
  BRANCH_ADMIN_MOBILE_TABS,
};
