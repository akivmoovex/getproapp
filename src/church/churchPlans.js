"use strict";

/** Legacy plan codes (behaviour unchanged). Package codes foundation/growth are assignable aliases. */
const PLAN_CODES = ["free", "standard", "pro", "foundation", "growth"];

const LEGACY_PLAN_CODES = ["free", "standard", "pro"];

const UNLIMITED = 99999;

const CHURCH_PLANS = {
  free: {
    code: "free",
    label: "Free",
    description: "Core church tools for a single branch and up to 200 verified members.",
    limits: {
      max_branches: 1,
      max_members: 200,
      storage_limit_mb: 100,
    },
    features: {
      public_website: true,
      member_portal: true,
      branch_admin: true,
      attendance: true,
      giving_info: true,
      monthly_reports: true,
      hq_dashboard: true,
      hq_dashboard_mode: "limited",
      hq_broadcasts: false,
      consolidated_analytics: false,
      custom_domain: false,
    },
  },
  standard: {
    code: "standard",
    label: "Standard",
    description: "Multi-branch growth with HQ broadcasts and consolidated analytics.",
    limits: {
      max_branches: 5,
      max_members: 1000,
      storage_limit_mb: 1000,
    },
    features: {
      public_website: true,
      member_portal: true,
      branch_admin: true,
      attendance: true,
      giving_info: true,
      monthly_reports: true,
      hq_dashboard: true,
      hq_dashboard_mode: "full",
      hq_broadcasts: true,
      consolidated_analytics: true,
      custom_domain: false,
    },
  },
  pro: {
    code: "pro",
    label: "Pro",
    description: "Full organization scale with premium HQ tools (custom domains planned).",
    limits: {
      max_branches: 999,
      max_members: UNLIMITED,
      storage_limit_mb: 5000,
    },
    features: {
      public_website: true,
      member_portal: true,
      branch_admin: true,
      attendance: true,
      giving_info: true,
      monthly_reports: true,
      hq_dashboard: true,
      hq_dashboard_mode: "full",
      hq_broadcasts: true,
      consolidated_analytics: true,
      custom_domain: false,
    },
  },
};

const FEATURE_LABELS = {
  public_website: "Public website",
  member_portal: "Member portal",
  branch_admin: "Branch admin",
  attendance: "Attendance",
  giving_info: "Giving information",
  monthly_reports: "Monthly reports",
  hq_dashboard: "HQ dashboard",
  hq_broadcasts: "HQ broadcasts",
  consolidated_analytics: "Consolidated analytics",
  custom_domain: "Custom domain",
};

const PREMIUM_FEATURE_KEYS = ["hq_broadcasts", "consolidated_analytics", "custom_domain"];

const MEMBER_LIMIT_WARNING_THRESHOLD = 180;

function normalizePlanCode(planCode) {
  const code = String(planCode || "free")
    .trim()
    .toLowerCase();
  if (CHURCH_PLANS[code]) return code;
  // Stored package codes remain stored; legacy helpers below alias behaviour without changing enforcement yet.
  if (code === "foundation" || code === "growth") return code;
  return "free";
}

/**
 * Legacy plan config used by existing limit/feature helpers.
 * foundation → free behaviour; growth → standard behaviour (no enforcement change in Phase 1).
 */
function getChurchPlan(planCode) {
  const code = normalizePlanCode(planCode);
  if (CHURCH_PLANS[code]) return CHURCH_PLANS[code];
  if (code === "foundation") {
    return { ...CHURCH_PLANS.free, code: "foundation", label: "Foundation" };
  }
  if (code === "growth") {
    return { ...CHURCH_PLANS.standard, code: "growth", label: "Growth" };
  }
  return CHURCH_PLANS.free;
}

function getPlanLimit(planCode, key) {
  const plan = getChurchPlan(planCode);
  return plan.limits[key];
}

function isFeatureEnabled(planCode, featureKey) {
  const plan = getChurchPlan(planCode);
  return !!plan.features[featureKey];
}

