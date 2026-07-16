"use strict";

const attendanceRulesRepo = require("../../db/pg/church/attendanceRulesRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { hasEntitlement } = require("./churchEntitlementService");

function assertCustomRulesEntitlement(plan) {
  if (!hasEntitlement(plan, "attendance.custom_rules")) {
    throw Object.assign(new Error("Configurable attendance rules require Growth."), {
      code: "PACKAGE_REQUIRED",
    });
  }
}

function assertOfflineEntitlement(plan) {
  if (!hasEntitlement(plan, "attendance.offline")) {
    throw Object.assign(new Error("Offline attendance requires Growth."), {
      code: "PACKAGE_REQUIRED",
    });
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} data
 */
async function saveBranchRules(pool, ctx, data) {
  return attendanceRulesRepo.upsertBranchRules(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    absence_threshold_weeks: data.absence_threshold_weeks,
    allow_multiple_services_per_day: data.allow_multiple_services_per_day,
    cross_branch_guest_enabled: data.cross_branch_guest_enabled,
    updated_by_admin_id: ctx.admin_id,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} data
 */
async function addMemberExemption(pool, ctx, data) {
  const member = await membersRepo.findMemberByIdForOrganization(
    pool,
    data.member_id,
    ctx.organization_id
  );
  if (!member) {
    throw Object.assign(new Error("Member not found in this organisation."), { code: "NOT_FOUND" });
  }
  return attendanceRulesRepo.createExemption(pool, {
    organization_id: ctx.organization_id,
    branch_id: member.branch_id,
    member_id: member.id,
    reason: data.reason,
    effective_from: data.effective_from,
    effective_to: data.effective_to,
    created_by_admin_id: ctx.admin_id,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} data
 */
async function authorizeCrossBranchGuest(pool, ctx, data) {
  const member = await membersRepo.findMemberByIdForOrganization(
    pool,
    data.member_id,
    ctx.organization_id
  );
  if (!member) {
    throw Object.assign(new Error("Member not found in this organisation."), { code: "NOT_FOUND" });
  }
  const guestBranch = await branchesRepo.findBranchByIdForPlatform(pool, data.guest_branch_id);
  if (!guestBranch || Number(guestBranch.organization_id) !== Number(ctx.organization_id)) {
    throw Object.assign(new Error("Guest branch not found in this organisation."), { code: "NOT_FOUND" });
  }
  if (Number(guestBranch.id) === Number(member.branch_id)) {
    throw Object.assign(new Error("Member already belongs to that branch."), { code: "INVALID" });
  }
  const rules = await attendanceRulesRepo.getBranchRulesWithDefaults(pool, guestBranch.id);
  if (!rules.cross_branch_guest_enabled) {
    throw Object.assign(new Error("Cross-branch guest check-in is disabled for the guest branch."), {
      code: "RULES_DISABLED",
    });
  }
  return attendanceRulesRepo.createCrossBranchAuth(pool, {
    organization_id: ctx.organization_id,
    member_id: member.id,
    home_branch_id: member.branch_id,
    guest_branch_id: guestBranch.id,
    effective_from: data.effective_from,
    effective_to: data.effective_to,
    authorized_by_admin_id: ctx.admin_id,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function loadRulesDashboard(pool, branchId, organizationId) {
  const rules = await attendanceRulesRepo.getBranchRulesWithDefaults(pool, branchId);
  const exemptions = await attendanceRulesRepo.listActiveExemptionsForBranch(pool, branchId);
  const reviewQueue = await attendanceRulesRepo.listCheckInsNeedingReview(pool, branchId);
  let absenceFlags = [];
  if (rules.absence_threshold_weeks) {
    absenceFlags = await attendanceRulesRepo.listMembersOverAbsenceThreshold(
      pool,
      branchId,
      rules.absence_threshold_weeks
    );
  }
  const now = new Date();
  const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const toDate = now.toISOString().slice(0, 10);
  const crossBranchComparison = await attendanceRulesRepo.getCheckInCountsByBranchForPeriod(
    pool,
    organizationId,
    fromDate,
    toDate
  );
  return {
    rules,
    exemptions,
    reviewQueue,
    absenceFlags,
    crossBranchComparison,
    periodLabel: `${fromDate} – ${toDate}`,
  };
}

module.exports = {
  assertCustomRulesEntitlement,
  assertOfflineEntitlement,
  saveBranchRules,
  addMemberExemption,
  authorizeCrossBranchGuest,
  loadRulesDashboard,
};
