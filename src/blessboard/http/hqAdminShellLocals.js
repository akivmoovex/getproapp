"use strict";

/**
 * Shared HQ-admin shell locals (nav + branding). Presentation only.
 * Network-only nav entries require FEATURE_KEYS and are omitted when not entitled.
 */

const { buildPermissionNavFlags } = require("./permissionNavLocals");
const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { FEATURE_KEYS } = require("../../platform/services/entitlementService");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const { HQ_ADMIN_NAV, HQ_ADMIN_MOBILE_TABS } = require("./hqAdminNav");
const { buildHqMobileNav } = require("./adminMobileNavGroups");
const { resolveWebsiteMode, WEBSITE_MODE } = require("../services/resolveWebsiteMode");
const { applyHqWebsiteModeNav } = require("./websiteModeAdminNav");

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
 * Cached website mode for shell nav (one list query per request).
 * @param {import('express').Request} req
 * @param {() => { query: Function }} [getPool]
 * @param {string|null} churchId
 */
async function resolveHqWebsiteModeForShell(req, getPool, churchId) {
  if (!churchId) return null;
  if (
    req &&
    req.blessBoardWebsiteMode &&
    req.blessBoardWebsiteMode.ok &&
    String(req.blessBoardWebsiteMode.churchId || "") === String(churchId)
  ) {
    return req.blessBoardWebsiteMode;
  }
  if (!getPool) return null;
  try {
    const mode = await resolveWebsiteMode(getPool(), { churchId });
    if (req) req.blessBoardWebsiteMode = mode;
    return mode;
  } catch {
    return null;
  }
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
 *   websiteMode?: object,
 *   extra?: object,
 * }} opts
 */
async function buildHqAdminShellLocals(req, res, opts) {
  const env = opts.env || process.env;
  const isProduction = Boolean(opts.isProduction);
  const tenant = resolveTenantForAuthorization(req);
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
  const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;

  const entitledFeatures =
    opts.entitledFeatures ||
    (await resolveHqNavEntitlements(req, opts.getPool));
  let navItems = filterHqNavItems(HQ_ADMIN_NAV, entitledFeatures);

  const churchId = tenant && tenant.church ? tenant.church.id : null;
  const websiteMode =
    opts.websiteMode ||
    (await resolveHqWebsiteModeForShell(req, opts.getPool, churchId));
  const composed = applyHqWebsiteModeNav(navItems, websiteMode, {
    requestPath: req && (req.path || req.url),
    activeNav: String(opts.activeNav || "home"),
  });
  navItems = composed.navItems;
  const activeNav = composed.activeNav;

  // Build permission-based nav flags (before mobile nav so filters apply)
  let permissionNavFlags = {
    canViewGiving: false,
    canViewStaffAccess: false,
    canPublishWebsite: false,
    canEditWebsite: false,
    canRestoreWebsite: false,
    canViewWebsite: false,
    canViewFinance: false,
    canExportData: false,
    canViewMembers: false,
    canViewAttendance: false,
    canViewAnnouncements: false,
    canViewReports: false,
    canViewPastoral: false,
    canViewWelfare: false,
    canViewJourney: false,
    canViewClasses: false,
    canViewCells: false,
    canViewDepartments: false,
  };
  if (opts.getPool && session && session.userId) {
    try {
      permissionNavFlags = await buildPermissionNavFlags(opts.getPool(), {
        actorUserId: session.userId,
        tenant,
        // HQ nav is church-wide — do not fall back to primary branch grants.
        branchId: null,
      });
    } catch {
      // fail closed
    }
  }

  navItems = navItems.filter((item) => {
    if (!item || !item.enabled) return false;
    if (item.key === "giving" && !permissionNavFlags.canViewGiving) return false;
    if (item.key === "staff-access" && !permissionNavFlags.canViewStaffAccess) return false;
    if (
      (item.key === "content" || item.key === "website") &&
      !permissionNavFlags.canViewWebsite
    ) {
      return false;
    }
    if (item.key === "members" && !permissionNavFlags.canViewMembers) return false;
    if (item.key === "attendance" && !permissionNavFlags.canViewAttendance) return false;
    if (item.key === "announcements" && !permissionNavFlags.canViewAnnouncements) return false;
    if (item.key === "reports" && !permissionNavFlags.canViewReports) return false;
    if (item.key === "member-journey" && !permissionNavFlags.canViewJourney) return false;
    if (
      (item.key === "pastoral" || item.key === "pastoral-care") &&
      !permissionNavFlags.canViewPastoral
    ) {
      return false;
    }
    if (item.key === "welfare" && !permissionNavFlags.canViewWelfare) return false;
    return true;
  });

  const mobileNav = buildHqMobileNav(navItems, activeNav);
  const mobileTabs = HQ_ADMIN_MOBILE_TABS.map((key) =>
    navItems.find((item) => item.key === key)
  ).filter(Boolean);

  const multi =
    websiteMode && websiteMode.ok && websiteMode.websiteMode === WEBSITE_MODE.MULTI_SITE;
  const defaultTitles = {
    home: "Church HQ",
    branches: "Branches",
    registrations: "Registration oversight",
    members: "Member directory",
    "member-journey": "Member journey",
    cells: "Cells",
    classes: "Classes",
    departments: "Departments",
    roles: "Legacy permissions",
    "staff-access": "Users",
    settings: "Church settings",
    account: "Account",
    content: multi ? "HQ Website" : "Website",
    broadcasts: "Broadcast Center",
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
    pageTitle: opts.pageTitle || defaultTitles[activeNav] || defaultTitles.content || "Church HQ",
    activeNav,
    shellKind: "hq",
    csrfToken,
    csrfField: CSRF_FIELD,
    churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
    hqBranchDisplayName: tenant && tenant.hqBranch ? tenant.hqBranch.displayName : "",
    roleLabel: primaryHqRoleLabel(req),
    displayName: session && session.user ? session.user.displayName : "",
    navItems,
    mobileNav,
    mobileTabs,
    entitledFeatures,
    websiteMode: websiteMode || null,
    permissionNavFlags,
    supportBanner:
      req.platformSupportBanner && req.platformSupportBanner.visible === true
        ? {
            visible: true,
            supportType: req.platformSupportBanner.supportType || "hq",
            churchName: req.platformSupportBanner.churchName || "this church",
            branchName: req.platformSupportBanner.branchName || null,
            expiresAt: req.platformSupportBanner.expiresAt || null,
            exitAction: "/hq/support/exit",
          }
        : null,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildHqAdminShellLocals,
  primaryHqRoleLabel,
  filterHqNavItems,
  resolveHqNavEntitlements,
  resolveHqWebsiteModeForShell,
  HQ_ADMIN_NAV,
  HQ_ADMIN_MOBILE_TABS,
};
