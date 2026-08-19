"use strict";

/**
 * Capability-driven ActiveClinic dashboard catalogue.
 *
 * Authorization = effective permission union (caller supplies).
 * Clinic configuration = active facility department types (optional).
 * Department config never grants permissions; missing departments hide tiles.
 */

const {
  MODULE_DEPARTMENT_REQUIREMENTS,
  departmentRequirementMet,
} = require("./activeClinicModuleAvailability");

/**
 * Dashboard module tiles. Keys align with navigation / department gates.
 * Permission checks use `permission` or `anyOf` (OR). Never role-name labels.
 */
const DASHBOARD_MODULE_TILES = Object.freeze([
  {
    key: "patients",
    label: "Patients",
    href: "/app/patients",
    section: "operational",
    permission: "activeclinic.patient.search",
    description: "Search and open patient records",
  },
  {
    key: "register_patient",
    label: "Register patient",
    href: "/app/patients/new",
    section: "operational",
    permission: "activeclinic.patient.create",
    description: "Full administrative patient registration",
    quickAction: true,
  },
  {
    key: "quick_register_patient",
    label: "Quick Register",
    href: "/app/patients/quick-register",
    section: "operational",
    permission: "activeclinic.patient.quick_register",
    // Hide when full create is also present (prefer Register patient).
    unlessPermission: "activeclinic.patient.create",
    description: "Minimal patient identity for urgent care",
    quickAction: true,
  },
  {
    key: "appointments",
    label: "Appointments",
    href: "/app/appointments",
    section: "operational",
    permission: "activeclinic.appointment.view",
    description: "View and manage appointments",
  },
  {
    key: "reception",
    label: "Reception",
    href: "/app/reception",
    section: "operational",
    permission: "activeclinic.reception.view",
    description: "Reception queue and check-in",
  },
  {
    key: "clinical",
    label: "Clinical",
    href: "/app/clinical",
    section: "clinical",
    permission: "activeclinic.encounter.view",
    description: "Encounters, triage, and consultations",
  },
  {
    key: "pharmacy",
    label: "Pharmacy",
    href: "/app/pharmacy",
    section: "pharmacy",
    permission: "activeclinic.pharmacy.view",
    description: "Dispensing queue and inventory",
  },
  {
    key: "diagnostics",
    label: "Diagnostics",
    href: "/app/diagnostics",
    section: "diagnostics",
    anyOf: [
      "activeclinic.lab.view",
      "activeclinic.radiology.view",
      "activeclinic.diagnostics.view",
    ],
    description: "Laboratory and radiology worklists",
  },
  {
    key: "billing",
    label: "Billing",
    href: "/app/billing",
    section: "finance",
    permission: "activeclinic.billing.view",
    description: "Invoices and patient billing",
  },
  {
    key: "cashier",
    label: "Cashier",
    href: "/app/cashier",
    section: "finance",
    permission: "activeclinic.cashier.open_session",
    description: "Cashier sessions and payments",
  },
  {
    key: "facilities",
    label: "Facilities",
    href: "/app/facilities",
    section: "administration",
    anyOf: [
      "activeclinic.facility.create",
      "activeclinic.facility.update",
      "activeclinic.facility.archive",
    ],
    description: "Facility catalogue and administration",
  },
  {
    key: "staff",
    label: "Staff",
    href: "/app/staff",
    section: "administration",
    permission: "activeclinic.staff.view",
    description: "Staff directory and invitations",
  },
  {
    key: "access",
    label: "Roles & access",
    href: "/app/access",
    section: "administration",
    permission: "activeclinic.staff.assign_access",
    description: "Assign roles and scopes",
  },
  {
    key: "organization",
    label: "Organization profile",
    href: "/app/settings/organization",
    section: "administration",
    anyOf: ["activeclinic.organization.view", "activeclinic.organization.manage"],
    description: "Clinic identity, legal name, and regional defaults",
  },
  {
    key: "website",
    label: "Website",
    href: "/app/settings/website",
    section: "administration",
    anyOf: ["website.view", "website.edit"],
    description: "Public clinic website and publish controls",
  },
  {
    key: "departments",
    label: "Departments",
    href: "/app/settings/clinic-setup/departments",
    section: "administration",
    permission: "activeclinic.departments.manage",
    description: "Enable operational departments for this facility",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/app/settings",
    section: "administration",
    permission: "activeclinic.access",
    description: "Account and clinic settings overview",
  },
]);

