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

const {
  ADMIN_CONSOLE_SLOTS,
  groupNavItemsByAdminConsoleSlot,
  sortNavItemsByAdminConsoleSlot,
} = require("../../platform/admin-console/adminConsoleShell");

/** Canonical Admin Console slot labels (V2.05). */
const NAV_GROUPS = Object.freeze(
  ADMIN_CONSOLE_SLOTS.map((s) => ({ key: s.key, label: s.label }))
);

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
    slot: "dashboard",
  },
  // Admin Console rule: Website is second (after Dashboard) when permitted.
  {
    key: "website",
    label: "Website",
    href: "/app/settings/website",
    anyOf: ["website.view", "website.edit"],
    icon: "language",
    slot: "website",
  },
  {
    key: "patients",
    label: "Patients",
    href: "/app/patients",
    // List entry uses patient.search; view alone is not enough for the directory.
    permission: "activeclinic.patient.search",
    icon: "personal_injury",
    slot: "people",
  },
  {
    key: "appointments",
    label: "Appointments",
    href: "/app/appointments",
    permission: "activeclinic.appointment.view",
    icon: "event",
    slot: "operations",
  },
  {
    key: "reception",
    label: "Reception",
    href: "/app/reception",
    permission: "activeclinic.reception.view",
    icon: "desk",
    slot: "operations",
  },
  {
    key: "booking_requests",
    label: "Booking requests",
    href: "/app/booking-requests",
    permission: "activeclinic.patient.search",
    icon: "event_available",
    slot: "operations",
  },
  {
    key: "clinical",
    label: "Clinical",
    href: "/app/clinical",
    permission: "activeclinic.encounter.view",
    icon: "medical_services",
    slot: "operations",
  },
  {
    key: "clinical_follow_up",
    label: "Follow-up",
    href: "/app/clinical/follow-up",
    permission: "activeclinic.encounter.view",
    icon: "event_repeat",
    slot: "operations",
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    href: "/app/pharmacy",
    permission: "activeclinic.pharmacy.view",
    icon: "medication",
    slot: "operations",
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
    slot: "operations",
  },
  {
    key: "billing",
    label: "Billing",
    href: "/app/billing",
    permission: "activeclinic.billing.view",
    icon: "receipt",
    slot: "operations",
  },
  {
    key: "cashier",
    label: "Cashier",
    href: "/app/cashier",
    // Module entry requires opening sessions — not payment.view alone.
    permission: "activeclinic.cashier.open_session",
    icon: "payments",
    slot: "operations",
  },
  {
    key: "services",
    label: "Services",
    href: "/app/services",
    anyOf: ["website.view", "website.edit"],
    icon: "catalog",
    slot: "content",
  },
  {
    key: "practitioners",
    label: "Practitioners",
    href: "/app/practitioners",
    permission: "activeclinic.staff.view",
    icon: "stethoscope",
    slot: "people",
  },
  {
    key: "staff",
    label: "Staff",
    href: "/app/staff",
    permission: "activeclinic.staff.view",
    icon: "groups",
    slot: "people",
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
    slot: "locations",
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
    slot: "locations",
  },
  {
    key: "performance",
    label: "Performance",
    href: "/app/performance",
    permission: "activeclinic.performance.view",
    icon: "monitoring",
    slot: "reports",
  },
  {
    key: "data",
    label: "Import & export",
    href: "/app/data",
    anyOf: ["activeclinic.data.import", "activeclinic.data.export"],
    icon: "import_export",
    slot: "reports",
  },
  {
    key: "access",
    label: "Roles & access",
    href: "/app/access",
    permission: "activeclinic.staff.assign_access",
    icon: "admin_panel_settings",
    slot: "access",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/app/settings",
    // Account self-service is always on the overview; cards remain permission-aware.
    permission: "activeclinic.access",
    icon: "settings",
    slot: "settings",
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
  items = sortNavItemsByAdminConsoleSlot(items);
  const groups = groupNavItemsByAdminConsoleSlot(items);

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
  ADMIN_CONSOLE_SLOTS,
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
