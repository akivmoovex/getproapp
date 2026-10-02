"use strict";

/**
 * Shared attendance validation service (V2.04 Phase 6).
 *
 * MANUAL, QR, and PEAK check-ins MUST call this engine.
 * Does not persist — returns a decision for the check-in service to apply.
 */

const {
  SESSION_STATUS,
  CHECK_IN_METHODS,
  CHECK_IN_STATUS,
  WRONG_BRANCH_POLICY,
  ELIGIBLE_MEMBERSHIP_STATUSES,
  VALIDATION_CODE,
  ATTENDANCE_PERMISSION,
} = require("./attendanceDomainConstants");
const {
  verifyAttendanceToken,
} = require("./attendanceSessionQrToken");

const RESULT = VALIDATION_CODE;

function createAuthorize(deps) {
  return (
    (deps && deps.authorize) ||
    ((db, input) =>
      require("../blessBoardRbacAuthorizationService").authorize(db, {
        permission: input.permission,
        actor: { userId: input.actorUserId },
        tenantContext: {
          organizationId: input.organizationId,
          churchId: input.churchId,
          primaryBranchId: input.branchId || null,
        },
        resourceContext: {
          organizationId: input.organizationId,
          churchId: input.churchId,
          branchId: input.branchId != null ? input.branchId : null,
        },
      }))
  );
}

/**
 * Evaluate late arrival against session start + late_threshold_minutes.
 * Late does NOT reject — recorded as metadata/status.
 */
function evaluateLateArrival(session, checkedInAt) {
  const at = checkedInAt instanceof Date ? checkedInAt : new Date(checkedInAt || Date.now());
  const start = new Date(session.startTime || session.start_time);
  const thresholdMin = Number(
    session.lateThresholdMinutes != null
      ? session.lateThresholdMinutes
      : session.late_threshold_minutes != null
        ? session.late_threshold_minutes
        : 15
  );
  const lateAfter = new Date(start.getTime() + thresholdMin * 60 * 1000);
  const late = at.getTime() > lateAfter.getTime();
  return {
    lateArrival: late,
    checkInStatus: late ? CHECK_IN_STATUS.LATE : CHECK_IN_STATUS.PRESENT,
    checkedInAt: at,
    lateAfter,
  };
}

/**
 * Wrong branch: never auto-reject at engine level unless church policy = deny.
 * Always surface membershipBranchId + attendanceBranchId.
 */
function evaluateWrongBranch(session, member, policyOverride) {
  const membershipBranchId = String(
    (member && (member.primaryBranchId || member.branchId || member.membershipBranchId)) ||
      ""
  ).trim() || null;
  const attendanceBranchId = String(
    (session && (session.branchId || session.branch_id)) || ""
  ).trim();
  const wrongBranch =
    Boolean(membershipBranchId) &&
    Boolean(attendanceBranchId) &&
    membershipBranchId !== attendanceBranchId;

  const policy = String(
    policyOverride ||
      (session && (session.wrongBranchPolicy || session.wrong_branch_policy)) ||
      WRONG_BRANCH_POLICY.RECORD
  )
    .trim()
    .toLowerCase();

  if (!wrongBranch) {
    return {
      wrongBranch: false,
      needsReview: false,
      reject: false,
      membershipBranchId,
      attendanceBranchId,
      policy,
    };
  }

  if (policy === WRONG_BRANCH_POLICY.DENY) {
    return {
      wrongBranch: true,
      needsReview: false,
      reject: true,
      membershipBranchId,
      attendanceBranchId,
      policy,
      code: RESULT.WRONG_BRANCH,
    };
  }

  return {
    wrongBranch: true,
    needsReview: policy === WRONG_BRANCH_POLICY.REQUIRE_REVIEW,
    reject: false,
    membershipBranchId,
    attendanceBranchId,
    policy,
  };
}

function assertSessionAcceptsCheckIn(session) {
  if (!session) {
    return { ok: false, code: RESULT.SESSION_NOT_FOUND };
  }
  const status = String(session.status || "").toLowerCase();
  if (status === SESSION_STATUS.DRAFT) {
    return { ok: false, code: RESULT.SESSION_NOT_OPEN };
  }
  if (status === SESSION_STATUS.CLOSED) {
    return { ok: false, code: RESULT.SESSION_CLOSED };
  }
  if (status === SESSION_STATUS.LOCKED) {
    return { ok: false, code: RESULT.SESSION_LOCKED };
  }
  if (status !== SESSION_STATUS.OPEN) {
    return { ok: false, code: RESULT.SESSION_NOT_OPEN };
  }
  return { ok: true };
}

