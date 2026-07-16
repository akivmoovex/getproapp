"use strict";

const discipleshipRepo = require("../../db/pg/church/discipleshipRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { getEntitlement } = require("./churchEntitlementService");

const DISCIPLESHIP_ERRORS = Object.freeze({
  PACKAGE_REQUIRED: "PACKAGE_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
});

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertDiscipleshipPathways(plan) {
  if (!getEntitlement(plan, "discipleship.pathways")) {
    throw makeError(DISCIPLESHIP_ERRORS.PACKAGE_REQUIRED, "Discipleship pathways require Growth.");
  }
}

async function createStage(pool, ctx, plan, data) {
  assertDiscipleshipPathways(plan);
  return discipleshipRepo.insertStage(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    ...data,
  });
}

async function createMilestone(pool, ctx, plan, data) {
  assertDiscipleshipPathways(plan);
  const stage = await discipleshipRepo.findStageByIdForBranch(pool, data.stage_id, ctx.branch_id);
  if (!stage) throw makeError(DISCIPLESHIP_ERRORS.NOT_FOUND, "Stage not found.");
  return discipleshipRepo.insertMilestone(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    ...data,
  });
}

async function moveMember(pool, ctx, plan, data) {
  assertDiscipleshipPathways(plan);
  const stage = await discipleshipRepo.findStageByIdForBranch(pool, data.stage_id, ctx.branch_id);
  if (!stage) throw makeError(DISCIPLESHIP_ERRORS.NOT_FOUND, "Stage not found.");
  const member = await membersRepo.findMemberByIdForBranch(pool, data.member_id, ctx.branch_id);
  if (!member) throw makeError(DISCIPLESHIP_ERRORS.NOT_FOUND, "Member not found.");

  if (data.milestone_id) {
    const milestone = await discipleshipRepo.findMilestoneByIdForBranch(
      pool,
      data.milestone_id,
      ctx.branch_id
    );
    if (!milestone || Number(milestone.stage_id) !== Number(data.stage_id)) {
      throw makeError(DISCIPLESHIP_ERRORS.NOT_FOUND, "Milestone not found for stage.");
    }
  }

  const current = await discipleshipRepo.findMemberDiscipleship(pool, data.member_id, ctx.branch_id);
  const updated = await discipleshipRepo.upsertMemberDiscipleship(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    member_id: data.member_id,
    stage_id: data.stage_id,
    owner_admin_id: data.owner_admin_id,
  });
  const history = await discipleshipRepo.insertHistory(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    member_id: data.member_id,
    from_stage_id: current ? current.stage_id : null,
    to_stage_id: data.stage_id,
    milestone_id: data.milestone_id,
    movement_reason: data.movement_reason,
    moved_by_admin_id: ctx.admin_id,
  });
  return { pathway: updated, history };
}

async function loadDashboard(pool, ctx, plan) {
  assertDiscipleshipPathways(plan);
  const stages = await discipleshipRepo.listStagesForBranch(pool, ctx.branch_id);
  const pathways = await discipleshipRepo.listMemberDiscipleshipForBranch(pool, ctx.branch_id);
  const milestonesByStage = {};
  for (const stage of stages) {
    milestonesByStage[stage.id] = await discipleshipRepo.listMilestonesForStage(pool, stage.id);
  }
  return { stages, pathways, milestonesByStage };
}

async function loadMemberHistory(pool, ctx, plan, memberId) {
  assertDiscipleshipPathways(plan);
  const pathway = await discipleshipRepo.findMemberDiscipleship(pool, memberId, ctx.branch_id);
  const history = await discipleshipRepo.listHistoryForMember(pool, memberId, ctx.branch_id);
  return { pathway, history };
}

module.exports = {
  DISCIPLESHIP_ERRORS,
  assertDiscipleshipPathways,
  createStage,
  createMilestone,
  moveMember,
  loadDashboard,
  loadMemberHistory,
};