function getPlanDisplay(planCode) {
  const plan = getChurchPlan(planCode);
  return {
    code: plan.code,
    label: plan.label,
    description: plan.description,
  };
}

function formatLimitValue(value) {
  if (value == null) return "—";
  if (value >= UNLIMITED) return "Unlimited";
  return String(value);
}

function featureRowsForPlan(planCode) {
  const plan = getChurchPlan(planCode);
  return Object.keys(FEATURE_LABELS).map((key) => {
    const enabled = !!plan.features[key];
    const locked = PREMIUM_FEATURE_KEYS.includes(key) && !enabled;
    return {
      key,
      label: FEATURE_LABELS[key],
      enabled,
      locked,
      statusLabel: locked ? "Locked" : enabled ? "Enabled" : "Disabled",
    };
  });
}

function buildUsageWarnings(planCode, usage) {
  const plan = getChurchPlan(planCode);
  const warnings = [];
  const branchesUsed = Number(usage.branches_count || 0);
  const activeMembers = Number(usage.active_members_count || 0);
  const maxBranches = plan.limits.max_branches;
  const maxMembers = plan.limits.max_members;

  if (maxBranches != null && branchesUsed >= maxBranches) {
    warnings.push({
      level: "limit",
      code: "branch_limit",
      message: `Branch limit reached (${branchesUsed}/${maxBranches}). Upgrade to add more branches.`,
    });
  }

  if (maxMembers != null && maxMembers < UNLIMITED) {
    if (activeMembers >= maxMembers) {
      warnings.push({
        level: "limit",
        code: "member_limit",
        message: `Verified member limit reached (${activeMembers}/${maxMembers}). Upgrade for more capacity.`,
      });
    } else if (activeMembers >= MEMBER_LIMIT_WARNING_THRESHOLD && plan.code === "free") {
      warnings.push({
        level: "warning",
        code: "member_near_limit",
        message: `Approaching free plan member limit (${activeMembers}/${maxMembers}). Consider upgrading before reaching capacity.`,
      });
    }
  }

  return warnings;
}

function getLockedFeatureLabels(planCode) {
  return featureRowsForPlan(planCode)
    .filter((row) => row.locked)
    .map((row) => row.label);
}

function getPremiumFeatureNotice(planCode, featureKey) {
  if (isFeatureEnabled(planCode, featureKey)) return null;
  const label = FEATURE_LABELS[featureKey] || featureKey;
  return {
    featureKey,
    featureLabel: label,
    title: "Premium feature preview",
    message: `${label} is available as a premium preview on the ${getPlanDisplay(planCode).label} plan. Upgrade required in production; hard enforcement is deferred in this MVP.`,
  };
}

function canCreateAdditionalBranch(planCode, currentBranchCount) {
  const max = getPlanLimit(planCode, "max_branches");
  if (max == null) return { allowed: true };
  const used = Number(currentBranchCount || 0);
  if (used >= max) {
    return {
      allowed: false,
      reason: `Plan limit reached: ${used}/${max} branches. Upgrade to add more branches.`,
    };
  }
  return { allowed: true };
}

/** Async usage summary — requires a PG pool (see churchPlanService). */
function getPlanUsageSummary(pool, organizationId) {
  return require("../services/church/churchPlanService").getPlanUsageSummary(pool, organizationId);
}

module.exports = {
  PLAN_CODES,
  LEGACY_PLAN_CODES,
  UNLIMITED,
  CHURCH_PLANS,
  FEATURE_LABELS,
  PREMIUM_FEATURE_KEYS,
  MEMBER_LIMIT_WARNING_THRESHOLD,
  normalizePlanCode,
  getChurchPlan,
  getPlanLimit,
  isFeatureEnabled,
  getPlanDisplay,
  formatLimitValue,
  featureRowsForPlan,
  buildUsageWarnings,
  getLockedFeatureLabels,
  getPremiumFeatureNotice,
  canCreateAdditionalBranch,
  getPlanUsageSummary,
};
