"use strict";

/**
 * Controlled pilot feature-flag catalogue.
 * Flags layer ON TOP of package entitlements — both must allow a feature.
 *
 * Safe fallback when DB rows are missing: catalogue.defaultEnabled
 * (true for already-shipped Growth surfaces so existing tenants are not broken;
 * set defaultEnabled false for incomplete / high-risk rollouts).
 */

/** @typedef {'entitlement' | 'growth_package' | 'foundation_package' | 'any_active_org' | 'platform_action'} PilotEntitlementMode */

/**
 * @typedef {object} PilotFlagDefinition
 * @property {string} key
 * @property {string} label
 * @property {string} description
 * @property {string | null} entitlementKey - dotted catalogue path when mode=entitlement
 * @property {string | null} packageFeatureId - maps to blessBoardPackageFeatures id when present
 * @property {PilotEntitlementMode} entitlementMode
 * @property {boolean} defaultEnabled - used when platform + tenant rows are missing
 */

/** @type {PilotFlagDefinition[]} */
const PILOT_FEATURE_FLAGS = Object.freeze([
  {
    key: "attendance_offline",
    label: "Offline attendance",
    description: "Capture and sync attendance when devices are offline.",
    entitlementKey: "attendance.offline",
    packageFeatureId: "attendance_offline",
    entitlementMode: "entitlement",
    defaultEnabled: true,
  },
  {
    key: "reports_scheduled",
    label: "Scheduled reports",
    description: "Automated delivery of branch reports on a schedule.",
    entitlementKey: "reports.scheduled",
    packageFeatureId: "reports_scheduled",
    entitlementMode: "entitlement",
    defaultEnabled: true,
  },
  {
    key: "broadcasts_scheduled",
    label: "Scheduled broadcasts",
    description: "Future-dated HQ broadcast publication and delivery jobs.",
    entitlementKey: "broadcasts.scheduled",
    packageFeatureId: "broadcasts_scheduled",
    entitlementMode: "entitlement",
    defaultEnabled: true,
  },
  {
    key: "growth_trial",
    label: "Growth trial",
    description: "Platform-granted Growth trial workflow and expiry jobs.",
    entitlementKey: null,
    packageFeatureId: null,
    entitlementMode: "platform_action",
    defaultEnabled: true,
  },
  {
    key: "reports_cross_branch",
    label: "Cross-branch dashboard",
    description: "HQ cross-branch KPI comparison.",
    entitlementKey: "reports.cross_branch",
    packageFeatureId: "reports_cross_branch",
    entitlementMode: "entitlement",
    defaultEnabled: true,
  },
  {
    key: "member_import_advanced",
    label: "Advanced member import",
    description: "CSV member import preview, commit, and reverse.",
    entitlementKey: null,
    packageFeatureId: null,
    entitlementMode: "any_active_org",
    defaultEnabled: true,
  },
  {
    key: "dormancy_automation",
    label: "Dormancy automation",
    description: "Foundation inactivity warnings and dormancy jobs.",
    entitlementKey: null,
    packageFeatureId: null,
    entitlementMode: "foundation_package",
    defaultEnabled: true,
  },
  {
    key: "billing_snapshot",
    label: "Billing snapshot generation",
    description: "Growth draft invoice / billable branch snapshots.",
    entitlementKey: null,
    packageFeatureId: null,
    entitlementMode: "growth_package",
    defaultEnabled: true,
  },
]);

const PILOT_FLAGS_BY_KEY = Object.freeze(
  Object.fromEntries(PILOT_FEATURE_FLAGS.map((f) => [f.key, f]))
);

/** Map package feature UI id → pilot flag key */
const PACKAGE_FEATURE_TO_PILOT_FLAG = Object.freeze(
  Object.fromEntries(
    PILOT_FEATURE_FLAGS.filter((f) => f.packageFeatureId).map((f) => [f.packageFeatureId, f.key])
  )
);

function getPilotFlagDefinition(flagKey) {
  return PILOT_FLAGS_BY_KEY[String(flagKey || "").trim()] || null;
}

function listPilotFlagDefinitions() {
  return PILOT_FEATURE_FLAGS.slice();
}

module.exports = {
  PILOT_FEATURE_FLAGS,
  PILOT_FLAGS_BY_KEY,
  PACKAGE_FEATURE_TO_PILOT_FLAG,
  getPilotFlagDefinition,
  listPilotFlagDefinitions,
};
