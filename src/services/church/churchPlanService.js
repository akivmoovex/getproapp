"use strict";

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const { getOrganisationPlan } = require("./churchEntitlementService");
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

function usageSummaryFromPackageSnapshot(packageUsage) {
  if (!packageUsage) {
    return {
      branches_count: 0,
      active_branches_count: 0,
      active_members_count: 0,
      total_members_count: 0,
    };
  }
  return {
    branches_count: packageUsage.totalBranches ?? packageUsage.activeBranches ?? 0,
    active_branches_count: packageUsage.activeBranches ?? 0,
    active_members_count: packageUsage.activeMembers ?? 0,
    total_members_count: packageUsage.totalMembers ?? packageUsage.activeMembers ?? 0,
  };
}

function seatUsageFromPackageSnapshot(packageUsage) {
  if (!packageUsage || !packageUsage.meters) return null;
  const seatQuota = require("./churchSeatQuotaService");
  const membersMeter = packageUsage.meters.members || {};
  const adminsMeter = packageUsage.meters.admins || {};
  const memberLimit = membersMeter.limit;
  const adminLimit = adminsMeter.limit;
  const activeMembers = packageUsage.activeMembers ?? 0;
  const privileged = packageUsage.privilegedAccounts ?? 0;
  return {
    organizationId: packageUsage.organizationId,
    packageCode: packageUsage.packageCode,
    packageLabel: packageUsage.packageLabel,
    activeMembers,
    memberLimit,
    membersDisplay: membersMeter.display,
    memberAtLimit:
      membersMeter.state === "blocked" ||
      membersMeter.status === "at_limit" ||
      membersMeter.status === "exceeded",
    privilegedAccounts: privileged,
    privilegedBreakdown: packageUsage.privilegedBreakdown,
    adminLimit,
    adminsDisplay: adminsMeter.display,
    adminAtLimit:
      adminsMeter.state === "blocked" ||
      adminsMeter.status === "at_limit" ||
      adminsMeter.status === "exceeded",
    countedPrivilegedRoles: seatQuota.COUNTED_PRIVILEGED_ROLES,
    activeMemberDefinition:
      "verified members (can sign in). pending=visitor/applicant; suspended=inactive exclusion.",
  };
}

function mergePackageWarnings(ctx, packageUsage, seatUsage) {
  if (seatUsage && seatUsage.memberAtLimit) {
    const seatQuota = require("./churchSeatQuotaService");
    ctx.warnings = (ctx.warnings || []).concat([
      {
        level: "limit",
        code: "package_member_limit",
        message: seatQuota.FOUNDATION_MEMBER_LIMIT_ERROR,
      },
    ]);
  }
  if (seatUsage && seatUsage.adminAtLimit) {
    const seatQuota = require("./churchSeatQuotaService");
    ctx.warnings = (ctx.warnings || []).concat([
      {
        level: "limit",
        code: "package_admin_limit",
        message: seatQuota.FOUNDATION_ADMIN_LIMIT_ERROR,
      },
    ]);
  }
  if (!packageUsage) return ctx;
  ctx.packageUsage = packageUsage;
  ctx.storageDisplay = packageUsage.meters.storage.display;
  ctx.quotaWarnings = packageUsage.quotaWarnings || [];
  for (const w of packageUsage.quotaWarnings || []) {
    ctx.warnings = (ctx.warnings || []).concat([
      {
        level: w.band >= 100 ? "limit" : w.band >= 90 ? "warning" : "warn",
        code: `package_quota_${w.meterKey}_${w.band}`,
        message: [w.message, w.existingDataNote, w.guidance].filter(Boolean).join(" "),
        quotaWarning: w,
      },
    ]);
  }
  return ctx;
}

async function getOrganizationUsageSummary(pool, organizationId, opts = {}) {
  if (opts.usageSnapshot) {
    return usageSummaryFromPackageSnapshot(opts.usageSnapshot);
  }
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

function organizationRowForPlanContext(plan, organization) {
  if (organization) return organization;
  return {
    id: plan.organizationId,
    name: plan.organizationName,
    slug: plan.organizationSlug,
    status: plan.organizationStatus,
    plan_code: plan.storedPlanCode,
    plan_status: plan.planStatus,
    plan_notes: plan.planNotes,
    plan_started_at: plan.planStartedAt,
  };
}

function cachePlanContextOnRequest(req, organizationId, ctx, plan) {
  if (!req) return;
  req.churchPlanContext = ctx;
  req._churchPlanContextOrgId = Number(organizationId);
  req.churchPackagePlan = plan;
}

/**
 * Load dashboard / gate plan context with one entitlement resolve and one usage snapshot per request.
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ req?: object, plan?: object, usageSnapshot?: object, trialState?: object, at?: Date, reconcileStorage?: boolean, organization?: object }} [opts]
 */
async function loadPlanContextForOrganization(pool, organizationId, opts = {}) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return null;

  const req = opts.req || null;
  if (
    req &&
    req.churchPlanContext &&
    Number(req._churchPlanContextOrgId) === orgId &&
    !opts.usageSnapshot &&
    !opts.plan
  ) {
    return req.churchPlanContext;
  }

  let organization = opts.organization || null;
  if (!organization) {
    organization = await organizationsRepo.findOrganizationById(pool, orgId);
  }

  const churchGrowthTrialService = require("./churchGrowthTrialService");
  const trialState =
    opts.trialState ||
    (await churchGrowthTrialService.resolveGrowthTrialForEntitlement(pool, orgId, {
      at: opts.at,
    }));

  let plan = opts.plan || null;
  if (
    req &&
    req.churchPackagePlan &&
    Number(req.churchPackagePlan.organizationId) === orgId &&
    !opts.plan
  ) {
    plan = req.churchPackagePlan;
  }
  if (!plan) {
    plan = await getOrganisationPlan(pool, orgId, {
      at: opts.at,
      organization,
      trialState,
    });
  }
  if (!plan) return null;

  const org = organizationRowForPlanContext(plan, organization);
  const churchPackageUsageService = require("./churchPackageUsageService");
  const packageUsage =
    opts.usageSnapshot ||
    (await churchPackageUsageService.getOrganisationUsageSnapshot(pool, orgId, {
      reconcileStorage: opts.reconcileStorage === true,
      at: opts.at,
      plan,
      organization,
      trialState,
    }));

  const usage = usageSummaryFromPackageSnapshot(packageUsage);
  const ctx = planContextForOrganization(org, usage);
  ctx.packagePlan = plan;

  const seatUsage = seatUsageFromPackageSnapshot(packageUsage);
  if (seatUsage) {
    ctx.seatUsage = seatUsage;
    ctx.membersDisplay = seatUsage.membersDisplay;
    ctx.adminsDisplay = seatUsage.adminsDisplay;
  }
  mergePackageWarnings(ctx, packageUsage, seatUsage);

  cachePlanContextOnRequest(req, orgId, ctx, plan);
  return ctx;
}

module.exports = {
  getOrganizationUsageSummary,
  getOrganizationPlanSummary,
  getPlanUsageSummary,
  planContextForOrganization,
  loadPlanContextForOrganization,
  usageSummaryFromPackageSnapshot,
  seatUsageFromPackageSnapshot,
  getPlanLimit,
  isFeatureEnabled,
  getPremiumFeatureNotice,
  canCreateAdditionalBranch,
};
