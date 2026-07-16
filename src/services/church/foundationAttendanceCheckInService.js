"use strict";

const attendanceCheckInRepo = require("../../db/pg/church/attendanceCheckInRepo");
const attendanceQrTokenRepo = require("../../db/pg/church/attendanceQrTokenRepo");
const membersRepo = require("../../db/pg/church/membersRepo");
const { usherMemberDisplay } = require("../../church/attendanceCheckInValidation");

const CHECK_IN_ERRORS = Object.freeze({
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_CLOSED: "SESSION_CLOSED",
  MEMBER_NOT_FOUND: "MEMBER_NOT_FOUND",
  MEMBER_NOT_VERIFIED: "MEMBER_NOT_VERIFIED",
  WRONG_BRANCH: "WRONG_BRANCH",
  DUPLICATE: "DUPLICATE",
  INVALID_QR: "INVALID_QR",
  NOT_FOUND: "NOT_FOUND",
  ALREADY_VOIDED: "ALREADY_VOIDED",
  PERMISSION_DENIED: "PERMISSION_DENIED",
});

function makeCheckInError(code, message) {
  return Object.assign(new Error(message), { code });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} sessionId
 * @param {number} branchId
 */
async function requireOpenSession(pool, sessionId, branchId) {
  const session = await attendanceCheckInRepo.findServiceSessionByIdForBranch(pool, sessionId, branchId);
  if (!session) {
    throw makeCheckInError(CHECK_IN_ERRORS.SESSION_NOT_FOUND, "Service session not found for this branch.");
  }
  if (session.status !== "open") {
    throw makeCheckInError(CHECK_IN_ERRORS.SESSION_CLOSED, "This service session is closed.");
  }
  return session;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 */
async function requireVerifiedMemberForBranch(pool, memberId, branchId) {
  const member = await membersRepo.findMemberByIdForBranch(pool, memberId, branchId);
  if (!member) {
    throw makeCheckInError(CHECK_IN_ERRORS.MEMBER_NOT_FOUND, "Member not found at this branch.");
  }
  if (member.status !== "verified") {
    throw makeCheckInError(CHECK_IN_ERRORS.MEMBER_NOT_VERIFIED, "Only verified members can be checked in.");
  }
  return member;
}

/**
 * @param {object} row
 */
function toUsherCheckInRow(row) {
  if (!row) return null;
  if (row.check_in_kind === "visitor") {
    const name = String(row.visitor_name || "Visitor").trim();
    const parts = name.split(/\s+/).filter(Boolean);
    return {
      id: row.id,
      kind: "visitor",
      method: row.method,
      display: usherMemberDisplay({ full_name: name }),
      checked_in_at: row.checked_in_at,
      status: row.status,
    };
  }
  return {
    id: row.id,
    kind: "member",
    method: row.method,
    display: usherMemberDisplay(row),
    checked_in_at: row.checked_in_at,
    status: row.status,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} data
 */
async function manualMemberCheckIn(pool, ctx, data) {
  const session = await requireOpenSession(pool, data.session_id, ctx.branch_id);
  const member = await requireVerifiedMemberForBranch(pool, data.member_id, ctx.branch_id);
  const duplicate = await attendanceCheckInRepo.findActiveMemberCheckInForSession(
    pool,
    session.id,
    member.id
  );
  if (duplicate) {
    throw makeCheckInError(CHECK_IN_ERRORS.DUPLICATE, "This member is already checked in for this session.");
  }
  const checkIn = await attendanceCheckInRepo.createCheckIn(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    service_session_id: session.id,
    member_id: member.id,
    check_in_kind: "member",
    method: "manual",
    checked_in_by_admin_id: ctx.admin_id,
  });
  return { checkIn, session, member, display: usherMemberDisplay(member) };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} data
 */
async function visitorCheckIn(pool, ctx, data) {
  const session = await requireOpenSession(pool, data.session_id, ctx.branch_id);
  const checkIn = await attendanceCheckInRepo.createCheckIn(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    service_session_id: session.id,
    check_in_kind: "visitor",
    method: "manual",
    visitor_name: data.visitor_name,
    visitor_phone: data.visitor_phone || null,
    checked_in_by_admin_id: ctx.admin_id,
  });
  return { checkIn, session, display: usherMemberDisplay({ full_name: data.visitor_name }) };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} data
 */
