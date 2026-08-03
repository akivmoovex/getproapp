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
const registrationQueue = require("../../blessboard/services/registrationQueuePresentation");

/**
 * @param {readonly object[]} items
 * @param {boolean} testingMaintenance
 */
function filterNavTree(items, testingMaintenance) {
  const out = [];
  for (const item of items || []) {
    if (!item || item.nav === false || item.enabled === false) continue;
    if (item.testingOnly && !testingMaintenance) continue;
    if (Array.isArray(item.children) && item.children.length) {
      const children = filterNavTree(item.children, testingMaintenance);
      if (!children.length) continue;
      out.push({ ...item, children });
      continue;
    }
    out.push(item);
  }
  return out;
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
function buildPlatformAdminShellLocals(req, res, opts) {
  const env = opts.env || process.env;
  const isProduction = Boolean(opts.isProduction);
  const activeNav = String(opts.activeNav || "home");
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction });

  const ctx = req.platformAdminContext || {};
  const testingMaintenance = isTestingDataMaintenanceAllowed(env);
  const navItems = filterNavTree(PLATFORM_ADMIN_NAV, testingMaintenance);
  const mobileTabs = PLATFORM_ADMIN_MOBILE_TABS.map((key) => {
    for (const item of navItems) {
      if (item.key === key) return item;
      if (Array.isArray(item.children)) {
        const child = item.children.find((c) => c.key === key);
        if (child) return child;
      }
    }
    return null;
  }).filter(Boolean);

  const deployment = getPlatformDeploymentCode(env);
  const deploymentCode =
    (opts.extra && opts.extra.deploymentCode) ||
    (deployment && deployment.ok ? deployment.code : "");

  const defaultTitles = {
    home: "Platform admin",
    organizations: "Organisations",
    "registration-applications": "Church Registrations",
    plans: "Plans",
    subscriptions: "Subscriptions",
    domains: "Domains and links",
    roles: "Roles and access",
    "access-health": "Access health",
    deployments: "Deployments",
    system: "System",
    settings: "Settings",
    maintenance: "Maintenance",
    account: "Account",
  };

  const systemChildActive = ["deployments", "maintenance"].includes(activeNav);

  return {
    pageTitle: opts.pageTitle || defaultTitles[activeNav] || "Platform admin",
    activeNav,
    systemNavOpen: systemChildActive || activeNav === "system",
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
    registrationQueue,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildPlatformAdminShellLocals,
  PLATFORM_ADMIN_NAV,
  PLATFORM_ADMIN_MOBILE_TABS,
};
