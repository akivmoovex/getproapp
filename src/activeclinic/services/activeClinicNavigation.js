"use strict";

/**
 * ActiveClinic navigation registry (permission-filtered; no role-name checks).
 *
 * Facilities nav uses facility administration permissions (create/update/archive),
 * not facility.view — almost every role has facility.view for context, but the
 * Facilities module is the management catalogue.
 *
 * Settings remains available with activeclinic.access so account self-service
 * is reachable; cards on the settings overview stay individually gated.
 *
 * Reports: no coherent landing route — omitted from nav.
 */

const NAV_ITEMS = Object.freeze([
  {
    key: "home",
    label: "Dashboard",
    href: "/app",
    permission: "activeclinic.access",
    icon: "home",
  },
  {
    key: "patients",
    label: "Patients",
    href: "/app/patients",
    // List entry uses patient.search; view alone is not enough for the directory.
    permission: "activeclinic.patient.search",
    icon: "personal_injury",
  },
  {
    key: "appointments",
    label: "Appointments",
    href: "/app/appointments",
    permission: "activeclinic.appointment.view",
    icon: "event",
  },
  {
    key: "reception",
    label: "Reception",
    href: "/app/reception",
    permission: "activeclinic.reception.view",
    icon: "desk",
  },
  {
    key: "booking_requests",
    label: "Booking requests",
    href: "/app/booking-requests",
    permission: "activeclinic.patient.search",
    icon: "event_available",
  },
  {
    key: "clinical",
    label: "Clinical",
    href: "/app/clinical",
    permission: "activeclinic.encounter.view",
    icon: "medical_services",
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    href: "/app/pharmacy",
    permission: "activeclinic.pharmacy.view",
    icon: "medication",
  },
  {
    key: "diagnostics",
    label: "Diagnostics",
    href: "/app/diagnostics",
    // Lab, radiology, or legacy diagnostics.view (admin hub aggregation).
    anyOf: [
      "activeclinic.lab.view",
      "activeclinic.radiology.view",
      "activeclinic.diagnostics.view",
    ],
    icon: "biotech",
  },
  {
    key: "billing",
    label: "Billing",
    href: "/app/billing",
    permission: "activeclinic.billing.view",
    icon: "receipt",
  },
  {
    key: "cashier",
    label: "Cashier",
    href: "/app/cashier",
    // Module entry requires opening sessions — not payment.view alone.
    permission: "activeclinic.cashier.open_session",
    icon: "payments",
  },
  {
    key: "staff",
    label: "Staff",
    href: "/app/staff",
    permission: "activeclinic.staff.view",
    icon: "groups",
  },
  {
    key: "facilities",
    label: "Facilities",
    href: "/app/facilities",
    // Management catalogue — not the near-universal facility.view context perm.
    anyOf: [
      "activeclinic.facility.create",
      "activeclinic.facility.update",
      "activeclinic.facility.archive",
    ],
    icon: "apartment",
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
    // Account self-service is always on the overview; cards remain permission-aware.
    permission: "activeclinic.access",
    icon: "settings",
  },
]);

function itemIsVisible(item, permissionSet) {
  if (Array.isArray(item.anyOf) && item.anyOf.length) {
    return item.anyOf.some((p) => permissionSet.has(p));
  }
  if (item.permission) return permissionSet.has(item.permission);
  return false;
}

/**
 * @param {string[]} permissions
 * @param {string} [activeKey]
 * @param {{ activeDepartmentTypes?: Set<string>|string[]|null }} [options]
 */
function buildActiveClinicNavigation(permissions, activeKey, options) {
  const set = new Set(Array.isArray(permissions) ? permissions : []);
  let items = NAV_ITEMS.filter((item) => itemIsVisible(item, set)).map((item) => ({
    ...item,
    // Expose a single representative permission for tests/markers.
    permission: item.permission || (item.anyOf && item.anyOf[0]) || null,
    current: activeKey != null && item.key === activeKey,
  }));
  if (options && Object.prototype.hasOwnProperty.call(options, "activeDepartmentTypes")) {
    const {
      filterNavItemsByDepartments,
    } = require("./activeClinicModuleAvailability");
    // null = no facility context → treat as empty (department-gated modules unreachable).
    const types =
      options.activeDepartmentTypes == null
        ? new Set()
        : options.activeDepartmentTypes;
    items = filterNavItemsByDepartments(items, types);
  }
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
  if (path.startsWith("/app/patients")) return "patients";
  if (path.startsWith("/app/appointments")) return "appointments";
  if (path.startsWith("/app/reception")) return "reception";
  if (path.startsWith("/app/booking-requests")) return "booking_requests";
  if (path.startsWith("/app/clinical")) return "clinical";
  if (path.startsWith("/app/pharmacy")) return "pharmacy";
  if (path.startsWith("/app/diagnostics")) return "diagnostics";
  if (path.startsWith("/app/billing")) return "billing";
  if (path.startsWith("/app/cashier")) return "cashier";
  if (path.startsWith("/app/staff")) return "staff";
  if (path.startsWith("/app/facilities")) return "facilities";
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
  itemIsVisible,
};
