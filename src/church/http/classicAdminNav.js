"use strict";

/**
 * Canonical classic Church Admin navigation (Branch + HQ).
 * Desktop sidebars render this list flat; mobile drawers group via buildAdminMobileNavModel.
 */

const { buildAdminMobileNavModel } = require("../../blessboard/http/adminMobileNavGroups");

/**
 * @typedef {{
 *   key: string,
 *   label: string,
 *   href: string,
 *   icon: string,
 *   testId?: string,
 *   navDest?: string,
 *   badgeCount?: number,
 *   lockLabel?: string | null,
 * }} ClassicAdminNavItem
 */

/** @type {ReadonlyArray<ClassicAdminNavItem>} */
const CLASSIC_BRANCH_ADMIN_NAV = Object.freeze([
  { key: "dashboard", label: "Dashboard", href: "/branch/dashboard", icon: "dashboard" },
  { key: "verification", label: "Verification", href: "/branch/member-verification", icon: "how_to_reg" },
  { key: "members", label: "Members", href: "/branch/members", icon: "group" },
  {
    key: "attendance",
    label: "Attendance",
    href: "/branch/attendance",
    icon: "fact_check",
    testId: "nav-attendance",
  },
  {
    key: "giving-summary",
    label: "Giving",
    href: "/branch/giving-summary",
    icon: "payments",
    testId: "nav-giving",
    navDest: "giving-summary",
  },
  {
    key: "giving-settings",
    label: "Giving Settings",
    href: "/branch/giving-settings",
    icon: "tune",
    testId: "nav-giving-settings",
  },
  { key: "ministries", label: "Ministries", href: "/branch/ministries", icon: "church" },
  { key: "events", label: "Events", href: "/branch/events", icon: "calendar_today" },
  { key: "reports", label: "Reports", href: "/branch/reports", icon: "analytics" },
  { key: "announcements", label: "Announcements", href: "/branch/announcements", icon: "campaign" },
  { key: "website", label: "Website Editor", href: "/branch/website-editor", icon: "web" },
  { key: "requests", label: "Requests", href: "/branch/requests", icon: "inbox" },
  { key: "departments", label: "Departments", href: "/branch/departments", icon: "account_tree" },
  { key: "duty", label: "Duty Roster", href: "/branch/duty-roster", icon: "assignment_ind" },
  { key: "sermons", label: "Sermons", href: "/branch/sermons", icon: "mic" },
  { key: "resources", label: "Resources", href: "/branch/resources", icon: "folder" },
  { key: "contact", label: "Contact", href: "/branch/contact-submissions", icon: "mail" },
  { key: "prayer", label: "Prayer", href: "/branch/prayer-requests", icon: "volunteer_activism" },
  { key: "reset", label: "Reset Inbox", href: "/branch/reset-requests", icon: "lock_reset" },
  { key: "leaders", label: "Leaders", href: "/branch/leaders", icon: "badge" },
  { key: "join-requests", label: "Join Requests", href: "/branch/ministry-join-requests", icon: "group_add" },
  { key: "ministry-activity", label: "Ministry Activity", href: "/branch/ministry-activity", icon: "timeline" },
  { key: "activity", label: "Activity", href: "/branch/activity", icon: "history" },
  { key: "account", label: "Account", href: "/branch/account", icon: "settings" },
]);

