"use strict";

/**
 * Shared platform-admin shell locals (nav + CSRF). Presentation only.
 */

const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("./v5Csrf");
const {
  PLATFORM_ADMIN_NAV,
  PLATFORM_ADMIN_MOBILE_TABS,
} = require("./platformAdminNav");

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
function buildPlatformAdminShellLocals(req, res, opts) {
  const env = opts.env || process.env;
  const isProduction = Boolean(opts.isProduction);
  const activeNav = String(opts.activeNav || "home");
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction });

  const ctx = req.platformAdminContext || {};
  const navItems = PLATFORM_ADMIN_NAV.filter((item) => item.nav && item.enabled);
  const mobileTabs = PLATFORM_ADMIN_MOBILE_TABS.map((key) =>
    navItems.find((item) => item.key === key)
  ).filter(Boolean);

  const defaultTitles = {
    home: "Platform admin",
    organizations: "Organizations",
    plans: "Plans",
    deployments: "Deployments",
    settings: "Settings",
    account: "Account",
  };

  return {
    pageTitle: opts.pageTitle || defaultTitles[activeNav] || "Platform admin",
    activeNav,
    shellKind: "platform-admin",
    csrfToken,
    csrfField: CSRF_FIELD,
    roleLabel: ctx.roleLabel || "Platform admin",
    displayName: ctx.displayName || "",
    navItems,
    mobileTabs,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildPlatformAdminShellLocals,
  PLATFORM_ADMIN_NAV,
  PLATFORM_ADMIN_MOBILE_TABS,
};
