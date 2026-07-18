"use strict";

/**
 * BlessBoard commercial package catalogue (Foundation / Growth / Network).
 *
 * Source of truth for *new* entitlement resolution via churchEntitlementService.
 * Member/admin seats are enforced in churchSeatQuotaService:
 *   - members.max_active → verified church_members
 *   - admins.max → active church_hq_admins + church_branch_admins + church_ministry_leaders
 *
 * Active-branch prices live in blessBoardBillingCatalogue.js (price book).
 *
 * Does not enforce limits itself; does not replace legacy free/standard/pro helpers in churchPlans.js.
 *
 * Safe fallback: missing / unknown organization plan_code → foundation
 * (see resolvePackageFromPlanCode).
 */

const PACKAGE_CODES = ["foundation", "growth", "network"];

/** Sentinel for unlimited numeric limits (checkQuota treats as non-capped). */
const UNLIMITED = Number.POSITIVE_INFINITY;

/** Sentinel string for fair-use numeric limits (not a hard cap in Phase 1). */
const FAIR_USE = "fair_use";

/** 1 GiB in bytes — used only to express storage commercial units. */
const BYTES_PER_GIB = 1024 * 1024 * 1024;

/**
 * Named commercial capacity (keep in sync with BLESSBOARD_PACKAGES below —
 * packages are built from these; do not restate the numbers elsewhere).
 */
const FOUNDATION_ACTIVE_BRANCHES = 1;
const FOUNDATION_ACTIVE_MEMBERS = 250;
const FOUNDATION_ADMIN_ACCOUNTS = 10;
const FOUNDATION_STORAGE_BYTES = 2 * BYTES_PER_GIB;
const FOUNDATION_EXTERNAL_EMAILS_MONTHLY = 500;
const FOUNDATION_SCHEDULED_REPORTS_MONTHLY = 0;
const FOUNDATION_REPORT_EXPORT_MAX_ROWS = 500;

const GROWTH_STORAGE_BYTES_BASE = 10 * BYTES_PER_GIB;
const GROWTH_STORAGE_BYTES_PER_ACTIVE_BRANCH = 2 * BYTES_PER_GIB;
const GROWTH_EXTERNAL_EMAILS_MONTHLY_BASE = 5000;
const GROWTH_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH = 1000;
const GROWTH_SCHEDULED_REPORTS_MONTHLY = 20;
const GROWTH_REPORT_EXPORT_MAX_ROWS = 5000;

const NETWORK_STORAGE_BYTES_BASE = 20 * BYTES_PER_GIB;
const NETWORK_STORAGE_BYTES_PER_ACTIVE_BRANCH = 4 * BYTES_PER_GIB;
const NETWORK_EXTERNAL_EMAILS_MONTHLY_BASE = 15000;
const NETWORK_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH = 3000;
const NETWORK_SCHEDULED_REPORTS_MONTHLY = 50;
const NETWORK_REPORT_EXPORT_MAX_ROWS = 20000;
const NETWORK_MAILBOXES_PER_BRANCH = 5;

/** Default Growth trial length (days). Not a paid conversion. */
const DEFAULT_GROWTH_TRIAL_DURATION_DAYS = 30;

const LEGACY_PLAN_TO_PACKAGE = {
  free: "foundation",
  standard: "growth",
  pro: "growth",
  professional: "network",
  partner: "network",
  foundation: "foundation",
  growth: "growth",
  network: "network",
};

/**
 * @typedef {object} PackageDefinition
 * @property {string} code
 * @property {string} label
 * @property {object} entitlements
 */

