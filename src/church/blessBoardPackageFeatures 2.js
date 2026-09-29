"use strict";

/**
 * Package-aware feature registry for UI gates and route enforcement.
 * Commercial truth remains in blessBoardPackageCatalogue entitlements;
 * this file only maps product surfaces to entitlement keys and UI modes.
 */

const { BLESSBOARD_PACKAGES, PACKAGE_CODES, getPackageDefinition, readEntitlementPath } = require("./blessBoardPackageCatalogue");

function entitlementsAllow(entitlements, key) {
  const value = readEntitlementPath(entitlements, key);
  if (value === false || value == null) return false;
  if (value === true) return true;
  if (typeof value === "number") return value !== 0 && !Number.isNaN(value);
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (!v || v === "false" || v === "off" || v === "none") return false;
    return true;
  }
  return Boolean(value);
}

/** @typedef {'available' | 'upgrade' | 'hidden'} FeatureUiState */
/** @typedef {'branch' | 'hq'} FeaturePortal */

/**
 * @typedef {object} PackageFeatureDefinition
 * @property {string} id
 * @property {string} entitlementKey
 * @property {string} name
 * @property {string} benefit
 * @property {FeaturePortal} portal
 * @property {string} path
 * @property {'upgrade' | 'hidden'} lockedUi
 * @property {boolean} [showInNav]
 * @property {string} [navLabel]
 * @property {string} [navKey]
 * @property {string[]} [mutationMethods]
 */

