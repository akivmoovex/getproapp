"use strict";

/**
 * Member portal navigation model (implemented routes vs disabled future modules).
 */

const PORTAL_NAV = Object.freeze([
  { key: "home", label: "Home", href: "/member", icon: "home", enabled: true, nav: true },
  {
    key: "announcements",
    label: "Announcements",
    href: "/member/announcements",
    icon: "campaign",
    enabled: true,
    nav: true,
  },
  {
    key: "events",
    label: "Events",
    href: "/member/events",
    icon: "event",
    enabled: true,
    nav: true,
  },
  {
    key: "ministries",
    label: "Ministries",
    href: "/member/ministries",
    icon: "groups",
    enabled: true,
    nav: true,
  },
  {
    key: "resources",
    label: "Resources",
    href: "/member/resources",
    icon: "menu_book",
    enabled: true,
    nav: true,
  },
  {
    key: "forms",
    label: "Forms",
    href: "/member/forms",
    icon: "description",
    enabled: true,
    nav: true,
  },
  {
    key: "requests",
    label: "Requests",
    href: "/member/requests",
    icon: "inbox",
    enabled: true,
    nav: true,
  },
  {
    key: "giving",
    label: "Giving",
    href: "/member/giving",
    icon: "payments",
    enabled: true,
    nav: true,
  },
  {
    key: "profile",
    label: "Profile",
    href: "/member/profile",
    icon: "person",
    enabled: true,
    nav: true,
  },
]);

const PORTAL_MODULES = Object.freeze([
  ...PORTAL_NAV.filter((item) => item.key !== "home").map((item) => ({
    key: item.key,
    label: item.label,
    href: item.href,
    icon: item.icon,
    enabled: item.enabled,
  })),
  {
    key: "prayer",
    label: "Prayer request",
    href: null,
    icon: "volunteer_activism",
    enabled: false,
  },
]);

const PORTAL_MOBILE_TABS = Object.freeze([
  "home",
  "announcements",
  "events",
  "ministries",
  "profile",
]);

module.exports = {
  PORTAL_NAV,
  PORTAL_MODULES,
  PORTAL_MOBILE_TABS,
};