/** @type {ReadonlyArray<ClassicAdminNavItem>} */
const CLASSIC_HQ_ADMIN_NAV = Object.freeze([
  { key: "dashboard", label: "Dashboard", href: "/hq/dashboard", icon: "dashboard" },
  { key: "account", label: "Account", href: "/hq/account", icon: "manage_accounts" },
  {
    key: "notification-templates",
    label: "Notifications",
    href: "/hq/notification-templates",
    icon: "mail",
  },
  { key: "branches", label: "Branch registry", href: "/hq/branches", icon: "account_tree" },
  { key: "members", label: "Members", href: "/hq/members", icon: "group" },
  {
    key: "verification",
    label: "Member Verification",
    href: "/hq/member-verification",
    icon: "how_to_reg",
    testId: "hq-nav-member-verification",
  },
  {
    key: "attendance",
    label: "Attendance",
    href: "/hq/attendance",
    icon: "event_available",
    testId: "hq-nav-attendance",
  },
  {
    key: "giving-summary",
    label: "Giving",
    href: "/hq/giving-summary",
    icon: "payments",
    testId: "hq-nav-giving",
  },
  { key: "broadcasts", label: "Broadcasts", href: "/hq/broadcasts", icon: "campaign" },
  { key: "reports", label: "Review Reports", href: "/hq/reports", icon: "description" },
  { key: "analytics", label: "Analytics", href: "/hq/analytics", icon: "analytics" },
  { key: "audit", label: "Audit Trail", href: "/hq/audit", icon: "policy" },
  { key: "support-access", label: "Support access", href: "/hq/support-access", icon: "support_agent" },
]);

/** Branch mobile: Dashboard pinned; Attendance and Giving stay separate groups. */
const CLASSIC_BRANCH_MOBILE_NAV_CONFIG = Object.freeze({
  pinnedKeys: Object.freeze(["dashboard"]),
  accountKeys: Object.freeze(["account"]),
  groups: Object.freeze([
    Object.freeze({
      id: "people",
      label: "People",
      keys: Object.freeze(["members", "verification", "attendance"]),
    }),
    Object.freeze({
      id: "communication",
      label: "Communication",
      keys: Object.freeze(["announcements"]),
    }),
    Object.freeze({
      id: "website",
      label: "Website",
      keys: Object.freeze(["website"]),
    }),
    Object.freeze({
      id: "giving",
      label: "Giving",
      keys: Object.freeze(["giving-summary", "giving-settings"]),
    }),
    Object.freeze({
      id: "ministry",
      label: "Ministry",
      keys: Object.freeze([
        "ministries",
        "events",
        "departments",
        "duty",
        "leaders",
        "join-requests",
        "ministry-activity",
        "volunteer-scheduling",
        "groups",
        "discipleship",
        "event-logistics",
      ]),
    }),
    Object.freeze({
      id: "administration",
      label: "Administration",
      keys: Object.freeze([
        "reports",
        "requests",
        "sermons",
        "resources",
        "contact",
        "prayer",
        "reset",
        "activity",
        "attendance-offline",
        "attendance-rules",
        "pastoral-automation",
        "appointments",
        "surveys",
        "reports-scheduled",
        "domains-custom",
        "email-hosted",
        "safeguarding",
        "pastoral-cases",
      ]),
    }),
  ]),
});

/** HQ mobile: Dashboard pinned; Attendance and Giving remain separate. */
const CLASSIC_HQ_MOBILE_NAV_CONFIG = Object.freeze({
  pinnedKeys: Object.freeze(["dashboard"]),
  accountKeys: Object.freeze(["account"]),
  groups: Object.freeze([
    Object.freeze({
      id: "people",
      label: "People",
      keys: Object.freeze(["members", "verification", "attendance"]),
    }),
    Object.freeze({
      id: "communication",
      label: "Communication",
      keys: Object.freeze(["broadcasts", "notification-templates", "broadcasts-scheduled"]),
    }),
    Object.freeze({
      id: "giving",
      label: "Giving",
      keys: Object.freeze(["giving-summary"]),
    }),
    Object.freeze({
      id: "administration",
      label: "Administration",
      keys: Object.freeze([
        "branches",
        "reports",
        "analytics",
        "audit",
        "support-access",
        "reports-cross-branch",
        "reports-builder",
        "integrations",
        "network",
      ]),
    }),
  ]),
});

/**
 * @param {ClassicAdminNavItem} item
 * @returns {ClassicAdminNavItem}
 */
function cloneNavItem(item) {
  return {
    key: item.key,
    label: item.label,
    href: item.href,
    icon: item.icon,
    ...(item.testId ? { testId: item.testId } : {}),
    ...(item.navDest ? { navDest: item.navDest } : {}),
    ...(item.badgeCount != null ? { badgeCount: item.badgeCount } : {}),
    ...(item.lockLabel ? { lockLabel: item.lockLabel } : {}),
  };
}