/** @type {PackageFeatureDefinition[]} */
const PACKAGE_FEATURES = [
  {
    id: "attendance_offline",
    entitlementKey: "attendance.offline",
    name: "Offline attendance",
    benefit: "Capture and sync attendance when devices are offline during services.",
    portal: "branch",
    path: "/branch/attendance-offline",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Offline attendance",
    navKey: "attendance-offline",
    mutationMethods: ["POST"],
  },
  {
    id: "attendance_custom_rules",
    entitlementKey: "attendance.custom_rules",
    name: "Configurable attendance rules",
    benefit: "Define branch-specific check-in rules and eligibility policies.",
    portal: "branch",
    path: "/branch/attendance-rules",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Attendance rules",
    navKey: "attendance-rules",
    mutationMethods: ["POST"],
  },
  {
    id: "care_automation",
    entitlementKey: "care.automation",
    name: "Pastoral-care automation",
    benefit: "Automated missed-service follow-up, SLAs, escalation, and workload reporting.",
    portal: "branch",
    path: "/branch/pastoral-automation",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Pastoral automation",
    navKey: "pastoral-automation",
    mutationMethods: ["POST"],
    requiredEntitlementValue: "advanced",
  },
  {
    id: "appointments_calendar",
    entitlementKey: "appointments.calendar",
    name: "Appointment calendar",
    benefit: "Book pastoral and office appointments with a shared calendar.",
    portal: "branch",
    path: "/branch/appointments",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Appointments",
    navKey: "appointments",
    mutationMethods: ["POST"],
  },
  {
    id: "surveys_custom",
    entitlementKey: "surveys.custom",
    name: "Custom surveys",
    benefit: "Recurring surveys, branching questions, consent, and response routing.",
    portal: "branch",
    path: "/branch/surveys",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Surveys",
    navKey: "surveys",
    mutationMethods: ["POST"],
    requiredEntitlementValue: "true",
  },
  {
    id: "groups_management",
    entitlementKey: "groups.management",
    name: "Growth groups",
    benefit: "Small groups with leaders, capacity, join requests, meetings, and attendance.",
    portal: "branch",
    path: "/branch/groups",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Groups",
    navKey: "groups",
    mutationMethods: ["POST"],
  },
  {
    id: "discipleship_pathways",
    entitlementKey: "discipleship.pathways",
    name: "Discipleship pathways",
    benefit: "Stages, milestones, owners, and movement history for members.",
    portal: "branch",
    path: "/branch/discipleship",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Discipleship",
    navKey: "discipleship",
    mutationMethods: ["POST"],
  },
  {
    id: "volunteers_scheduling",
    entitlementKey: "volunteers.scheduling",
    name: "Volunteer scheduling",
    benefit: "Plan volunteer shifts beyond the basic duty roster.",
    portal: "branch",
    path: "/branch/volunteer-scheduling",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Volunteer scheduling",
    navKey: "volunteer-scheduling",
    mutationMethods: ["POST"],
  },
  {
    id: "events_advanced_logistics",
    entitlementKey: "events.advanced_logistics",
    name: "Advanced event logistics",
    benefit: "Coordinate rooms, teams, and advanced event run-sheets.",
    portal: "branch",
    path: "/branch/event-logistics",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Event logistics",
    navKey: "event-logistics",
    mutationMethods: ["POST"],
  },
  {
    id: "broadcasts_scheduled",
    entitlementKey: "broadcasts.scheduled",
    name: "Scheduled broadcasts",
    benefit: "Schedule HQ broadcasts to publish automatically at a chosen time.",
    portal: "hq",
    path: "/hq/scheduled-broadcasts",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Scheduled broadcasts",
    navKey: "broadcasts-scheduled",
    mutationMethods: ["POST"],
  },
  {
    id: "reports_scheduled",
    entitlementKey: "reports.scheduled",
    name: "Scheduled reports",
    benefit: "Automate monthly and operational report reminders.",
    portal: "branch",
    path: "/branch/scheduled-reports",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Scheduled reports",
    navKey: "reports-scheduled",
    mutationMethods: ["POST"],
  },
  {
    id: "reports_cross_branch",
    entitlementKey: "reports.cross_branch",
    name: "Cross-branch reports",
    benefit: "Compare attendance, giving, and activity across campuses.",
    portal: "hq",
    path: "/hq/cross-branch-reports",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Cross-branch reports",
    navKey: "reports-cross-branch",
    mutationMethods: ["POST"],
  },
  {
    id: "reports_custom_builder",
    entitlementKey: "reports.custom_builder",
    name: "Custom report builder",
    benefit: "Design bespoke report layouts beyond standard templates.",
    portal: "hq",
    path: "/hq/custom-report-builder",
    lockedUi: "hidden",
    showInNav: false,
    mutationMethods: ["POST"],
  },
  {
    id: "integrations_public_api",
    entitlementKey: "integrations.public_api",
    name: "Public API",
    benefit: "Integrate BlessBoard data with external systems via API.",
    portal: "hq",
    path: "/hq/integrations/api",
    lockedUi: "hidden",
    showInNav: false,
    mutationMethods: ["POST"],
  },
  {
    id: "integrations_webhooks",
    entitlementKey: "integrations.webhooks",
    name: "Webhooks",
    benefit: "Push church events to external tools in real time.",
    portal: "hq",
    path: "/hq/integrations/webhooks",
    lockedUi: "hidden",
    showInNav: false,
    mutationMethods: ["POST"],
  },
  {
    id: "domains_custom",
    entitlementKey: "domains.custom",
    name: "Custom domain",
    benefit: "Serve your branch site on your own church domain.",
    portal: "branch",
    path: "/branch/domains/custom",
    lockedUi: "upgrade",
    showInNav: true,
    navLabel: "Custom domain",
    navKey: "domains-custom",
    mutationMethods: ["POST"],
  },
  {
    id: "email_hosted",
    entitlementKey: "email.mailboxes_per_branch",
    name: "Hosted email",
    benefit: "Provision church mailboxes hosted with your branch.",
    portal: "branch",
    path: "/branch/email/hosted",
    lockedUi: "hidden",
    showInNav: false,
    mutationMethods: ["POST"],
  },
  {
    id: "network_executive_hierarchy",
    entitlementKey: "network.executive_hierarchy",
    name: "Network executive hierarchy",
    benefit: "Manage multi-organisation Network leadership structures.",
    portal: "hq",
    path: "/hq/network/hierarchy",
    lockedUi: "hidden",
    showInNav: false,
    mutationMethods: ["POST"],
  },
  {
    id: "network_priority_support",
    entitlementKey: "network.priority_support",
    name: "Network priority support",
    benefit: "Access Network priority support channels and SLAs.",
    portal: "hq",
    path: "/hq/network/support",
    lockedUi: "hidden",
    showInNav: false,
    mutationMethods: ["GET", "POST"],
  },
];

const FEATURES_BY_ID = Object.fromEntries(PACKAGE_FEATURES.map((f) => [f.id, f]));
const FEATURES_BY_PATH = Object.fromEntries(PACKAGE_FEATURES.map((f) => [f.path, f]));