function assertMemberEligible(member) {
  if (!member) {
    return { ok: false, code: RESULT.MEMBER_NOT_FOUND };
  }
  const status = String(member.status || member.membershipStatus || "")
    .trim()
    .toLowerCase();
  if (!ELIGIBLE_MEMBERSHIP_STATUSES.includes(status)) {
    return { ok: false, code: RESULT.MEMBER_NOT_ELIGIBLE, memberStatus: status };
  }
  return { ok: true };
}

/**
 * Core validation for any check-in method.
 *
 * @param {{ query?: Function }} db
 * @param {{
 *   method: string,
 *   organizationId: string,
 *   churchId: string,
 *   actorUserId: string,
 *   session: object,
 *   member: object,
 *   existingCheckIn?: object|null,
 *   qrToken?: string|null,
 *   verifiedQr?: object|null,
 *   checkedInAt?: Date,
 *   wrongBranchPolicy?: string,
 * }} input
 * @param {object} [deps]
 */
async function validateAttendanceCheckIn(db, input, deps) {
  const method = String((input && input.method) || "")
    .trim()
    .toLowerCase();
  if (!CHECK_IN_METHODS.includes(method)) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "method" };
  }

  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!organizationId || !churchId || !actorUserId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const authorize = createAuthorize(deps);
  const authz = await authorize(db, {
    permission: ATTENDANCE_PERMISSION.CHECK_IN,
    actorUserId,
    organizationId,
    churchId,
    branchId:
      (input.session && (input.session.branchId || input.session.branch_id)) ||
      input.branchId ||
      null,
  });
  if (!authz || authz.allowed !== true) {
    return {
      ok: false,
      code: RESULT.UNAUTHORIZED,
      reasonCode: (authz && authz.reasonCode) || "unauthorized",
    };
  }

  const sessionGate = assertSessionAcceptsCheckIn(input.session);
  if (!sessionGate.ok) return sessionGate;

  const session = input.session;
  if (
    String(session.churchId || session.church_id) !== churchId ||
    String(session.organizationId || session.organization_id) !== organizationId
  ) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }

  // QR path: verify opaque token before member eligibility when provided.
  let qrMeta = input.verifiedQr || null;
  if (method === "qr" || (method === "peak" && input.qrToken)) {
    if (!qrMeta) {
      const verified = verifyAttendanceToken(input.qrToken, {
        qrSigningSecret: deps && deps.qrSigningSecret,
        now: input.checkedInAt || (deps && deps.now),
      });
      if (!verified.ok) {
        return {
          ok: false,
          code:
            verified.code === "expired_qr"
              ? RESULT.EXPIRED_QR
              : RESULT.INVALID_QR,
        };
      }
      qrMeta = verified;
    }
    if (String(qrMeta.sessionId) !== String(session.id)) {
      return { ok: false, code: RESULT.INVALID_QR, detail: "session_mismatch" };
    }
  }

  const memberGate = assertMemberEligible(input.member);
  if (!memberGate.ok) return memberGate;

  const member = input.member;
  if (String(member.churchId || member.church_id) !== churchId) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }

  // Duplicate: return existing rather than create another.
  if (input.existingCheckIn) {
    return {
      ok: true,
      code: RESULT.DUPLICATE_ATTENDANCE,
      duplicate: true,
      existing: input.existingCheckIn,
      method,
      decision: {
        action: "return_existing",
        create: false,
      },
    };
  }

  const branchEval = evaluateWrongBranch(
    session,
    member,
    input.wrongBranchPolicy
  );
  if (branchEval.reject) {
    return {
      ok: false,
      code: RESULT.WRONG_BRANCH,
      membershipBranchId: branchEval.membershipBranchId,
      attendanceBranchId: branchEval.attendanceBranchId,
      policy: branchEval.policy,
    };
  }

  const lateEval = evaluateLateArrival(session, input.checkedInAt || new Date());

  return {
    ok: true,
    code: RESULT.OK,
    duplicate: false,
    method,
    qr: qrMeta
      ? { jti: qrMeta.jti, kind: qrMeta.kind, sessionId: qrMeta.sessionId }
      : null,
    decision: {
      action: "create",
      create: true,
      method,
      memberId: member.id,
      sessionId: session.id,
      membershipBranchId: branchEval.membershipBranchId,
      attendanceBranchId: branchEval.attendanceBranchId,
      wrongBranch: branchEval.wrongBranch,
      needsReview: branchEval.needsReview,
      lateArrival: lateEval.lateArrival,
      status: lateEval.checkInStatus,
      checkedInAt: lateEval.checkedInAt,
      checkedInByUserId: actorUserId,
    },
  };
}

module.exports = {
  RESULT,
  validateAttendanceCheckIn,
  evaluateLateArrival,
  evaluateWrongBranch,
  assertSessionAcceptsCheckIn,
  assertMemberEligible,
};
