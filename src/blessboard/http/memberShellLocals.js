"use strict";

/**
 * Shared member portal shell locals (nav + branding). Presentation only.
 */

const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { PORTAL_NAV, PORTAL_MODULES, PORTAL_MOBILE_TABS } = require("./memberPortalNav");

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
function buildMemberShellLocals(req, res, opts) {
  const env = opts.env || process.env;
  const isProduction = Boolean(opts.isProduction);
  const activeNav = String(opts.activeNav || "home");
  const tenant = resolveTenantForAuthorization(req);
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction });
  const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;
  const access = req.blessBoardMemberAccess || null;
  const preferred =
    access && access.member && access.member.preferredName
      ? access.member.preferredName
      : session && session.user
        ? session.user.displayName
        : "";
  const navItems = PORTAL_NAV.filter((item) => item.nav && item.enabled);
  const mobileTabs = PORTAL_MOBILE_TABS.map((key) =>
    navItems.find((item) => item.key === key)
  ).filter(Boolean);

  const defaultTitles = {
    home: "Dashboard",
    profile: "Profile",
    announcements: "Announcements",
    events: "Events",
    ministries: "Ministries",
    resources: "Resources",
    forms: "Forms",
    requests: "Requests",
    giving: "Giving information",
  };

  return {
    pageTitle: opts.pageTitle || defaultTitles[activeNav] || "Member",
    activeNav,
    csrfToken,
    csrfField: CSRF_FIELD,
    churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
    branchDisplayName: tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : "",
    displayName: preferred || "",
    portalModules: PORTAL_MODULES,
    navItems,
    mobileTabs,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildMemberShellLocals,
  PORTAL_NAV,
  PORTAL_MODULES,
  PORTAL_MOBILE_TABS,
};