/** @type {Record<string, PackageDefinition>} */
const BLESSBOARD_PACKAGES = {
  foundation: {
    code: "foundation",
    label: "Foundation",
    entitlements: {
      branches: { max_active: FOUNDATION_ACTIVE_BRANCHES },
      members: { max_active: FOUNDATION_ACTIVE_MEMBERS },
      admins: { max: FOUNDATION_ADMIN_ACCOUNTS },
      storage: { bytes: FOUNDATION_STORAGE_BYTES },
      external_emails: { monthly: FOUNDATION_EXTERNAL_EMAILS_MONTHLY },
      attendance: { qr: true, offline: false, custom_rules: false },
      care: { automation: "basic" },
      surveys: { custom: "limited" },
      appointments: { calendar: false },
      groups: { management: false },
      discipleship: { pathways: false },
      volunteers: { scheduling: false },
      events: { advanced_logistics: false },
      broadcasts: { scheduled: false },
      reports: {
        basic: true,
        export_max_rows: FOUNDATION_REPORT_EXPORT_MAX_ROWS,
        scheduled: false,
        scheduled_monthly: FOUNDATION_SCHEDULED_REPORTS_MONTHLY,
        cross_branch: false,
        custom_builder: false,
        api: false,
      },
      domains: { custom: false },
      email: { mailboxes_per_branch: 0 },
      integrations: { webhooks: false, public_api: false },
      network: { executive_hierarchy: false, priority_support: false },
      support: { level: "basic" },
    },
  },
  growth: {
    code: "growth",
    label: "Growth",
    entitlements: {
      branches: { max_active: UNLIMITED },
      members: { max_active: FAIR_USE },
      admins: { max: FAIR_USE },
      storage: {
        bytes_base: GROWTH_STORAGE_BYTES_BASE,
        bytes_per_active_branch: GROWTH_STORAGE_BYTES_PER_ACTIVE_BRANCH,
      },
      external_emails: {
        monthly_base: GROWTH_EXTERNAL_EMAILS_MONTHLY_BASE,
        monthly_per_active_branch: GROWTH_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH,
      },
      attendance: { qr: true, offline: true, custom_rules: true },
      care: { automation: "advanced" },
      surveys: { custom: true },
      appointments: { calendar: true },
      groups: { management: true },
      discipleship: { pathways: true },
      volunteers: { scheduling: true },
      events: { advanced_logistics: true },
      broadcasts: { scheduled: true },
      reports: {
        basic: true,
        export_max_rows: GROWTH_REPORT_EXPORT_MAX_ROWS,
        scheduled: true,
        scheduled_monthly: GROWTH_SCHEDULED_REPORTS_MONTHLY,
        cross_branch: true,
        custom_builder: false,
        api: false,
      },
      domains: { custom: false },
      email: { mailboxes_per_branch: 0 },
      integrations: { webhooks: false, public_api: false },
      network: { executive_hierarchy: false, priority_support: false },
      support: { level: "standard" },
    },
  },
  network: {
    code: "network",
    label: "Network",
    entitlements: {
      branches: { max_active: UNLIMITED },
      members: { max_active: FAIR_USE },
      admins: { max: FAIR_USE },
      storage: {
        bytes_base: NETWORK_STORAGE_BYTES_BASE,
        bytes_per_active_branch: NETWORK_STORAGE_BYTES_PER_ACTIVE_BRANCH,
      },
      external_emails: {
        monthly_base: NETWORK_EXTERNAL_EMAILS_MONTHLY_BASE,
        monthly_per_active_branch: NETWORK_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH,
      },
      attendance: { qr: true, offline: true, custom_rules: true },
      care: { automation: "advanced" },
      surveys: { custom: true },
      appointments: { calendar: true },
      groups: { management: true },
      discipleship: { pathways: true },
      volunteers: { scheduling: true },
      events: { advanced_logistics: true },
      broadcasts: { scheduled: true },
      reports: {
        basic: true,
        export_max_rows: NETWORK_REPORT_EXPORT_MAX_ROWS,
        scheduled: true,
        scheduled_monthly: NETWORK_SCHEDULED_REPORTS_MONTHLY,
        cross_branch: true,
        custom_builder: true,
        api: true,
      },
      domains: { custom: true },
      email: { mailboxes_per_branch: NETWORK_MAILBOXES_PER_BRANCH },
      integrations: { webhooks: true, public_api: true },
      network: { executive_hierarchy: true, priority_support: true },
      support: { level: "priority" },
    },
  },
};

const DEFAULT_PACKAGE_CODE = "foundation";

/**
 * Snapshot of commercial numbers for display/docs/tests (not alternate limits).
 * Price-per-branch is in blessBoardBillingCatalogue.
 */
function getCommercialCapacitySnapshot() {
  return {
    foundation: {
      activeBranches: FOUNDATION_ACTIVE_BRANCHES,
      activeMembers: FOUNDATION_ACTIVE_MEMBERS,
      adminAccounts: FOUNDATION_ADMIN_ACCOUNTS,
      storageBytes: FOUNDATION_STORAGE_BYTES,
      externalEmailsMonthly: FOUNDATION_EXTERNAL_EMAILS_MONTHLY,
      scheduledReportsMonthly: FOUNDATION_SCHEDULED_REPORTS_MONTHLY,
    },
    growth: {
      storageBytesBase: GROWTH_STORAGE_BYTES_BASE,
      storageBytesPerActiveBranch: GROWTH_STORAGE_BYTES_PER_ACTIVE_BRANCH,
      externalEmailsMonthlyBase: GROWTH_EXTERNAL_EMAILS_MONTHLY_BASE,
      externalEmailsMonthlyPerActiveBranch: GROWTH_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH,
      scheduledReportsMonthly: GROWTH_SCHEDULED_REPORTS_MONTHLY,
      defaultTrialDurationDays: DEFAULT_GROWTH_TRIAL_DURATION_DAYS,
    },
    network: {
      storageBytesBase: NETWORK_STORAGE_BYTES_BASE,
      storageBytesPerActiveBranch: NETWORK_STORAGE_BYTES_PER_ACTIVE_BRANCH,
      externalEmailsMonthlyBase: NETWORK_EXTERNAL_EMAILS_MONTHLY_BASE,
      externalEmailsMonthlyPerActiveBranch: NETWORK_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH,
      scheduledReportsMonthly: NETWORK_SCHEDULED_REPORTS_MONTHLY,
      mailboxesPerBranch: NETWORK_MAILBOXES_PER_BRANCH,
    },
  };
}

