"use strict";

/**
 * HQ admin navigation model for BlessBoard V5 shell.
 * Enabled entries match live /hq routes; deferred Stitch modules are omitted.
 */

const HQ_ADMIN_NAV = Object.freeze([
  { key: "home", label: "Dashboard", href: "/hq", icon: "dashboard", enabled: true, nav: true },
  {
    key: "branches",
    label: "Branches",
    href: "/hq/branches",
    icon: "apartment",
    enabled: true,
    nav: true,
  },
  {
    key: "settings",
    label: "Settings",
    href: "/hq/settings",
    icon: "settings",
    enabled: true,
    nav: true,
  },
  {
    key: "content",
    label: "Website",
    href: "/hq/content",
    icon: "language",
    enabled: true,
    nav: true,
  },
  {
    key: "announcements",
    label: "Announcements",
    href: "/hq/announcements",
    icon: "campaign",
    enabled: true,
    nav: true,
  },
  {
    key: "participation",
    label: "Participation",
    href: "/hq/participation",
    icon: "groups",
    enabled: true,
    nav: true,
  },
  {
    key: "attendance",
    label: "Attendance",
    href: "/hq/attendance",
    icon: "fact_check",
    enabled: true,
    nav: true,
  },
  {
    key: "giving",
    label: "Giving",
    href: "/hq/giving",
    icon: "payments",
    enabled: true,
    nav: true,
  },
  {
    key: "resources",
    label: "Resources",
    href: "/hq/resources",
    icon: "menu_book",
    enabled: true,
    nav: true,
  },
  {
    key: "forms",
    label: "Forms",
    href: "/hq/forms",
    icon: "description",
    enabled: true,
    nav: true,
  },
  {
    key: "requests",
    label: "Requests",
    href: "/hq/requests",
    icon: "inbox",
    enabled: true,
    nav: true,
  },
  {
    key: "reports",
    label: "Reports",
    href: "/hq/reports",
    icon: "analytics",
    enabled: true,
    nav: true,
  },
  {
    key: "audit",
    label: "Audit",
    href: "/hq/audit",
    icon: "history",
    enabled: true,
    nav: true,
  },
  {
    key: "account",
    label: "Account",
    href: "/hq/account",
    icon: "person",
    enabled: true,
    nav: true,
  },
]);

/** Mobile bottom tabs — shell-first, not every module. */
const HQ_ADMIN_MOBILE_TABS = Object.freeze(["home", "branches", "reports", "account"]);

module.exports = {
  HQ_ADMIN_NAV,
  HQ_ADMIN_MOBILE_TABS,
};
