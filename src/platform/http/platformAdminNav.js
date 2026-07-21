"use strict";

/**
 * Platform-admin navigation (apex shell only).
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
    label: "Organizations",
    href: "/admin/organizations",
    icon: "corporate_fare",
    nav: true,
    enabled: true,
  },
  {
    key: "registration-applications",
    label: "Registration Applications",
    href: "/admin/registration-applications",
    icon: "app_registration",
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
    key: "subscriptions",
    label: "Subscriptions",
    href: "/admin/subscriptions",
    icon: "receipt_long",
    nav: true,
    enabled: true,
  },
  {
    key: "domains",
    label: "Domains",
    href: "/admin/domains",
    icon: "language",
    nav: true,
    enabled: true,
  },
  {
    key: "deployments",
    label: "Deployments",
    href: "/admin/deployments",
    icon: "dns",
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
    key: "maintenance",
    label: "Maintenance",
    href: "/admin/maintenance",
    icon: "build",
    nav: true,
    // Visibility is filtered by DEPLOYMENT_ENV=testing in shell locals.
    enabled: true,
    testingOnly: true,
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
  "plans",
  "account",
]);

module.exports = {
  PLATFORM_ADMIN_NAV,
  PLATFORM_ADMIN_MOBILE_TABS,
};
