"use strict";

/**
 * Platform-admin navigation (apex shell only).
 * Daily operations stay flat. Technical Deployments live under System.
 */

const PLATFORM_ADMIN_NAV = Object.freeze([
  {
    key: "home",
    label: "Dashboard",
    href: "/admin",
    icon: "dashboard",
    nav: true,
    enabled: true,
  },
  {
    key: "organizations",
    label: "Organisations",
    href: "/admin/organizations",
    icon: "corporate_fare",
    nav: true,
    enabled: true,
  },
  {
    key: "users",
    label: "Users",
    href: "/admin/users",
    icon: "group",
    nav: true,
    enabled: true,
  },
  {
    key: "members",
    label: "Members",
    href: "/admin/members",
    icon: "badge",
    nav: true,
    enabled: true,
  },
  {
    key: "registration-applications",
    label: "Church Registrations",
    href: "/admin/registration-applications",
    icon: "church",
    nav: true,
    enabled: true,
  },
  {
    key: "subscriptions",
    label: "Subscriptions",
    href: "/admin/subscriptions",
    icon: "receipt_long",
    nav: true,
    enabled: true,
  },
  {
    key: "domains",
    label: "Domains and links",
    href: "/admin/domains",
    icon: "language",
    nav: true,
    enabled: true,
  },
  {
    key: "roles",
    label: "Roles and access",
    href: "/admin/roles",
    icon: "admin_panel_settings",
    nav: true,
    enabled: true,
  },
  {
    key: "plans",
    label: "Plans",
    href: "/admin/plans",
    icon: "workspace_premium",
    nav: true,
    enabled: true,
  },
  {
    key: "settings",
    label: "Settings",
    href: "/admin/settings",
    icon: "settings",
    nav: true,
    enabled: true,
  },
  {
    key: "system",
    label: "System",
    href: "/admin/system/deployments",
    icon: "monitor_heart",
    nav: true,
    enabled: true,
    children: Object.freeze([
      {
        key: "deployments",
        label: "Deployments",
        href: "/admin/system/deployments",
        icon: "dns",
        nav: true,
        enabled: true,
        technical: true,
      },
      {
        key: "maintenance",
        label: "Maintenance",
        href: "/admin/maintenance",
        icon: "build",
        nav: true,
        enabled: true,
        testingOnly: true,
        technical: true,
      },
    ]),
  },
  {
    key: "account",
    label: "Account",
    href: "/admin/account",
    icon: "person",
    nav: true,
    enabled: true,
  },
]);

const PLATFORM_ADMIN_MOBILE_TABS = Object.freeze([
  "home",
  "organizations",
  "users",
  "members",
  "account",
]);

/**
 * Flatten nav for consumers that only need leaf links.
 * @param {readonly object[]} [items]
 * @param {{ includeTestingOnly?: boolean }} [opts]
 */
function flattenPlatformAdminNav(items, opts) {
  const includeTesting = Boolean(opts && opts.includeTestingOnly);
  const out = [];
  for (const item of items || PLATFORM_ADMIN_NAV) {
    if (!item || item.nav === false || item.enabled === false) continue;
    if (item.testingOnly && !includeTesting) continue;
    if (Array.isArray(item.children) && item.children.length) {
      for (const child of item.children) {
        if (!child || child.nav === false || child.enabled === false) continue;
        if (child.testingOnly && !includeTesting) continue;
        out.push(child);
      }
      continue;
    }
    out.push(item);
  }
  return out;
}

module.exports = {
  PLATFORM_ADMIN_NAV,
  PLATFORM_ADMIN_MOBILE_TABS,
  flattenPlatformAdminNav,
};
