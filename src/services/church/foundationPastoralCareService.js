"use strict";

const pastoralCareRepo = require("../../db/pg/church/pastoralCareRepo");
const prayerRequestsRepo = require("../../db/pg/church/prayerRequestsRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const { hasPastoralAccess, hasSafeguardingAccess } = require("../../church/foundationPastoralAccess");
const { safePastoralNotificationSubject } = require("../../church/foundationPastoralNotification");

const PASTORAL_ERRORS = Object.freeze({
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE_CASE: "DUPLICATE_CASE",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  INVALID_ASSIGNEE: "INVALID_ASSIGNEE",
});

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function trustedCtx(req) {
  const org = req.churchContext.organization;
  const branch = req.churchContext.branch;
  const admin = req.churchBranchAdmin;
  return {
    organization_id: org.id,
    branch_id: branch.id,
    admin_id: admin.admin_id,
    can_access_pastoral: Boolean(admin.can_access_pastoral),
    can_access_safeguarding: Boolean(admin.can_access_safeguarding),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} adminId
 */
async function requirePastoralAssignee(pool, ctx, adminId) {
  const assignee = await branchAdminsRepo.findBranchAdminById(pool, adminId);
  if (
    !assignee ||
    Number(assignee.branch_id) !== Number(ctx.branch_id) ||
    assignee.status !== "active" ||
    !assignee.can_access_pastoral
  ) {
    throw makeError(PASTORAL_ERRORS.INVALID_ASSIGNEE, "Assignee must be an active pastoral administrator.");
  }
  return assignee;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} prayerRequestId
 */
async function acknowledgePrayerRequest(pool, ctx, prayerRequestId) {
  if (!hasPastoralAccess({ can_access_pastoral: ctx.can_access_pastoral })) {
    throw makeError(PASTORAL_ERRORS.PERMISSION_DENIED, "Pastoral access required.");
  }
  const existing = await prayerRequestsRepo.findPrayerRequestByIdForBranch(pool, prayerRequestId, ctx.branch_id, {
    pastoralAccess: true,
  });
  if (!existing) throw makeError(PASTORAL_ERRORS.NOT_FOUND, "Prayer request not found.");
  const updated = await prayerRequestsRepo.updatePrayerRequestForBranch(pool, prayerRequestId, ctx.branch_id, {
    status: "acknowledged",
    from_status: existing.status,
    acknowledged_by_admin_id: ctx.admin_id,
    set_acknowledged_at: true,
  });
  return {
    prayer: updated,
    notificationSubject: safePastoralNotificationSubject("prayer_acknowledged"),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} prayerRequestId
 * @param {number} assigneeId
 */
async function assignPrayerRequest(pool, ctx, prayerRequestId, assigneeId) {
  if (!hasPastoralAccess({ can_access_pastoral: ctx.can_access_pastoral })) {
    throw makeError(PASTORAL_ERRORS.PERMISSION_DENIED, "Pastoral access required.");
  }
  await requirePastoralAssignee(pool, ctx, assigneeId);
  const existing = await prayerRequestsRepo.findPrayerRequestByIdForBranch(pool, prayerRequestId, ctx.branch_id, {
    pastoralAccess: true,
  });
  if (!existing) throw makeError(PASTORAL_ERRORS.NOT_FOUND, "Prayer request not found.");
  const updated = await prayerRequestsRepo.updatePrayerRequestForBranch(pool, prayerRequestId, ctx.branch_id, {
    status: "assigned",
    from_status: existing.status,
    assigned_admin_id: assigneeId,
    reviewed_by_admin_id: ctx.admin_id,
  });
  return {
    prayer: updated,
    notificationSubject: safePastoralNotificationSubject("prayer_assigned"),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} prayerRequestId
 * @param {{ due_date?: string, next_action?: string, admin_comment?: string }} data
 */
async function recordPrayerFollowUp(pool, ctx, prayerRequestId, data) {
  if (!hasPastoralAccess({ can_access_pastoral: ctx.can_access_pastoral })) {
    throw makeError(PASTORAL_ERRORS.PERMISSION_DENIED, "Pastoral access required.");
  }
  const existing = await prayerRequestsRepo.findPrayerRequestByIdForBranch(pool, prayerRequestId, ctx.branch_id, {
    pastoralAccess: true,
  });
  if (!existing) throw makeError(PASTORAL_ERRORS.NOT_FOUND, "Prayer request not found.");
  const updated = await prayerRequestsRepo.updatePrayerRequestForBranch(pool, prayerRequestId, ctx.branch_id, {
    status: "in_follow_up",
    from_status: existing.status,
    due_date: data.due_date || null,
    next_action: data.next_action || "",
    admin_comment: data.admin_comment,
    reviewed_by_admin_id: ctx.admin_id,
  });
  return {
    prayer: updated,
    notificationSubject: safePastoralNotificationSubject("prayer_follow_up"),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} prayerRequestId
 * @param {{ closure_outcome?: string, closure_reason?: string, admin_comment?: string }} data
 */
async function closePrayerRequest(pool, ctx, prayerRequestId, data) {
  if (!hasPastoralAccess({ can_access_pastoral: ctx.can_access_pastoral })) {
    throw makeError(PASTORAL_ERRORS.PERMISSION_DENIED, "Pastoral access required.");
  }
  const existing = await prayerRequestsRepo.findPrayerRequestByIdForBranch(pool, prayerRequestId, ctx.branch_id, {
    pastoralAccess: true,
  });
  if (!existing) throw makeError(PASTORAL_ERRORS.NOT_FOUND, "Prayer request not found.");
  const updated = await prayerRequestsRepo.updatePrayerRequestForBranch(pool, prayerRequestId, ctx.branch_id, {
    status: "closed",
    from_status: existing.status,
    closure_outcome: data.closure_outcome || "",
    closure_reason: data.closure_reason || "",
    admin_comment: data.admin_comment,
    reviewed_by_admin_id: ctx.admin_id,
    set_closed_at: true,
  });
  return {
    prayer: updated,
    notificationSubject: safePastoralNotificationSubject("prayer_closed"),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} data
 */
async function openPastoralCase(pool, ctx, data) {
  if (!hasPastoralAccess({ can_access_pastoral: ctx.can_access_pastoral })) {
    throw makeError(PASTORAL_ERRORS.PERMISSION_DENIED, "Pastoral access required.");
  }
  const member = await membersRepo.findMemberByIdForBranch(pool, data.member_id, ctx.branch_id);
  if (!member) throw makeError(PASTORAL_ERRORS.NOT_FOUND, "Member not found.");
  const duplicate = await pastoralCareRepo.findOpenPastoralCaseForMember(pool, ctx.branch_id, data.member_id);
  if (duplicate) {
    throw makeError(PASTORAL_ERRORS.DUPLICATE_CASE, "This member already has an open pastoral case.");
  }
  if (data.assigned_admin_id) {
    await requirePastoralAssignee(pool, ctx, data.assigned_admin_id);
  }
  const created = await pastoralCareRepo.createPastoralCase(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    member_id: data.member_id,
    prayer_request_id: data.prayer_request_id ?? null,
    title: data.title,
    summary: data.summary,
    assigned_admin_id: data.assigned_admin_id ?? null,
    due_date: data.due_date || null,
    next_action: data.next_action || "",
    opened_by_admin_id: ctx.admin_id,
  });
  return {
    pastoralCase: created,
    notificationSubject: safePastoralNotificationSubject("pastoral_case_opened"),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} caseId
 * @param {object} data
 */
async function recordCaseFollowUp(pool, ctx, caseId, data) {
  if (!hasPastoralAccess({ can_access_pastoral: ctx.can_access_pastoral })) {
    throw makeError(PASTORAL_ERRORS.PERMISSION_DENIED, "Pastoral access required.");
  }
  const existing = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, caseId, ctx.branch_id);
  if (!existing || existing.status === "closed") {
    throw makeError(PASTORAL_ERRORS.NOT_FOUND, "Pastoral case not found.");
  }
  const followUp = await pastoralCareRepo.createFollowUp(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    pastoral_case_id: caseId,
    contact_attempt: data.contact_attempt,
    outcome: data.outcome,
    next_action: data.next_action,
    notes: data.notes,
    recorded_by_admin_id: ctx.admin_id,
  });
  await pastoralCareRepo.updatePastoralCaseForBranch(pool, caseId, ctx.branch_id, {
    status: "in_follow_up",
    next_action: data.next_action || existing.next_action,
    due_date: data.due_date !== undefined ? data.due_date : existing.due_date,
  });
  return {
    followUp,
    notificationSubject: safePastoralNotificationSubject("pastoral_case_follow_up"),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} caseId
 * @param {object} data
 */
async function closePastoralCase(pool, ctx, caseId, data) {
  if (!hasPastoralAccess({ can_access_pastoral: ctx.can_access_pastoral })) {
    throw makeError(PASTORAL_ERRORS.PERMISSION_DENIED, "Pastoral access required.");
  }
  const existing = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, caseId, ctx.branch_id);
  if (!existing) throw makeError(PASTORAL_ERRORS.NOT_FOUND, "Pastoral case not found.");
  const updated = await pastoralCareRepo.updatePastoralCaseForBranch(pool, caseId, ctx.branch_id, {
    status: "closed",
    outcome: data.outcome || "",
    closure_reason: data.closure_reason || "",
    set_closed_at: true,
    closed_by_admin_id: ctx.admin_id,
  });
  return {
    pastoralCase: updated,
    notificationSubject: safePastoralNotificationSubject("pastoral_case_closed"),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} data
 */
async function reportSafeguardingIncident(pool, ctx, data) {
  if (!hasSafeguardingAccess({ can_access_safeguarding: ctx.can_access_safeguarding })) {
    throw makeError(PASTORAL_ERRORS.PERMISSION_DENIED, "Safeguarding access required.");
  }
  const created = await pastoralCareRepo.createSafeguardingIncident(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    member_id: data.member_id ?? null,
    summary: data.summary,
    assigned_admin_id: data.assigned_admin_id ?? null,
    reported_by_admin_id: ctx.admin_id,
  });
  return {
    incident: created,
    notificationSubject: safePastoralNotificationSubject("safeguarding_incident_opened"),
  };
}

module.exports = {
  PASTORAL_ERRORS,
  makeError,
  trustedCtx,
  acknowledgePrayerRequest,
  assignPrayerRequest,
  recordPrayerFollowUp,
  closePrayerRequest,
  openPastoralCase,
  recordCaseFollowUp,
  closePastoralCase,
  reportSafeguardingIncident,
};