/**
 * Lowest package (Foundation → Growth → Network label) that includes the entitlement.
 * @param {string} entitlementKey
 * @returns {{ code: string, label: string }}
 */
function requiredPackageForEntitlement(entitlementKey) {
  for (const code of PACKAGE_CODES) {
    const def = getPackageDefinition(code);
    if (entitlementsAllow(def.entitlements, entitlementKey)) {
      return { code, label: def.label };
    }
  }
  return { code: "network", label: "Network" };
}

function entitlementSourceForPlan(plan) {
  if (!plan) return {};
  if (plan.entitlements && typeof plan.entitlements === "object") return plan.entitlements;
  if (plan.packageDefinition && plan.packageDefinition.entitlements) {
    return plan.packageDefinition.entitlements;
  }
  return plan;
}

/**
 * @param {object | null} plan - getOrganisationPlan result
 * @param {PackageFeatureDefinition | string} featureOrId
 * @returns {{
 *   state: FeatureUiState,
 *   feature: PackageFeatureDefinition,
 *   packageCode: string,
 *   packageLabel: string,
 *   requiredPackageCode: string,
 *   requiredPackageLabel: string,
 *   entitlementKey: string,
 *   accountPath: string,
 * }}
 */
function resolveFeatureUi(plan, featureOrId) {
  const feature =
    typeof featureOrId === "string" ? FEATURES_BY_ID[featureOrId] : featureOrId;
  if (!feature) {
    throw Object.assign(new Error("Unknown package feature."), { code: "UNKNOWN_FEATURE" });
  }

  const packageCode = (plan && plan.packageCode) || "foundation";
  const packageLabel =
    (plan && plan.packageLabel) ||
    (BLESSBOARD_PACKAGES[packageCode] && BLESSBOARD_PACKAGES[packageCode].label) ||
    "Foundation";
  const required = requiredPackageForEntitlement(feature.entitlementKey);
  const accountPath = feature.portal === "hq" ? "/hq/account#package" : "/branch/account#package";
  const entitlements = entitlementSourceForPlan(plan);

  if (plan && entitlementsAllow(entitlements, feature.entitlementKey)) {
    const actualValue = readEntitlementPath(entitlements, feature.entitlementKey);
    if (
      feature.requiredEntitlementValue != null &&
      String(actualValue) !== String(feature.requiredEntitlementValue)
    ) {
      /* fall through to upgrade shell */
    } else {
      return {
        state: "available",
        feature,
        packageCode,
        packageLabel,
        requiredPackageCode: required.code,
        requiredPackageLabel: required.label,
        entitlementKey: feature.entitlementKey,
        accountPath,
      };
    }
  }

  if (feature.lockedUi === "hidden") {
    return {
      state: "hidden",
      feature,
      packageCode,
      packageLabel,
      requiredPackageCode: required.code,
      requiredPackageLabel: required.label,
      entitlementKey: feature.entitlementKey,
      accountPath,
    };
  }

  return {
    state: "upgrade",
    feature,
    packageCode,
    packageLabel,
    requiredPackageCode: required.code,
    requiredPackageLabel: required.label,
    entitlementKey: feature.entitlementKey,
    accountPath,
  };
}

/**
 * Nav items that should appear (available or upgrade). Hidden omitted.
 * @param {object | null} plan
 * @param {FeaturePortal} portal
 */
function listNavFeatureGates(plan, portal) {
  return PACKAGE_FEATURES.filter((f) => f.portal === portal && f.showInNav !== false)
    .map((f) => {
      const ui = resolveFeatureUi(plan, f);
      if (ui.state === "hidden") return null;
      return {
        id: f.id,
        navKey: f.navKey || f.id,
        label: f.navLabel || f.name,
        path: f.path,
        state: ui.state,
        entitlementKey: f.entitlementKey,
      };
    })
    .filter(Boolean);
}

function getFeatureById(id) {
  return FEATURES_BY_ID[id] || null;
}

function getFeatureByPath(path) {
  return FEATURES_BY_PATH[path] || null;
}

module.exports = {
  PACKAGE_FEATURES,
  FEATURES_BY_ID,
  requiredPackageForEntitlement,
  resolveFeatureUi,
  listNavFeatureGates,
  getFeatureById,
  getFeatureByPath,
};
