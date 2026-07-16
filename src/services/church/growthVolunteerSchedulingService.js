"use strict";

const volunteerSchedulingRepo = require("../../db/pg/church/volunteerSchedulingRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { getEntitlement } = require("./churchEntitlementService");

const VOLUNTEER_ERRORS = Object.freeze({
  PACKAGE_REQUIRED: "PACKAGE_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  CONFLICT: "CONFLICT",
  INELIGIBLE: "INELIGIBLE",
  INVALID_TRANSITION: "INVALID_TRANSITION",
});

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertVolunteerScheduling(plan) {
  if (!getEntitlement(plan, "volunteers.scheduling")) {
    throw makeError(
      VOLUNTEER_ERRORS.PACKAGE_REQUIRED,
      "Volunteer scheduling requires Growth. Foundation supports volunteer interest lists only."
    );
  }
}

async function createRole(pool, ctx, plan, data) {
  assertVolunteerScheduling(plan);
  return volunteerSchedulingRepo.insertRole(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    ...data,
  });
}

async function createSkill(pool, ctx, plan, name) {
  assertVolunteerScheduling(plan);
  return volunteerSchedulingRepo.insertSkill(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    name,
  });
}

async function requireSkillForRole(pool, ctx, plan, roleId, skillId) {
  assertVolunteerScheduling(plan);
  const role = await volunteerSchedulingRepo.findRoleByIdForBranch(pool, roleId, ctx.branch_id);
  if (!role) throw makeError(VOLUNTEER_ERRORS.NOT_FOUND, "Role not found.");
  await volunteerSchedulingRepo.linkRoleSkill(pool, roleId, skillId);
}

async function addMemberSkill(pool, ctx, plan, memberId, skillId) {
  assertVolunteerScheduling(plan);
  const member = await membersRepo.findMemberByIdForBranch(pool, memberId, ctx.branch_id);
  if (!member) throw makeError(VOLUNTEER_ERRORS.NOT_FOUND, "Member not found.");
  return volunteerSchedulingRepo.addMemberSkill(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    member_id: memberId,
    skill_id: skillId,
  });
}

async function setAvailability(pool, ctx, plan, fields) {
  assertVolunteerScheduling(plan);
  return volunteerSchedulingRepo.insertAvailability(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    ...fields,
  });
}

async function createShift(pool, ctx, plan, data) {
  assertVolunteerScheduling(plan);
  const role = await volunteerSchedulingRepo.findRoleByIdForBranch(pool, data.role_id, ctx.branch_id);
  if (!role) throw makeError(VOLUNTEER_ERRORS.NOT_FOUND, "Role not found.");
  return volunteerSchedulingRepo.insertShift(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    created_by_admin_id: ctx.admin_id,
    ...data,
  });
}

async function assertEligible(pool, memberId, roleId) {
  const required = await volunteerSchedulingRepo.listSkillsForRole(pool, roleId);
  if (!required.length) return true;
  const have = new Set(await volunteerSchedulingRepo.listMemberSkillIds(pool, memberId));
  return required.every((s) => have.has(Number(s.id)));
}

async function assignShift(pool, ctx, plan, shiftId, memberId) {
  assertVolunteerScheduling(plan);
  const shift = await volunteerSchedulingRepo.findShiftByIdForBranch(pool, shiftId, ctx.branch_id);
  if (!shift || shift.status === "cancelled") {
    throw makeError(VOLUNTEER_ERRORS.NOT_FOUND, "Shift not found.");
  }
  const member = await membersRepo.findMemberByIdForBranch(pool, memberId, ctx.branch_id);
  if (!member) throw makeError(VOLUNTEER_ERRORS.NOT_FOUND, "Member not found.");

  const eligible = await assertEligible(pool, memberId, shift.role_id);
  if (!eligible) {
    throw makeError(VOLUNTEER_ERRORS.INELIGIBLE, "Member lacks required skills for this role.");
  }

  const conflict = await volunteerSchedulingRepo.findConflictingAssignment(
    pool,
    memberId,
    shift.starts_at,
    shift.ends_at,
    shiftId
  );
  if (conflict) {
    throw makeError(VOLUNTEER_ERRORS.CONFLICT, "Member already assigned to an overlapping shift.");
  }

  return volunteerSchedulingRepo.insertAssignment(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    shift_id: shiftId,
    member_id: memberId,
    assigned_by_admin_id: ctx.admin_id,
  });
}

async function confirmAssignment(pool, ctx, plan, assignmentId) {
  assertVolunteerScheduling(plan);
  const existing = await volunteerSchedulingRepo.findAssignmentByIdForBranch(
    pool,
    assignmentId,
    ctx.branch_id
  );
  if (!existing || existing.status !== "assigned") {
    throw makeError(VOLUNTEER_ERRORS.INVALID_TRANSITION, "Assignment cannot be confirmed.");
  }
  return volunteerSchedulingRepo.updateAssignment(pool, assignmentId, {
    status: "confirmed",
    confirmed_at: new Date(),
  });
}

async function completeAssignment(pool, ctx, plan, assignmentId) {
  assertVolunteerScheduling(plan);
  const existing = await volunteerSchedulingRepo.findAssignmentByIdForBranch(
    pool,
    assignmentId,
    ctx.branch_id
  );
  if (!existing || !["assigned", "confirmed"].includes(existing.status)) {
    throw makeError(VOLUNTEER_ERRORS.INVALID_TRANSITION, "Assignment cannot be completed.");
  }
  return volunteerSchedulingRepo.updateAssignment(pool, assignmentId, {
    status: "completed",
    completed_at: new Date(),
  });
}

async function loadDashboard(pool, ctx, plan) {
  assertVolunteerScheduling(plan);
  const [roles, skills, shifts] = await Promise.all([
    volunteerSchedulingRepo.listRolesForBranch(pool, ctx.branch_id),
    volunteerSchedulingRepo.listSkillsForBranch(pool, ctx.branch_id),
    volunteerSchedulingRepo.listShiftsForBranch(pool, ctx.branch_id),
  ]);
  return { roles, skills, shifts };
}

module.exports = {
  VOLUNTEER_ERRORS,
  assertVolunteerScheduling,
  createRole,
  createSkill,
  requireSkillForRole,
  addMemberSkill,
  setAvailability,
  createShift,
  assignShift,
  confirmAssignment,
  completeAssignment,
  loadDashboard,
};
