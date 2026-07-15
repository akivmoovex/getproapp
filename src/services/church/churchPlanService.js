"use strict";

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const {
  getChurchPlan,
  getPlanDisplay,
  getPlanLimit,
  isFeatureEnabled,
  featureRowsForPlan,
  buildUsageWarnings,
  getLockedFeatureLabels,
  getPremiumFeatureNotice,
  canCreateAdditionalBranch,
  formatLimitValue,
  normalizePlanCode,
} = require("../../church/churchPlans");

async function getOrganizationUsageSummary(pool, organizationId) {
  const usage = await organizationsRepo.getOrganizationUsageCounts(pool, organizationId);
  return {
    branches_count: usage.branches_count,
    active_members_count: usage.active_members_count,
    total_members_count: usage.total_members_count,
  };
}

async function getOrganizationPlanSummary(pool, organizationId) {
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  if (!org) return null;
  const planCode = normalizePlanCode(org.plan_code);
  const plan = getChurchPlan(planCode);
  const usage = await getOrganizationUsageSummary(pool, organizationId);
  const warnings = buildUsageWarnings(planCode, usage);
  return {
    organization: org,
    planCode,
    planDisplay: getPlanDisplay(planCode),
    planStatus: org.plan_status || "active",
    planNotes: org.plan_notes || "",
    planStartedAt: org.plan_started_at || null,
    limits: plan.limits,
    features: plan.features,
    featureRows: featureRowsForPlan(planCode),
    usage,
    warnings,
    lockedFeatures: getLockedFeatureLabels(planCode),
    branchesDisplay: `${usage.branches_count}/${formatLimitValue(plan.limits.max_branches)}`,
    membersDisplay: `${usage.active_members_count}/${formatLimitValue(plan.limits.max_members)}`,
    storageDisplay: `0 MB / ${formatLimitValue(plan.limits.storage_limit_mb)} MB (placeholder)`,
    branchLimitReached: !canCreateAdditionalBranch(planCode, usage.branches_count).allowed,
    memberNearLimit: warnings.some((w) => w.code === "member_near_limit"),
    memberAtLimit: warnings.some((w) => w.code === "member_limit"),
  };
}

async function getPlanUsageSummary(pool, organizationId) {
  const summary = await getOrganizationPlanSummary(pool, organizationId);
  if (!summary) return null;
  return {
    planCode: summary.planCode,
    planDisplay: summary.planDisplay,
    usage: summary.usage,
    limits: summary.limits,
    warnings: summary.warnings,
    lockedFeatures: summary.lockedFeatures,
  };
}

function planContextForOrganization(org, usage) {
  const planCode = normalizePlanCode(org && org.plan_code);
  const plan = getChurchPlan(planCode);
  const usageSummary = usage || {
    branches_count: 0,
    active_members_count: 0,
    total_members_count: 0,
  };
  const warnings = buildUsageWarnings(planCode, usageSummary);
  return {
    planCode,
    planDisplay: getPlanDisplay(planCode),
    planStatus: (org && org.plan_status) || "active",
    limits: plan.limits,
    usage: usageSummary,
    warnings,
    lockedFeatures: getLockedFeatureLabels(planCode),
    branchesDisplay: `${usageSummary.branches_count}/${formatLimitValue(plan.limits.max_branches)}`,
    membersDisplay: `${usageSummary.active_members_count}/${formatLimitValue(plan.limits.max_members)}`,
    memberNearLimit: warnings.some((w) => w.code === "member_near_limit"),
    memberAtLimit: warnings.some((w) => w.code === "member_limit"),
    hqBroadcastsEnabled: isFeatureEnabled(planCode, "hq_broadcasts"),
    consolidatedAnalyticsEnabled: isFeatureEnabled(planCode, "consolidated_analytics"),
    premiumBroadcastNotice: getPremiumFeatureNotice(planCode, "hq_broadcasts"),
    premiumAnalyticsNotice: getPremiumFeatureNotice(planCode, "consolidated_analytics"),
  };
}

async function loadPlanContextForOrganization(pool, organizationId) {
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  if (!org) return null;
  const usage = await getOrganizationUsageSummary(pool, organizationId);
  const ctx = planContextForOrganization(org, usage);
  try {
    const seatQuota = require("./churchSeatQuotaService");
    const seatUsage = await seatQuota.getOrganisationSeatUsage(pool, organizationId);
    if (seatUsage) {
      ctx.seatUsage = seatUsage;
      ctx.membersDisplay = seatUsage.membersDisplay;
      ctx.adminsDisplay = seatUsage.adminsDisplay;
      if (seatUsage.memberAtLimit) {
        ctx.warnings = (ctx.warnings || []).concat([
          {
            level: "limit",
            code: "package_member_limit",
            message: seatQuota.FOUNDATION_MEMBER_LIMIT_ERROR,
          },
        ]);
      }
      if (seatUsage.adminAtLimit) {
        ctx.warnings = (ctx.warnings || []).concat([
          {
            level: "limit",
            code: "package_admin_limit",
            message: seatQuota.FOUNDATION_ADMIN_LIMIT_ERROR,
          },
        ]);
      }
    }
  } catch {
    /* seat usage is optional for dashboard render */
  }
  try {
    const churchPackageUsageService = require("./churchPackageUsageService");
    // Cached counters only — do not reconcile storage on every dashboard hit.
    const packageUsage = await churchPackageUsageService.getOrganisationUsageSnapshot(
      pool,
      organizationId,
      { reconcileStorage: false }
    );
    if (packageUsage) {
      ctx.packageUsage = packageUsage;
      ctx.storageDisplay = packageUsage.meters.storage.display;
      for (const w of packageUsage.warnings || []) {
        ctx.warnings = (ctx.warnings || []).concat([
          {
            level: "warn",
            code: `package_usage_${w.key}`,
            message: w.message,
          },
        ]);
      }
      for (const b of packageUsage.blocked || []) {
        ctx.warnings = (ctx.warnings || []).concat([
          {
            level: "limit",
            code: `package_blocked_${b.key}`,
            message: b.message,
          },
        ]);
      }
    }
  } catch {
    /* package usage optional */
  }
  return ctx;
}

module.exports = {
  getOrganizationUsageSummary,
  getOrganizationPlanSummary,
  getPlanUsageSummary,
  planContextForOrganization,
  loadPlanContextForOrganization,
  getPlanLimit,
  isFeatureEnabled,
  getPremiumFeatureNotice,
  canCreateAdditionalBranch,
};
