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

/** Stitch shell groups (P01 Shared Application Shell). Only implemented modules are listed. */
const NAV_GROUPS = Object.freeze([
  { key: "daily_work", label: "Daily work" },
  { key: "clinical_services", label: "Clinical services" },
  { key: "operations", label: "Operations" },
  { key: "management", label: "Management" },
]);

/** Persistent Check-in CTA (Batch 2 shell) — real reception route only. */
const CHECK_IN_PERMISSION = "activeclinic.reception.check_in";
const CHECK_IN_HREF = "/app/reception/check-in";
const PATIENT_SEARCH_PERMISSION = "activeclinic.patient.search";

/**
 * Preferred order for mobile bottom tabs (real registry keys only).
 * Filled from authorized nav items; remainder stay in the drawer via More.
 */
const MOBILE_BOTTOM_NAV_ORDER = Object.freeze([
  "home",
  "patients",
  "appointments",
  "clinical",
  "reception",
  "pharmacy",
  "billing",
]);

const MOBILE_BOTTOM_SHORT_LABELS = Object.freeze({
  home: "Home",
  patients: "Patients",
  appointments: "Appts",
  clinical: "Clinical",
  reception: "Queue",
  pharmacy: "Pharmacy",
  billing: "Billing",
  diagnostics: "Dx",
  cashier: "Cashier",
  settings: "Settings",
});

