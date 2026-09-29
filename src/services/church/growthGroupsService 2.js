"use strict";

const groupsRepo = require("../../db/pg/church/groupsRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { getEntitlement } = require("./churchEntitlementService");

const GROUP_ERRORS = Object.freeze({
  PACKAGE_REQUIRED: "PACKAGE_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  FULL: "FULL",
  DUPLICATE: "DUPLICATE",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  CLOSED: "CLOSED",
});

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertGroupsManagement(plan) {
  if (!getEntitlement(plan, "groups.management")) {
    throw makeError(GROUP_ERRORS.PACKAGE_REQUIRED, "Growth groups require Growth.");
  }
}

async function createGroup(pool, ctx, plan, data) {
  assertGroupsManagement(plan);
  return groupsRepo.insertGroup(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    created_by_admin_id: ctx.admin_id,
    ...data,
  });
}

async function addLeader(pool, ctx, plan, groupId, fields) {
  assertGroupsManagement(plan);
  const group = await groupsRepo.findGroupByIdForBranch(pool, groupId, ctx.branch_id);
  if (!group || group.status !== "active") throw makeError(GROUP_ERRORS.NOT_FOUND, "Group not found.");
  return groupsRepo.addLeader(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    group_id: groupId,
    ...fields,
  });
}

async function submitJoinRequest(pool, ctx, plan, groupId, message) {
  assertGroupsManagement(plan);
  const group = await groupsRepo.findGroupByIdForBranch(pool, groupId, ctx.branch_id);
  if (!group || group.status !== "active") throw makeError(GROUP_ERRORS.NOT_FOUND, "Group not found.");
  const existing = await groupsRepo.findOpenMembership(pool, groupId, ctx.member_id);
  if (existing) throw makeError(GROUP_ERRORS.DUPLICATE, "Already a member or on the waitlist.");
  return groupsRepo.insertJoinRequest(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    group_id: groupId,
    member_id: ctx.member_id,
    message,
  });
}

async function decideJoinRequest(pool, ctx, plan, requestId, decision) {
  assertGroupsManagement(plan);
  const request = await groupsRepo.findJoinRequestByIdForBranch(pool, requestId, ctx.branch_id);
  if (!request || request.status !== "pending") {
    throw makeError(GROUP_ERRORS.NOT_FOUND, "Join request not found.");
  }
  const group = await groupsRepo.findGroupByIdForBranch(pool, request.group_id, ctx.branch_id);
  if (!group || group.status !== "active") throw makeError(GROUP_ERRORS.CLOSED, "Group is closed.");

  if (decision === "decline") {
    return groupsRepo.updateJoinRequest(pool, requestId, {
      status: "declined",
      decided_at: new Date(),
      decided_by_admin_id: ctx.admin_id,
    });
  }

  const activeCount = await groupsRepo.countActiveMembers(pool, group.id);
  const atCapacity = group.capacity != null && activeCount >= Number(group.capacity);

  if (decision === "waitlist" || (decision === "approve" && atCapacity)) {
    await groupsRepo.insertMembership(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      group_id: group.id,
      member_id: request.member_id,
      status: "waitlisted",
    });
    return groupsRepo.updateJoinRequest(pool, requestId, {
      status: "waitlisted",
      decided_at: new Date(),
      decided_by_admin_id: ctx.admin_id,
      decision_note: atCapacity && decision === "approve" ? "Group at capacity — waitlisted." : "",
    });
  }

  if (decision === "approve") {
    await groupsRepo.insertMembership(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      group_id: group.id,
      member_id: request.member_id,
      status: "active",
    });
    return groupsRepo.updateJoinRequest(pool, requestId, {
      status: "approved",
      decided_at: new Date(),
      decided_by_admin_id: ctx.admin_id,
    });
  }

  throw makeError(GROUP_ERRORS.INVALID_TRANSITION, "Unknown decision.");
}

async function promoteFromWaitlist(pool, ctx, plan, groupId, membershipId) {
  assertGroupsManagement(plan);
  const group = await groupsRepo.findGroupByIdForBranch(pool, groupId, ctx.branch_id);
  if (!group || group.status !== "active") throw makeError(GROUP_ERRORS.NOT_FOUND, "Group not found.");
  const activeCount = await groupsRepo.countActiveMembers(pool, groupId);
  if (group.capacity != null && activeCount >= Number(group.capacity)) {
    throw makeError(GROUP_ERRORS.FULL, "Group is at capacity.");
  }
  return groupsRepo.updateMembership(pool, membershipId, {
    status: "active",
    waitlisted_at: null,
  });
}

