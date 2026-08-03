"use strict";

/**
 * ActiveClinic navigation registry (permission-filtered; no role-name checks).
 */

const NAV_ITEMS = Object.freeze([
  {
    key: "home",
    label: "Home",
    href: "/app",
    permission: "activeclinic.access",
    icon: "home",
  },
  {
    key: "facilities",
    label: "Facilities",
    href: "/app/facilities",
    permission: "activeclinic.facility.view",
    icon: "apartment",
  },
  {
    key: "staff",
    label: "Staff",
    href: "/app/staff",
    permission: "activeclinic.staff.view",
    icon: "groups",
  },
  {
    key: "patients",
    label: "Patients",
    href: "/app/patients",
    permission: "activeclinic.patient.search",
    icon: "personal_injury",
  },
  {
    key: "access",
    label: "Roles & access",
    href: "/app/access",
    permission: "activeclinic.staff.assign_access",
    icon: "admin_panel_settings",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/app/settings",
    permission: "activeclinic.access",
    icon: "settings",
  },
]);

/**
 * @param {string[]} permissions
 * @param {string} [activeKey]
 */
function buildActiveClinicNavigation(permissions, activeKey) {
  const set = new Set(Array.isArray(permissions) ? permissions : []);
  const items = NAV_ITEMS.filter((item) => set.has(item.permission)).map((item) => ({
    ...item,
    current: activeKey != null && item.key === activeKey,
  }));
  return {
    items,
    desktop: items,
    mobile: items,
    activeKey: activeKey || null,
  };
}

function matchActiveNavKey(pathname) {
  const path = String(pathname || "").split("?")[0];
  if (path === "/app" || path === "/app/") return "home";
  if (path.startsWith("/app/facilities")) return "facilities";
  if (path.startsWith("/app/staff")) return "staff";
  if (path.startsWith("/app/patients")) return "patients";
  if (path.startsWith("/app/access")) return "access";
  if (path.startsWith("/app/settings")) return "settings";
  if (path.startsWith("/app/select-facility")) return "home";
  if (path.startsWith("/app/select-organization")) return "home";
  return null;
}

module.exports = {
  NAV_ITEMS,
  buildActiveClinicNavigation,
  matchActiveNavKey,
};