/**
 * @param {string | null | undefined} planCode - Raw church_organizations.plan_code
 * @returns {{
 *   packageCode: string,
 *   packageDefinition: PackageDefinition,
 *   storedPlanCode: string | null,
 *   entitlementSource: 'direct' | 'legacy_alias' | 'fallback_default',
 *   usedFallback: boolean,
 *   fallbackReason: string | null,
 * }}
 */
function resolvePackageFromPlanCode(planCode) {
  const raw = planCode == null ? "" : String(planCode).trim().toLowerCase();
  if (!raw) {
    const packageDefinition = BLESSBOARD_PACKAGES[DEFAULT_PACKAGE_CODE];
    return {
      packageCode: DEFAULT_PACKAGE_CODE,
      packageDefinition,
      storedPlanCode: planCode == null ? null : String(planCode),
      entitlementSource: "fallback_default",
      usedFallback: true,
      fallbackReason: "Missing plan_code; defaulting to Foundation.",
    };
  }

  if (PACKAGE_CODES.includes(raw) && BLESSBOARD_PACKAGES[raw]) {
    return {
      packageCode: raw,
      packageDefinition: BLESSBOARD_PACKAGES[raw],
      storedPlanCode: raw,
      entitlementSource: "direct",
      usedFallback: false,
      fallbackReason: null,
    };
  }

  const mapped = LEGACY_PLAN_TO_PACKAGE[raw];
  if (mapped && BLESSBOARD_PACKAGES[mapped]) {
    return {
      packageCode: mapped,
      packageDefinition: BLESSBOARD_PACKAGES[mapped],
      storedPlanCode: raw,
      entitlementSource: "legacy_alias",
      usedFallback: false,
      fallbackReason: null,
    };
  }

  return {
    packageCode: DEFAULT_PACKAGE_CODE,
    packageDefinition: BLESSBOARD_PACKAGES[DEFAULT_PACKAGE_CODE],
    storedPlanCode: raw,
    entitlementSource: "fallback_default",
    usedFallback: true,
    fallbackReason: `Unknown plan_code "${raw}"; defaulting to Foundation.`,
  };
}

/**
 * @param {string} packageCode
 * @returns {PackageDefinition}
 */
function getPackageDefinition(packageCode) {
  const code = String(packageCode || "")
    .trim()
    .toLowerCase();
  return BLESSBOARD_PACKAGES[code] || BLESSBOARD_PACKAGES[DEFAULT_PACKAGE_CODE];
}

/**
 * Read a dotted entitlement path from a package entitlements object.
 * @param {object} entitlements
 * @param {string} key e.g. "attendance.qr" or "branches.max_active"
 */
function readEntitlementPath(entitlements, key) {
  const parts = String(key || "")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return undefined;
  let cur = entitlements;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

function isUnlimitedLimit(value) {
  return value === UNLIMITED || value === Number.POSITIVE_INFINITY;
}

function isFairUseLimit(value) {
  return value === FAIR_USE || value === "fair_use";
}

module.exports = {
  PACKAGE_CODES,
  UNLIMITED,
  FAIR_USE,
  BYTES_PER_GIB,
  FOUNDATION_ACTIVE_BRANCHES,
  FOUNDATION_ACTIVE_MEMBERS,
  FOUNDATION_ADMIN_ACCOUNTS,
  FOUNDATION_STORAGE_BYTES,
  FOUNDATION_EXTERNAL_EMAILS_MONTHLY,
  FOUNDATION_SCHEDULED_REPORTS_MONTHLY,
  FOUNDATION_REPORT_EXPORT_MAX_ROWS,
  GROWTH_STORAGE_BYTES_BASE,
  GROWTH_STORAGE_BYTES_PER_ACTIVE_BRANCH,
  GROWTH_EXTERNAL_EMAILS_MONTHLY_BASE,
  GROWTH_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH,
  GROWTH_SCHEDULED_REPORTS_MONTHLY,
  GROWTH_REPORT_EXPORT_MAX_ROWS,
  NETWORK_STORAGE_BYTES_BASE,
  NETWORK_STORAGE_BYTES_PER_ACTIVE_BRANCH,
  NETWORK_EXTERNAL_EMAILS_MONTHLY_BASE,
  NETWORK_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH,
  NETWORK_SCHEDULED_REPORTS_MONTHLY,
  NETWORK_REPORT_EXPORT_MAX_ROWS,
  NETWORK_MAILBOXES_PER_BRANCH,
  DEFAULT_GROWTH_TRIAL_DURATION_DAYS,
  LEGACY_PLAN_TO_PACKAGE,
  BLESSBOARD_PACKAGES,
  DEFAULT_PACKAGE_CODE,
  getCommercialCapacitySnapshot,
  resolvePackageFromPlanCode,
  getPackageDefinition,
  readEntitlementPath,
  isUnlimitedLimit,
  isFairUseLimit,
};