async function transferMember(pool, ctx, plan, fromGroupId, toGroupId, memberId) {
  assertGroupsManagement(plan);
  const fromGroup = await groupsRepo.findGroupByIdForBranch(pool, fromGroupId, ctx.branch_id);
  const toGroup = await groupsRepo.findGroupByIdForBranch(pool, toGroupId, ctx.branch_id);
  if (!fromGroup || !toGroup || toGroup.status !== "active") {
    throw makeError(GROUP_ERRORS.NOT_FOUND, "Group not found.");
  }
  const membership = await groupsRepo.findOpenMembership(pool, fromGroupId, memberId);
  if (!membership || membership.status !== "active") {
    throw makeError(GROUP_ERRORS.NOT_FOUND, "Active membership not found.");
  }
  const toActive = await groupsRepo.countActiveMembers(pool, toGroupId);
  if (toGroup.capacity != null && toActive >= Number(toGroup.capacity)) {
    throw makeError(GROUP_ERRORS.FULL, "Destination group is at capacity.");
  }
  await groupsRepo.updateMembership(pool, membership.id, {
    status: "transferred",
    left_at: new Date(),
  });
  return groupsRepo.insertMembership(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    group_id: toGroupId,
    member_id: memberId,
    status: "active",
    transferred_from_group_id: fromGroupId,
  });
}

async function scheduleRecurringMeetings(pool, ctx, plan, groupId, data) {
  assertGroupsManagement(plan);
  const group = await groupsRepo.findGroupByIdForBranch(pool, groupId, ctx.branch_id);
  if (!group || group.status !== "active") throw makeError(GROUP_ERRORS.NOT_FOUND, "Group not found.");
  const seriesKey = `series_${groupId}_${Date.now()}`;
  const created = [];
  const weeks = Math.max(1, data.recurring_weeks || 1);
  for (let i = 0; i < weeks; i += 1) {
    const startsAt = new Date(data.starts_at.getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const meeting = await groupsRepo.insertMeeting(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      group_id: groupId,
      starts_at: startsAt,
      is_recurring_instance: weeks > 1,
      recurrence_series_key: weeks > 1 ? seriesKey : null,
      location: data.location || group.meeting_location || "",
      notes: data.notes || "",
    });
    created.push(meeting);
  }
  return created;
}

async function recordAttendance(pool, ctx, plan, meetingId, memberId, present) {
  assertGroupsManagement(plan);
  const meeting = await groupsRepo.findMeetingByIdForBranch(pool, meetingId, ctx.branch_id);
  if (!meeting) throw makeError(GROUP_ERRORS.NOT_FOUND, "Meeting not found.");
  return groupsRepo.upsertAttendance(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    group_id: meeting.group_id,
    meeting_id: meetingId,
    member_id: memberId,
    present: present !== false,
    recorded_by_admin_id: ctx.admin_id,
  });
}

async function addNote(pool, ctx, plan, groupId, noteBody) {
  assertGroupsManagement(plan);
  const group = await groupsRepo.findGroupByIdForBranch(pool, groupId, ctx.branch_id);
  if (!group) throw makeError(GROUP_ERRORS.NOT_FOUND, "Group not found.");
  return groupsRepo.insertNote(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    group_id: groupId,
    note_body: noteBody,
    created_by_admin_id: ctx.admin_id,
  });
}

async function closeGroup(pool, ctx, plan, groupId, reason) {
  assertGroupsManagement(plan);
  const closed = await groupsRepo.closeGroup(pool, groupId, ctx.branch_id, {
    closed_by_admin_id: ctx.admin_id,
    closure_reason: reason || "",
  });
  if (!closed) throw makeError(GROUP_ERRORS.NOT_FOUND, "Group not found or already closed.");
  // Memberships retained; history preserved via closed status on group.
  return closed;
}

async function loadDashboard(pool, ctx, plan) {
  assertGroupsManagement(plan);
  const groups = await groupsRepo.listGroupsForBranch(pool, ctx.branch_id);
  const pending = await groupsRepo.listPendingJoinRequestsForBranch(pool, ctx.branch_id);
  return { groups, pending };
}

async function loadGroupDetail(pool, ctx, plan, groupId) {
  assertGroupsManagement(plan);
  const group = await groupsRepo.findGroupByIdForBranch(pool, groupId, ctx.branch_id);
  if (!group) throw makeError(GROUP_ERRORS.NOT_FOUND, "Group not found.");
  const [leaders, memberships, meetings, notes] = await Promise.all([
    groupsRepo.listLeadersForGroup(pool, groupId),
    groupsRepo.listMembershipsForGroup(pool, groupId),
    groupsRepo.listMeetingsForGroup(pool, groupId),
    groupsRepo.listNotesForGroup(pool, groupId),
  ]);
  return { group, leaders, memberships, meetings, notes };
}

module.exports = {
  GROUP_ERRORS,
  assertGroupsManagement,
  createGroup,
  addLeader,
  submitJoinRequest,
  decideJoinRequest,
  promoteFromWaitlist,
  transferMember,
  scheduleRecurringMeetings,
  recordAttendance,
  addNote,
  closeGroup,
  loadDashboard,
  loadGroupDetail,
};