const SECTION_META = Object.freeze({
  operational: { key: "operational", title: "Reception & patients" },
  clinical: { key: "clinical", title: "Clinical" },
  pharmacy: { key: "pharmacy", title: "Pharmacy" },
  diagnostics: { key: "diagnostics", title: "Diagnostics" },
  finance: { key: "finance", title: "Billing & cashier" },
  administration: { key: "administration", title: "Administration" },
});

const PRIMARY_SECTIONS = new Set([
  "operational",
  "clinical",
  "pharmacy",
  "diagnostics",
  "finance",
]);

function hasPermission(permissionSet, key) {
  return permissionSet instanceof Set
    ? permissionSet.has(key)
    : Boolean(permissionSet && permissionSet[key]);
}

function tilePermissionOk(tile, permissionSet) {
  if (Array.isArray(tile.anyOf) && tile.anyOf.length) {
    return tile.anyOf.some((p) => hasPermission(permissionSet, p));
  }
  if (tile.permission) return hasPermission(permissionSet, tile.permission);
  return false;
}

/**
 * Department gate for a dashboard tile.
 * When activeDepartmentTypes is null (no facility context), department-gated
 * modules are hidden — routes require a selected facility and would fail.
 *
 * @param {object} tile
 * @param {Set<string>|null|undefined} activeDepartmentTypes
 */
function tileDepartmentOk(tile, activeDepartmentTypes) {
  const requirement = MODULE_DEPARTMENT_REQUIREMENTS[tile.key];
  if (requirement == null) return true;
  if (activeDepartmentTypes == null) return false;
  return departmentRequirementMet(requirement, activeDepartmentTypes);
}

/**
 * @param {string[]|Set<string>} permissions
 * @param {{
 *   activeDepartmentTypes?: Set<string>|string[]|null,
 *   includeSelectFacility?: boolean,
 * }} [options]
 */
function buildAuthorizedDashboardTiles(permissions, options) {
  const opts = options || {};
  const permissionSet =
    permissions instanceof Set ? permissions : new Set(permissions || []);
  let activeTypes = opts.activeDepartmentTypes;
  if (Array.isArray(activeTypes)) activeTypes = new Set(activeTypes);

  const tiles = [];
  if (opts.includeSelectFacility) {
    tiles.push({
      key: "select_facility",
      label: "Select facility",
      href: "/app/select-facility",
      section: "operational",
      primary: true,
      description: "Choose a facility context to continue",
      requiredPermission: null,
      departmentGated: false,
    });
  }

  for (const tile of DASHBOARD_MODULE_TILES) {
    if (!tilePermissionOk(tile, permissionSet)) continue;
    if (
      tile.unlessPermission &&
      hasPermission(permissionSet, tile.unlessPermission)
    ) {
      continue;
    }
    if (!tileDepartmentOk(tile, activeTypes)) continue;
    const section = tile.section || "operational";
    tiles.push({
      key: tile.key,
      label: tile.label,
      href: tile.href,
      section,
      primary: PRIMARY_SECTIONS.has(section),
      description: tile.description || null,
      requiredPermission: tile.permission || (tile.anyOf && tile.anyOf[0]) || null,
      departmentGated: MODULE_DEPARTMENT_REQUIREMENTS[tile.key] != null,
    });
  }
  return tiles;
}

/**
 * Group authorized tiles into non-empty sections (presentation-ready).
 * @param {object[]} tiles
 */
function groupDashboardSections(tiles) {
  const buckets = {
    operational: [],
    clinical: [],
    pharmacy: [],
    diagnostics: [],
    finance: [],
    administration: [],
  };
  for (const tile of tiles || []) {
    const key = buckets[tile.section] ? tile.section : "operational";
    buckets[key].push(tile);
  }
  const sections = [];
  for (const meta of Object.values(SECTION_META)) {
    const items = buckets[meta.key];
    if (items && items.length) {
      sections.push({
        key: meta.key,
        title: meta.title,
        items,
      });
    }
  }
  return { buckets, sections };
}

/**
 * Flat quick-actions list for header CTAs / legacy template consumers.
 * Primary work first, then administration; Settings last among admin.
 */
function toQuickActions(tiles) {
  const primary = (tiles || []).filter((t) => t.primary);
  const admin = (tiles || []).filter((t) => !t.primary);
  return [...primary, ...admin].map((t) => ({
    key: t.key,
    label: t.label,
    href: t.href,
    primary: t.key === "select_facility" || (t.primary && primary[0] === t),
    section: t.section,
  }));
}

module.exports = {
  DASHBOARD_MODULE_TILES,
  SECTION_META,
  buildAuthorizedDashboardTiles,
  groupDashboardSections,
  toQuickActions,
  tilePermissionOk,
  tileDepartmentOk,
};
