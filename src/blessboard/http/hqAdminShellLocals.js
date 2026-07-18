"use strict";

/**
 * Shared HQ-admin shell locals (nav + branding). Presentation only.
 */

const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const { HQ_ADMIN_NAV, HQ_ADMIN_MOBILE_TABS } = require("./hqAdminNav");

/**
 * @param {import('express').Request} req
 * @returns {string}
 */
function primaryHqRoleLabel(req) {
  const roles =
    req.blessBoardAuthorizationContext && req.blessBoardAuthorizationContext.effectiveRoles
      ? req.blessBoardAuthorizationContext.effectiveRoles
      : [];
  if (!roles.length) return "HQ admin";
  const order = ["church_hq_admin", "platform_admin", "branch_admin"];
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
function buildHqAdminShellLocals(req, res, opts) {
  const env = opts.env || process.env;
  const isProduction = Boolean(opts.isProduction);
  const activeNav = String(opts.activeNav || "home");
  const tenant = resolveTenantForAuthorization(req);
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction });
  const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
  const navItems = HQ_ADMIN_NAV.filter((item) => item.nav && item.enabled);
  const mobileTabs = HQ_ADMIN_MOBILE_TABS.map((key) =>
    navItems.find((item) => item.key === key)
  ).filter(Boolean);

  const defaultTitles = {
    home: "Church HQ",
    branches: "Branches",
    settings: "Church settings",
    account: "Account",
    content: "Website",
    announcements: "Announcements",
    participation: "Participation",
    attendance: "Attendance",
    giving: "Giving",
    resources: "Resources",
    forms: "Forms",
    requests: "Requests",
    reports: "Reports",
    audit: "Audit",
  };

  return {
    pageTitle: opts.pageTitle || defaultTitles[activeNav] || "Church HQ",
    activeNav,
    shellKind: "hq",
    csrfToken,
    csrfField: CSRF_FIELD,
    churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
    hqBranchDisplayName: tenant && tenant.hqBranch ? tenant.hqBranch.displayName : "",
    roleLabel: primaryHqRoleLabel(req),
    displayName: session && session.user ? session.user.displayName : "",
    navItems,
    mobileTabs,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildHqAdminShellLocals,
  primaryHqRoleLabel,
  HQ_ADMIN_NAV,
  HQ_ADMIN_MOBILE_TABS,
};