const NAV_ITEMS = Object.freeze([
  {
    key: "home",
    label: "Dashboard",
    href: "/app",
    permission: "activeclinic.access",
    icon: "home",
    group: "daily_work",
  },
  {
    key: "patients",
    label: "Patients",
    href: "/app/patients",
    // List entry uses patient.search; view alone is not enough for the directory.
    permission: "activeclinic.patient.search",
    icon: "personal_injury",
    group: "daily_work",
  },
  {
    key: "appointments",
    label: "Appointments",
    href: "/app/appointments",
    permission: "activeclinic.appointment.view",
    icon: "event",
    group: "daily_work",
  },
  {
    key: "reception",
    label: "Reception",
    href: "/app/reception",
    permission: "activeclinic.reception.view",
    icon: "desk",
    group: "daily_work",
  },
  {
    key: "booking_requests",
    label: "Booking requests",
    href: "/app/booking-requests",
    permission: "activeclinic.patient.search",
    icon: "event_available",
    group: "daily_work",
  },
  {
    key: "clinical",
    label: "Clinical",
    href: "/app/clinical",
    permission: "activeclinic.encounter.view",
    icon: "medical_services",
    group: "daily_work",
  },
  {
    key: "clinical_follow_up",
    label: "Follow-up",
    href: "/app/clinical/follow-up",
    permission: "activeclinic.encounter.view",
    icon: "event_repeat",
    group: "daily_work",
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    href: "/app/pharmacy",
    permission: "activeclinic.pharmacy.view",
    icon: "medication",
    group: "clinical_services",
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
    group: "clinical_services",
  },
  {
    key: "billing",
    label: "Billing",
    href: "/app/billing",
    permission: "activeclinic.billing.view",
    icon: "receipt",
    group: "operations",
  },
  {
    key: "cashier",
    label: "Cashier",
    href: "/app/cashier",
    // Module entry requires opening sessions — not payment.view alone.
    permission: "activeclinic.cashier.open_session",
    icon: "payments",
    group: "operations",
  },
  {
    key: "services",
    label: "Services",
    href: "/app/services",
    anyOf: ["website.view", "website.edit"],
    icon: "catalog",
    group: "operations",
  },
  {
    key: "practitioners",
    label: "Practitioners",
    href: "/app/practitioners",
    permission: "activeclinic.staff.view",
    icon: "stethoscope",
    group: "operations",
  },
  {
    key: "staff",
    label: "Staff",
    href: "/app/staff",
    permission: "activeclinic.staff.view",
    icon: "groups",
    group: "operations",
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
    group: "management",
  },
  {
    key: "rooms",
    label: "Rooms & Spaces",
    href: "/app/rooms",
    // ACN27: view uses facility.view; nav entry for managers mirrors B2-10 admin set.
    anyOf: [
      "activeclinic.facility.create",
      "activeclinic.facility.update",
      "activeclinic.facility.archive",
    ],
    icon: "meeting_room",
    group: "management",
  },
  {
    key: "performance",
    label: "Performance",
    href: "/app/performance",
    permission: "activeclinic.performance.view",
    icon: "monitoring",
    group: "management",
  },
  {
    key: "data",
    label: "Import & export",
    href: "/app/data",
    anyOf: ["activeclinic.data.import", "activeclinic.data.export"],
    icon: "import_export",
    group: "management",
  },
  {
    key: "access",
    label: "Roles & access",
    href: "/app/access",
    permission: "activeclinic.staff.assign_access",
    icon: "admin_panel_settings",
    group: "management",
  },
  {
    key: "website",
    label: "Website",
    href: "/app/settings/website",
    anyOf: ["website.view", "website.edit"],
    icon: "language",
    group: "management",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/app/settings",
    // Account self-service is always on the overview; cards remain permission-aware.
    permission: "activeclinic.access",
    icon: "settings",
    group: "management",
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
 * Persistent Check-in Patient CTA for Batch 2 shell. Real route only.
 * @param {string[]|Set<string>} permissions
 * @returns {{ href: string, label: string, permission: string }|null}
 */
function buildCheckInShellAction(permissions) {
  const set =
    permissions instanceof Set
      ? permissions
      : new Set(Array.isArray(permissions) ? permissions : []);
  if (!set.has(CHECK_IN_PERMISSION)) return null;
  return {
    href: CHECK_IN_HREF,
    label: "Check-in Patient",
    permission: CHECK_IN_PERMISSION,
  };
}

/**
 * @param {Array<object>} visibleNavItems — already permission + department filtered
 * @param {string|null} [activeKey]
 * @returns {Array<object>}
 */
function buildMobileBottomNavItems(visibleNavItems, activeKey) {
  const byKey = new Map(
    (Array.isArray(visibleNavItems) ? visibleNavItems : []).map((item) => [
      item.key,
      item,
    ])
  );
  const picked = [];
  for (const key of MOBILE_BOTTOM_NAV_ORDER) {
    if (picked.length >= 4) break;
    const item = byKey.get(key);
    if (!item) continue;
    picked.push({
      key: item.key,
      label: item.label,
      shortLabel: MOBILE_BOTTOM_SHORT_LABELS[item.key] || item.label,
      href: item.href,
      icon: item.icon,
      current: activeKey != null && item.key === activeKey,
      permission: item.permission || null,
    });
  }
  return picked;
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
  const groups = NAV_GROUPS.map((g) => ({
    ...g,
    items: items.filter((item) => item.group === g.key),
  })).filter((g) => g.items.length > 0);

  const mobileBottom = buildMobileBottomNavItems(items, activeKey);

  return {
    items,
    groups,
    desktop: items,
    mobile: items,
    mobileBottom,
    activeKey: activeKey || null,
    checkInAction: buildCheckInShellAction(set),
    globalSearchEnabled: set.has(PATIENT_SEARCH_PERMISSION),
  };
}

function matchActiveNavKey(pathname) {
  const path = String(pathname || "").split("?")[0];
  if (path === "/app" || path === "/app/") return "home";
  if (path.startsWith("/app/patients")) return "patients";
  if (path.startsWith("/app/appointments")) return "appointments";
  if (path.startsWith("/app/reception")) return "reception";
  if (path.startsWith("/app/booking-requests")) return "booking_requests";
  if (path.startsWith("/app/clinical/follow-up")) return "clinical_follow_up";
  if (path.startsWith("/app/clinical")) return "clinical";
  if (path.startsWith("/app/pharmacy")) return "pharmacy";
  if (path.startsWith("/app/diagnostics")) return "diagnostics";
  if (path.startsWith("/app/billing")) return "billing";
  if (path.startsWith("/app/cashier")) return "cashier";
  if (path.startsWith("/app/services")) return "services";
  if (path.startsWith("/app/practitioners")) return "practitioners";
  if (path.startsWith("/app/staff")) return "staff";
  if (path.startsWith("/app/facilities")) return "facilities";
  if (path.startsWith("/app/access")) return "access";
  if (path.startsWith("/app/settings/website")) return "website";
  if (path.startsWith("/app/onboarding")) return "home";
  if (path.startsWith("/app/settings")) return "settings";
  if (path.startsWith("/app/select-facility")) return "home";
  if (path.startsWith("/app/select-organization")) return "home";
  return null;
}

module.exports = {
  NAV_ITEMS,
  NAV_GROUPS,
  CHECK_IN_PERMISSION,
  CHECK_IN_HREF,
  PATIENT_SEARCH_PERMISSION,
  MOBILE_BOTTOM_NAV_ORDER,
  buildActiveClinicNavigation,
  buildCheckInShellAction,
  buildMobileBottomNavItems,
  matchActiveNavKey,
  itemIsVisible,
};