async function qrCheckIn(pool, ctx, data) {
  const session = await requireOpenSession(pool, data.session_id, ctx.branch_id);
  const tokenRow = await attendanceQrTokenRepo.findActiveQrTokenByToken(pool, data.qr_token);
  if (!tokenRow) {
    throw makeCheckInError(CHECK_IN_ERRORS.INVALID_QR, "Invalid or expired QR code.");
  }
  if (Number(tokenRow.branch_id) !== Number(ctx.branch_id)) {
    throw makeCheckInError(CHECK_IN_ERRORS.WRONG_BRANCH, "This QR code belongs to a different branch.");
  }
  if (tokenRow.member_status !== "verified") {
    throw makeCheckInError(CHECK_IN_ERRORS.MEMBER_NOT_VERIFIED, "Member account is not verified for check-in.");
  }
  const duplicate = await attendanceCheckInRepo.findActiveMemberCheckInForSession(
    pool,
    session.id,
    tokenRow.member_id
  );
  if (duplicate) {
    throw makeCheckInError(CHECK_IN_ERRORS.DUPLICATE, "This member is already checked in for this session.");
  }
  const checkIn = await attendanceCheckInRepo.createCheckIn(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    service_session_id: session.id,
    member_id: tokenRow.member_id,
    check_in_kind: "member",
    method: "qr",
    checked_in_by_admin_id: ctx.admin_id,
  });
  return {
    checkIn,
    session,
    display: usherMemberDisplay({ full_name: tokenRow.full_name }),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} checkInId
 * @param {object} data
 */
async function correctCheckIn(pool, ctx, checkInId, data) {
  if (!ctx.can_correct_attendance) {
    throw makeCheckInError(CHECK_IN_ERRORS.PERMISSION_DENIED, "You do not have permission to correct attendance.");
  }
  const existing = await attendanceCheckInRepo.findCheckInByIdForBranch(pool, checkInId, ctx.branch_id);
  if (!existing) {
    throw makeCheckInError(CHECK_IN_ERRORS.NOT_FOUND, "Check-in not found.");
  }
  if (existing.status !== "active") {
    throw makeCheckInError(CHECK_IN_ERRORS.ALREADY_VOIDED, "This check-in was already voided.");
  }
  const voided = await attendanceCheckInRepo.voidCheckInForBranch(pool, checkInId, ctx.branch_id, {
    admin_id: ctx.admin_id,
    reason: data.reason,
  });
  let replacement = null;
  if (data.replacement_kind === "member" && data.replacement_member_id) {
    const session = await attendanceCheckInRepo.findServiceSessionByIdForBranch(
      pool,
      existing.service_session_id,
      ctx.branch_id
    );
    if (session && session.status === "open") {
      replacement = (
        await manualMemberCheckIn(pool, ctx, {
          session_id: session.id,
          member_id: data.replacement_member_id,
        })
      ).checkIn;
      await pool.query(
        `UPDATE public.church_attendance_check_ins
         SET correction_of_check_in_id = $1, updated_at = now()
         WHERE id = $2`,
        [voided.id, replacement.id]
      );
    }
  } else if (data.replacement_kind === "visitor" && data.replacement_visitor_name) {
    const session = await attendanceCheckInRepo.findServiceSessionByIdForBranch(
      pool,
      existing.service_session_id,
      ctx.branch_id
    );
    if (session && session.status === "open") {
      replacement = (
        await visitorCheckIn(pool, ctx, {
          session_id: session.id,
          visitor_name: data.replacement_visitor_name,
        })
      ).checkIn;
      await pool.query(
        `UPDATE public.church_attendance_check_ins
         SET correction_of_check_in_id = $1, updated_at = now()
         WHERE id = $2`,
        [voided.id, replacement.id]
      );
    }
  }
  return { voided, replacement };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} fields
 */
async function openServiceSession(pool, ctx, fields) {
  return attendanceCheckInRepo.createServiceSession(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    attendance_type: fields.attendance_type,
    service_name: fields.service_name,
    session_date: fields.session_date,
    opened_by_admin_id: ctx.admin_id,
    notes: fields.notes,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} sessionId
 */
async function closeServiceSession(pool, ctx, sessionId) {
  const session = await attendanceCheckInRepo.findServiceSessionByIdForBranch(pool, sessionId, ctx.branch_id);
  if (!session) {
    throw makeCheckInError(CHECK_IN_ERRORS.SESSION_NOT_FOUND, "Service session not found for this branch.");
  }
  if (session.status === "closed") {
    return session;
  }
  return attendanceCheckInRepo.closeServiceSessionForBranch(pool, sessionId, ctx.branch_id, ctx.admin_id);
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {number} memberId
 */
async function ensureMemberQrToken(pool, ctx, memberId) {
  const member = await membersRepo.findMemberByIdForBranch(pool, memberId, ctx.branch_id);
  if (!member || member.status !== "verified") {
    throw makeCheckInError(CHECK_IN_ERRORS.MEMBER_NOT_FOUND, "Member not found.");
  }
  return attendanceQrTokenRepo.ensureActiveQrTokenForMember(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    member_id: memberId,
  });
}

module.exports = {
  CHECK_IN_ERRORS,
  makeCheckInError,
  toUsherCheckInRow,
  manualMemberCheckIn,
  visitorCheckIn,
  qrCheckIn,
  correctCheckIn,
  openServiceSession,
  closeServiceSession,
  ensureMemberQrToken,
  requireOpenSession,
};
