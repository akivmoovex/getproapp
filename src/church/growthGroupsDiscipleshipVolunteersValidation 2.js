"use strict";

function parseTime(value) {
  const raw = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) return null;
  const [h, m] = raw.split(":").map(Number);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function parseDateTime(value) {
  const d = new Date(String(value || "").trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function validateGroupBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const name = String(b.name || "").trim();
  if (!name || name.length > 200) return { ok: false, error: "Group name is required." };
  let capacity = null;
  if (String(b.capacity || "").trim()) {
    capacity = Number(b.capacity);
    if (!Number.isFinite(capacity) || capacity < 1 || capacity > 500) {
      return { ok: false, error: "Capacity must be 1–500, or blank." };
    }
  }
  let dow = null;
  if (String(b.meeting_day_of_week || "").trim() !== "") {
    dow = Number(b.meeting_day_of_week);
    if (!Number.isFinite(dow) || dow < 0 || dow > 6) {
      return { ok: false, error: "Meeting day must be 0–6." };
    }
  }
  const meetingTime = b.meeting_time ? parseTime(b.meeting_time) : null;
  return {
    ok: true,
    data: {
      name,
      description: String(b.description || "").trim().slice(0, 2000),
      capacity,
      meeting_day_of_week: dow,
      meeting_time: meetingTime,
      meeting_location: String(b.meeting_location || "").trim().slice(0, 200),
    },
  };
}

function validateJoinMessage(body) {
  return { ok: true, message: String((body && body.message) || "").trim().slice(0, 1000) };
}

function validateMeetingBody(body) {
  const startsAt = parseDateTime(body && body.starts_at);
  if (!startsAt) return { ok: false, error: "Meeting start is required." };
  const weeks = Number((body && body.recurring_weeks) || 0);
  return {
    ok: true,
    data: {
      starts_at: startsAt,
      location: String((body && body.location) || "").trim().slice(0, 200),
      notes: String((body && body.notes) || "").trim().slice(0, 2000),
      recurring_weeks: Number.isFinite(weeks) && weeks > 0 ? Math.min(Math.floor(weeks), 52) : 0,
    },
  };
}

function validateStageBody(body) {
  const name = String((body && body.name) || "").trim();
  if (!name || name.length > 200) return { ok: false, error: "Stage name is required." };
  return {
    ok: true,
    data: {
      name,
      description: String((body && body.description) || "").trim().slice(0, 2000),
      sort_order: Number.isFinite(Number(body && body.sort_order))
        ? Math.floor(Number(body.sort_order))
        : 0,
    },
  };
}

function validateMilestoneBody(body) {
  const name = String((body && body.name) || "").trim();
  const stageId = Number(body && body.stage_id);
  if (!name) return { ok: false, error: "Milestone name is required." };
  if (!Number.isFinite(stageId) || stageId <= 0) return { ok: false, error: "Stage is required." };
  return {
    ok: true,
    data: {
      name,
      stage_id: stageId,
      description: String((body && body.description) || "").trim().slice(0, 2000),
      sort_order: Number.isFinite(Number(body && body.sort_order))
        ? Math.floor(Number(body.sort_order))
        : 0,
    },
  };
}

function validateMovementBody(body) {
  const memberId = Number(body && body.member_id);
  const stageId = Number(body && body.stage_id);
  if (!Number.isFinite(memberId) || memberId <= 0) return { ok: false, error: "Member is required." };
  if (!Number.isFinite(stageId) || stageId <= 0) return { ok: false, error: "Stage is required." };
  const ownerId = Number(body && body.owner_admin_id);
  const milestoneId = Number(body && body.milestone_id);
  return {
    ok: true,
    data: {
      member_id: memberId,
      stage_id: stageId,
      owner_admin_id: Number.isFinite(ownerId) && ownerId > 0 ? ownerId : null,
      milestone_id: Number.isFinite(milestoneId) && milestoneId > 0 ? milestoneId : null,
      movement_reason: String((body && body.movement_reason) || "").trim().slice(0, 1000),
    },
  };
}

function validateRoleBody(body) {
  const name = String((body && body.name) || "").trim();
  if (!name) return { ok: false, error: "Role name is required." };
  return {
    ok: true,
    data: {
      name,
      description: String((body && body.description) || "").trim().slice(0, 2000),
    },
  };
}

function validateShiftBody(body) {
  const roleId = Number(body && body.role_id);
  const startsAt = parseDateTime(body && body.starts_at);
  const endsAt = parseDateTime(body && body.ends_at);
  if (!Number.isFinite(roleId) || roleId <= 0) return { ok: false, error: "Role is required." };
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return { ok: false, error: "Valid shift start and end are required." };
  }
  const slots = Number((body && body.slots) || 1);
  return {
    ok: true,
    data: {
      role_id: roleId,
      title: String((body && body.title) || "").trim().slice(0, 200),
      starts_at: startsAt,
      ends_at: endsAt,
      slots: Number.isFinite(slots) && slots >= 1 ? Math.min(Math.floor(slots), 50) : 1,
    },
  };
}

function validateAssignBody(body) {
  const memberId = Number(body && body.member_id);
  if (!Number.isFinite(memberId) || memberId <= 0) return { ok: false, error: "Member is required." };
  return { ok: true, member_id: memberId };
}

module.exports = {
  parseTime,
  validateGroupBody,
  validateJoinMessage,
  validateMeetingBody,
  validateStageBody,
  validateMilestoneBody,
  validateMovementBody,
  validateRoleBody,
  validateShiftBody,
  validateAssignBody,
};