/**
 * Merge package-gated features into the classic list (after core Events / before Reports for Branch,
 * after Reports for HQ — matching prior EJS insertion points).
 *
 * @param {ReadonlyArray<ClassicAdminNavItem>} base
 * @param {Array<{ navKey?: string, label?: string, path?: string, state?: string }>|null|undefined} packageFeatureNav
 * @param {{ afterKey: string }} opts
 * @returns {ClassicAdminNavItem[]}
 */
function insertPackageFeatureItems(base, packageFeatureNav, opts) {
  const items = base.map(cloneNavItem);
  const afterKey = opts.afterKey;
  const features = Array.isArray(packageFeatureNav) ? packageFeatureNav : [];
  const featureItems = features
    .filter((f) => f && f.path && (f.navKey || f.id))
    .map((f) => ({
      key: String(f.navKey || f.id),
      label: String(f.label || f.navLabel || f.name || "Feature"),
      href: String(f.path),
      icon: f.state === "upgrade" ? "lock_open" : "verified",
      lockLabel: f.state === "upgrade" ? "Upgrade" : null,
    }));

  if (!featureItems.length) return items;

  const idx = items.findIndex((i) => i.key === afterKey);
  const insertAt = idx >= 0 ? idx + 1 : items.length;
  items.splice(insertAt, 0, ...featureItems);
  return items;
}

/**
 * @param {{
 *   packageFeatureNav?: Array<object>|null,
 *   resetInboxPendingCount?: number,
 * }} [opts]
 * @returns {ClassicAdminNavItem[]}
 */
function buildClassicBranchNavItems(opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const items = insertPackageFeatureItems(CLASSIC_BRANCH_ADMIN_NAV, options.packageFeatureNav, {
    afterKey: "events",
  });
  const pending = Number(options.resetInboxPendingCount) || 0;
  return items.map((item) => {
    if (item.key !== "reset") return item;
    return { ...item, badgeCount: pending > 0 ? pending : undefined };
  });
}

/**
 * @param {{
 *   packageFeatureNav?: Array<object>|null,
 *   planContext?: { consolidatedAnalyticsEnabled?: boolean }|null,
 *   includeMemberVerification?: boolean,
 * }} [opts]
 * @returns {ClassicAdminNavItem[]}
 */
function buildClassicHqNavItems(opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  let items = insertPackageFeatureItems(CLASSIC_HQ_ADMIN_NAV, options.packageFeatureNav, {
    afterKey: "reports",
  });
  // Match assertCrossBranchMemberAccess / organisationAllowsBranchPaths — Growth-only queue.
  if (!options.includeMemberVerification) {
    items = items.filter((item) => item.key !== "verification");
  }
  const analyticsLocked =
    options.planContext && options.planContext.consolidatedAnalyticsEnabled === false;
  return items.map((item) => {
    if (item.key !== "analytics" || !analyticsLocked) return item;
    return { ...item, lockLabel: "Premium" };
  });
}

/**
 * @param {ClassicAdminNavItem[]} navItems
 * @param {string} activeNav
 */
function buildClassicBranchMobileNav(navItems, activeNav) {
  return buildAdminMobileNavModel(navItems, activeNav, CLASSIC_BRANCH_MOBILE_NAV_CONFIG);
}

/**
 * @param {ClassicAdminNavItem[]} navItems
 * @param {string} activeNav
 */
function buildClassicHqMobileNav(navItems, activeNav) {
  return buildAdminMobileNavModel(navItems, activeNav, CLASSIC_HQ_MOBILE_NAV_CONFIG);
}

module.exports = {
  CLASSIC_BRANCH_ADMIN_NAV,
  CLASSIC_HQ_ADMIN_NAV,
  CLASSIC_BRANCH_MOBILE_NAV_CONFIG,
  CLASSIC_HQ_MOBILE_NAV_CONFIG,
  buildClassicBranchNavItems,
  buildClassicHqNavItems,
  buildClassicBranchMobileNav,
  buildClassicHqMobileNav,
};
