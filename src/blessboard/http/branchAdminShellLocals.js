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
const { buildPermissionNavFlags } = require("./permissionNavLocals");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const {
  BRANCH_ADMIN_NAV,
  BRANCH_ADMIN_MODULES,
  BRANCH_ADMIN_MOBILE_TABS,
} = require("./branchAdminNav");
const { buildBranchMobileNav } = require("./adminMobileNavGroups");
const { resolveWebsiteMode } = require("../services/resolveWebsiteMode");
const {
  applyBranchWebsiteModeNav,
  applyBranchWebsiteModeModules,
} = require("./websiteModeAdminNav");
const {
  createAssignedBranchResourceContextResolver,
} = require("./resolveAssignedBranchContext");

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
 * @param {() => { query: Function }} [getPool]
 * @param {string|null} churchId
 */
async function resolveBranchWebsiteModeForShell(req, getPool, churchId) {
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
 *   websiteMode?: object,
 *   extra?: object,
 * }} opts
 */
async function buildBranchAdminShellLocals(req, res, opts) {
  const env = opts.env || process.env;
  const isProduction = Boolean(opts.isProduction);
  const activeNav = String(opts.activeNav || "home");
  const tenant = resolveTenantForAuthorization(req);
  const csrfToken = issueCsrfToken(env);
  setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
  const session = req.v5Session && req.v5Session.session ? req.v5Session.session : null;

  const churchId = tenant && tenant.church ? tenant.church.id : null;
  const websiteMode =
    opts.websiteMode ||
    (await resolveBranchWebsiteModeForShell(req, opts.getPool, churchId));

  let permissionNavFlags = {
    canViewGiving: false,
    canViewWebsite: false,
    canViewMembers: false,
    canViewAttendance: false,
    canViewAnnouncements: false,
  };
  let assignedBranchDisplayName = null;
  if (opts.getPool && session && session.userId && tenant && tenant.resolved === true) {
    try {
      // Nav flags must be evaluated against the branch this admin is actually
      // assigned to. Using the church primary branch hides a multi-branch
      // branch admin's own website and content links.
      const resourceContext = await createAssignedBranchResourceContextResolver({
        getPool: opts.getPool,
      })(req, tenant);
      assignedBranchDisplayName = resourceContext.branchDisplayName || null;
      permissionNavFlags = await buildPermissionNavFlags(opts.getPool(), {
        actorUserId: session.userId,
        tenant,
        branchId: resourceContext.branchId,
      });
    } catch {
      /* fail closed */
    }
  }

  let navItems = applyBranchWebsiteModeNav(
    BRANCH_ADMIN_NAV.filter((item) => item.nav && item.enabled),
    websiteMode
  );
  navItems = navItems.filter((item) => {
    if (!item || !item.enabled) return false;
    if (item.key === "giving" && !permissionNavFlags.canViewGiving) return false;
    if (
      (item.key === "content" || item.key === "website" || item.key === "website_submissions") &&
      !permissionNavFlags.canViewWebsite
    ) {
      return false;
    }
    if (
      (item.key === "members" || item.key === "registrations") &&
      !permissionNavFlags.canViewMembers
    ) {
      return false;
    }
    if (item.key === "attendance" && !permissionNavFlags.canViewAttendance) return false;
    if (item.key === "announcements" && !permissionNavFlags.canViewAnnouncements) return false;
    return true;
  });
  const portalModules = applyBranchWebsiteModeModules(BRANCH_ADMIN_MODULES, websiteMode);
  const mobileNav = buildBranchMobileNav(navItems, activeNav);
  const mobileTabs = BRANCH_ADMIN_MOBILE_TABS.map((key) =>
    navItems.find((item) => item.key === key)
  ).filter(Boolean);

  const multi =
    websiteMode && websiteMode.ok && websiteMode.websiteMode === "multi_site";
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
    content: "Content",
    website: multi ? "My Branch Website" : "Branch Website",
    website_submissions: "Change requests",
  };

  return {
    pageTitle: opts.pageTitle || defaultTitles[activeNav] || "Branch admin",
    activeNav,
    csrfToken,
    csrfField: CSRF_FIELD,
    churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
    // Identify the branch this admin actually administers, not the church
    // primary branch, which would mislabel every multi-branch branch admin.
    branchDisplayName:
      assignedBranchDisplayName ||
      (tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : ""),
    roleLabel: primaryRoleLabel(req),
    displayName: session && session.user ? session.user.displayName : "",
    navItems,
    mobileNav,
    mobileTabs,
    portalModules,
    websiteMode: websiteMode || null,
    supportBanner:
      req.platformSupportBanner && req.platformSupportBanner.visible === true
        ? {
            visible: true,
            supportType: req.platformSupportBanner.supportType || "branch",
            churchName: req.platformSupportBanner.churchName || "this church",
            branchName:
              req.platformSupportBanner.branchName ||
              (tenant && tenant.primaryBranch ? tenant.primaryBranch.displayName : null),
            expiresAt: req.platformSupportBanner.expiresAt || null,
            exitAction: "/branch-admin/support/exit",
          }
        : null,
    ...(opts.extra || {}),
  };
}

module.exports = {
  buildBranchAdminShellLocals,
  primaryRoleLabel,
  resolveBranchWebsiteModeForShell,
  BRANCH_ADMIN_NAV,
  BRANCH_ADMIN_MODULES,
  BRANCH_ADMIN_MOBILE_TABS,
};
