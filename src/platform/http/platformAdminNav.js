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
    key: "account",
    label: "Account",
    href: "/admin/account",
    icon: "person",
    nav: true,
    enabled: true,
  },
]);

const PLATFORM_ADMIN_MOBILE_TABS = Object.freeze(["home", "organizations", "account"]);

module.exports = {
  PLATFORM_ADMIN_NAV,
  PLATFORM_ADMIN_MOBILE_TABS,
};
