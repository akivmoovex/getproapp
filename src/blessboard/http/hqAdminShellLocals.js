"use strict";

/**
 * Shared HQ-admin shell locals (nav + branding). Presentation only.
 * Network-only nav entries require FEATURE_KEYS and are omitted when not entitled.
 */

const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { FEATURE_KEYS } = require("../../platform/services/entitlementService");
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
 * @param {ReadonlyArray<{ nav?: boolean, enabled?: boolean, requiresFeature?: string }>} items
 * @param {Record<string, boolean>|null|undefined} entitledFeatures
 */
function filterHqNavItems(items, entitledFeatures) {
  const features = entitledFeatures || {};
  return items.filter((item) => {
    if (!item.nav || !item.enabled) return false;
    if (!item.requiresFeature) return true;
    return features[item.requiresFeature] === true;
  });
}

/**
 * Soft Network nav flags for HQ shell. Fail-closed to false. Cached on req.
 * @param {import('express').Request} req
 * @param {() => { query: Function }} [getPool]
 * @returns {Promise<Record<string, boolean>>}
 */
async function resolveHqNavEntitlements(req, getPool) {
  if (req && req.blessBoardHqNavFeatures && typeof req.blessBoardHqNavFeatures === "object") {
    return req.blessBoardHqNavFeatures;
  }
  const flags = {
    [FEATURE_KEYS.EXECUTIVE_REPORTS]: false,
    [FEATURE_KEYS.ADVANCED_AUDIT]: false,
  };
  const tenant = resolveTenantForAuthorization(req);
  const churchId = tenant && tenant.church ? tenant.church.id : null;
  if (!getPool || !churchId) {
    if (req) req.blessBoardHqNavFeatures = flags;
    return flags;
  }
  try {
    const {
      resolveChurchExecutiveReports,
      resolveChurchAdvancedAudit,
    } = require("../services/hqReportsService");
    const pool = getPool();
    const [exec, audit] = await Promise.all([
      resolveChurchExecutiveReports(pool, churchId),
      resolveChurchAdvancedAudit(pool, churchId),
    ]);
    flags[FEATURE_KEYS.EXECUTIVE_REPORTS] = Boolean(
      exec && exec.ok && exec.executiveEntitled
    );
    flags[FEATURE_KEYS.ADVANCED_AUDIT] = Boolean(
      audit && audit.ok && audit.advancedAuditEntitled
    );
  } catch {
    // fail closed
  }
  if (req) req.blessBoardHqNavFeatures = flags;
  return flags;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   env: NodeJS.ProcessEnv,
 *   isProduction: boolean,
 *   activeNav: string,
 *   pageTitle?: string,
 *   getPool?: () => { query: Function },
 *   entitledFeatures?: Record<string, boolean>,
 *   extra?: object,
 * }} opts
 */
async function buildHqAdminShellLocals(req, res, opts) {
  const env = opts.env || process.env;
  const isProduction = Boolean(opts.isProduction);
  const activeNav = String(opts.activeNav || "home");
  const tenant = resolveTenantForAuthorization(req);
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction });
  const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;

  const entitledFeatures =
    opts.entitledFeatures ||
    (await resolveHqNavEntitlements(req, opts.getPool));
  const navItems = filterHqNavItems(HQ_ADMIN_NAV, entitledFeatures);
  const mobileTabs = HQ_ADMIN_MOBILE_TABS.map((key) =>
    navItems.find((item) => item.key === key)
  ).filter(Boolean);

  const defaultTitles = {
    home: "Church HQ",
    branches: "Branches",
    registrations: "Registration oversight",
    members: "Member directory",
    roles: "Staff permissions",
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
    executive: "Executive",
    audit: "Audit",
    governance: "Governance",
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
    entitledFeatures,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildHqAdminShellLocals,
  primaryHqRoleLabel,
  filterHqNavItems,
  resolveHqNavEntitlements,
  HQ_ADMIN_NAV,
  HQ_ADMIN_MOBILE_TABS,
};
