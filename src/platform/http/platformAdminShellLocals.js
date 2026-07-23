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
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { isTestingDataMaintenanceAllowed } = require("../config/testingDataMaintenance");
const registrationStatus = require("../../blessboard/services/registrationStatusPresentation");

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
  const testingMaintenance = isTestingDataMaintenanceAllowed(env);
  const navItems = PLATFORM_ADMIN_NAV.filter(
    (item) => item.nav && item.enabled && (testingMaintenance || !item.testingOnly)
  );
  const mobileTabs = PLATFORM_ADMIN_MOBILE_TABS.map((key) =>
    navItems.find((item) => item.key === key)
  ).filter(Boolean);

  const deployment = getPlatformDeploymentCode(env);
  const deploymentCode =
    (opts.extra && opts.extra.deploymentCode) ||
    (deployment && deployment.ok ? deployment.code : "");

  const defaultTitles = {
    home: "Platform admin",
    organizations: "Organizations",
    "registration-applications": "Registration Applications",
    plans: "Plans",
    subscriptions: "Subscriptions",
    domains: "Domains",
    deployments: "Deployments",
    settings: "Settings",
    maintenance: "Maintenance",
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
    deploymentCode,
    navItems,
    mobileTabs,
    testingMaintenanceEnabled: testingMaintenance,
    registrationStatus,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildPlatformAdminShellLocals,
  PLATFORM_ADMIN_NAV,
  PLATFORM_ADMIN_MOBILE_TABS,
};
