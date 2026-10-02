"use strict";

/**
 * BlessBoard V2.04 session-based attendance constants.
 */

const SESSION_STATUS = Object.freeze({
  DRAFT: "draft",
  OPEN: "open",
  CLOSED: "closed",
  LOCKED: "locked",
});

const SESSION_STATUSES = Object.freeze([
  SESSION_STATUS.DRAFT,
  SESSION_STATUS.OPEN,
  SESSION_STATUS.CLOSED,
  SESSION_STATUS.LOCKED,
]);

const CHECK_IN_METHOD = Object.freeze({
  MANUAL: "manual",
  QR: "qr",
  PEAK: "peak",
});

const CHECK_IN_METHODS = Object.freeze([
  CHECK_IN_METHOD.MANUAL,
  CHECK_IN_METHOD.QR,
  CHECK_IN_METHOD.PEAK,
]);

const CHECK_IN_STATUS = Object.freeze({
  PRESENT: "present",
  LATE: "late",
  VOIDED: "voided",
});

/** Church policy when membership branch ≠ attendance branch. Default: record (never auto-reject). */
const WRONG_BRANCH_POLICY = Object.freeze({
  RECORD: "record",
  REQUIRE_REVIEW: "require_review",
  DENY: "deny",
});

const ATTENDANCE_PERMISSION = Object.freeze({
  VIEW: "attendance.view",
  RECORD: "attendance.record",
  CHECK_IN: "attendance.check_in",
  CORRECT: "attendance.correct",
  MANAGE_SESSION: "attendance.manage_session",
});

/** Membership statuses eligible for check-in (existing BB rule alignment). */
const ELIGIBLE_MEMBERSHIP_STATUSES = Object.freeze(["active"]);

const VALIDATION_CODE = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  UNAUTHORIZED: "unauthorized",
  MEMBER_NOT_FOUND: "member_not_found",
  MEMBER_NOT_ELIGIBLE: "member_not_eligible",
  DUPLICATE_ATTENDANCE: "duplicate_attendance",
  WRONG_BRANCH: "wrong_branch",
  LATE_ARRIVAL: "late_arrival",
  SESSION_NOT_FOUND: "session_not_found",
  SESSION_NOT_OPEN: "session_not_open",
  SESSION_CLOSED: "session_closed",
  SESSION_LOCKED: "session_locked",
  INVALID_QR: "invalid_qr",
  EXPIRED_QR: "expired_qr",
  TENANT_MISMATCH: "tenant_mismatch",
});

const TOKEN_KIND = Object.freeze({
  SESSION: "session",
  MEMBER_CLAIM: "member_claim",
});

module.exports = {
  SESSION_STATUS,
  SESSION_STATUSES,
  CHECK_IN_METHOD,
  CHECK_IN_METHODS,
  CHECK_IN_STATUS,
  WRONG_BRANCH_POLICY,
  ATTENDANCE_PERMISSION,
  ELIGIBLE_MEMBERSHIP_STATUSES,
  VALIDATION_CODE,
  TOKEN_KIND,
};
