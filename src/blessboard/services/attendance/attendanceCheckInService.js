"use strict";

/**
 * Check-in orchestration — MANUAL / QR / PEAK all use validateAttendanceCheckIn.
 */

const {
  CHECK_IN_METHOD,
  ATTENDANCE_PERMISSION,
} = require("./attendanceDomainConstants");
const {
  validateAttendanceCheckIn,
  RESULT: VALIDATION_RESULT,
} = require("./attendanceValidationService");
const {
  issueAttendanceToken,
  verifyAttendanceToken,
} = require("./attendanceSessionQrToken");
const {
  SHARED_AUDIT_OUTCOME,
  recordSharedPlatformAudit,
} = require("../../../platform/audit");

const RESULT = Object.freeze({
  ...VALIDATION_RESULT,
  OK: "ok",
});

async function auditCheckIn(db, payload) {
  return recordSharedPlatformAudit(db, {
    actionKey: payload.actionKey || "attendance.check_in",
    outcome: payload.outcome || SHARED_AUDIT_OUTCOME.SUCCESS,
    productCode: "blessboard",
    organizationId: payload.organizationId,
    churchId: payload.churchId,
    branchId: payload.branchId || null,
    actorUserId: payload.actorUserId || null,
    entityType: "attendance_check_in",
    entityId: payload.checkInId || null,
    metadata: payload.metadata || {},
  });
}

async function loadContext(db, input, deps) {
  const sessionStore = deps && deps.sessionStore;
  const memberStore = deps && deps.memberStore;
  const checkInStore = deps && deps.checkInStore;
  const tokenStore = deps && deps.tokenStore;

  const sessionId = String((input && input.sessionId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();

  let session =
    input.session ||
    (sessionStore && sessionStore.findById
      ? await sessionStore.findById(db, sessionId)
      : null);
  if (session && session.organization_id && !session.organizationId) {
    const { mapSession } = require("./attendanceSessionService");
    session = mapSession(session);
  }

  let member =
    input.member ||
    (memberStore && memberStore.findById
      ? await memberStore.findById(db, memberId)
      : null);

  let existingCheckIn =
    input.existingCheckIn !== undefined
      ? input.existingCheckIn
      : checkInStore && checkInStore.findActiveBySessionMember
        ? await checkInStore.findActiveBySessionMember(db, {
            sessionId: session && session.id,
            memberId: member && member.id,
          })
        : null;

  return { session, member, existingCheckIn, tokenStore, checkInStore };
}

async function persistDecision(db, ctx, decision, deps) {
  const checkInStore = deps && deps.checkInStore;
  if (!checkInStore || typeof checkInStore.insert !== "function") {
    return {
      id: require("node:crypto").randomUUID(),
      ...decision,
    };
  }
  return checkInStore.insert(db, {
    organizationId: ctx.organizationId,
    churchId: ctx.churchId,
    sessionId: decision.sessionId,
    memberId: decision.memberId,
    membershipBranchId: decision.membershipBranchId,
    attendanceBranchId: decision.attendanceBranchId,
    method: decision.method,
    status: decision.status,
    lateArrival: decision.lateArrival,
    wrongBranch: decision.wrongBranch,
    needsReview: decision.needsReview,
    checkedInAt: decision.checkedInAt,
    checkedInByUserId: decision.checkedInByUserId,
    metadataJson: decision.metadataJson || {},
  });
}

/**
 * Shared apply path after validation.
 */
async function applyValidatedCheckIn(db, input, validation, deps) {
  if (!validation.ok) return validation;

  if (validation.duplicate) {
    return {
      ok: true,
      code: RESULT.DUPLICATE_ATTENDANCE,
      duplicate: true,
      checkIn: validation.existing,
      method: validation.method,
    };
  }

  const decision = validation.decision;
  const checkIn = await persistDecision(
    db,
    {
      organizationId: input.organizationId,
      churchId: input.churchId,
    },
    decision,
    deps
  );

  await auditCheckIn(db, {
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: decision.attendanceBranchId,
    actorUserId: input.actorUserId,
    checkInId: checkIn.id,
    metadata: {
      method: decision.method,
      session_id: decision.sessionId,
      member_id: decision.memberId,
      membership_branch_id: decision.membershipBranchId,
      attendance_branch_id: decision.attendanceBranchId,
      late_arrival: decision.lateArrival,
      wrong_branch: decision.wrongBranch,
      needs_review: decision.needsReview,
      status: decision.status,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    duplicate: false,
    checkIn,
    method: decision.method,
    lateArrival: decision.lateArrival,
    wrongBranch: decision.wrongBranch,
  };
}

async function checkInManual(db, input, deps) {
  const ctx = await loadContext(db, input, deps);
  const validation = await validateAttendanceCheckIn(
    db,
    {
      method: CHECK_IN_METHOD.MANUAL,
      organizationId: input.organizationId,
      churchId: input.churchId,
      actorUserId: input.actorUserId,
      session: ctx.session,
      member: ctx.member,
      existingCheckIn: ctx.existingCheckIn,
      checkedInAt: input.checkedInAt,
      wrongBranchPolicy: input.wrongBranchPolicy,
    },
    deps
  );
  return applyValidatedCheckIn(db, input, validation, deps);
}

async function checkInQr(db, input, deps) {
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

  // Resolve member from server-side claim mapping when token is member_claim.
  let memberId = input.memberId;
  if (verified.kind === "member_claim") {
    const tokenStore = deps && deps.tokenStore;
    if (!tokenStore || typeof tokenStore.findByHash !== "function") {
      return { ok: false, code: RESULT.INVALID_QR };
    }
    const stored = await tokenStore.findByHash(db, verified.tokenHash);
    if (
      !stored ||
      stored.revokedAt ||
      stored.revoked_at ||
      (stored.expiresAt || stored.expires_at) < (input.checkedInAt || new Date())
    ) {
      return {
        ok: false,
        code:
          stored && (stored.expiresAt || stored.expires_at) < new Date()
            ? RESULT.EXPIRED_QR
            : RESULT.INVALID_QR,
      };
    }
    memberId = stored.memberId || stored.member_id;
  }

  const ctx = await loadContext(
    db,
    { ...input, memberId, sessionId: verified.sessionId },
    deps
  );

  const validation = await validateAttendanceCheckIn(
    db,
    {
      method: CHECK_IN_METHOD.QR,
      organizationId: input.organizationId,
      churchId: input.churchId,
      actorUserId: input.actorUserId,
      session: ctx.session,
      member: ctx.member,
      existingCheckIn: ctx.existingCheckIn,
      qrToken: input.qrToken,
      verifiedQr: verified,
      checkedInAt: input.checkedInAt,
      wrongBranchPolicy: input.wrongBranchPolicy,
    },
    deps
  );
  return applyValidatedCheckIn(db, input, validation, deps);
}

/**
 * PEAK = high-throughput check-in method; same validation engine as MANUAL/QR.
 */
async function checkInPeak(db, input, deps) {
  const ctx = await loadContext(db, input, deps);
  const validation = await validateAttendanceCheckIn(
    db,
    {
      method: CHECK_IN_METHOD.PEAK,
      organizationId: input.organizationId,
      churchId: input.churchId,
      actorUserId: input.actorUserId,
      session: ctx.session,
      member: ctx.member,
      existingCheckIn: ctx.existingCheckIn,
      qrToken: input.qrToken || null,
      checkedInAt: input.checkedInAt,
      wrongBranchPolicy: input.wrongBranchPolicy,
    },
    deps
  );
  return applyValidatedCheckIn(db, input, validation, deps);
}

/**
 * Issue opaque session QR (no PII).
 */
async function issueSessionCheckInQr(db, input, deps) {
  const issued = issueAttendanceToken(
    {
      kind: "session",
      sessionId: input.sessionId,
      ttlSeconds: input.ttlSeconds,
      now: input.now,
    },
    deps
  );
  if (!issued.ok) return issued;

  if (deps && deps.tokenStore && typeof deps.tokenStore.insert === "function") {
    await deps.tokenStore.insert(db, {
      organizationId: input.organizationId,
      churchId: input.churchId,
      sessionId: input.sessionId,
      tokenKind: "session",
      tokenHash: issued.tokenHash,
      memberId: null,
      expiresAt: issued.expiresAt,
      createdByUserId: input.actorUserId,
    });
  }

  return {
    ok: true,
    token: issued.token,
    expiresAt: issued.expiresAt,
    sessionId: issued.sessionId,
  };
}

/**
 * Issue opaque member claim QR for a session — member id stored server-side only.
 */
async function issueMemberCheckInClaimQr(db, input, deps) {
  const issued = issueAttendanceToken(
    {
      kind: "member_claim",
      sessionId: input.sessionId,
      memberId: input.memberId,
      ttlSeconds: input.ttlSeconds,
      now: input.now,
    },
    deps
  );
  if (!issued.ok) return issued;

  if (deps && deps.tokenStore && typeof deps.tokenStore.insert === "function") {
    await deps.tokenStore.insert(db, {
      organizationId: input.organizationId,
      churchId: input.churchId,
      sessionId: input.sessionId,
      tokenKind: "member_claim",
      tokenHash: issued.tokenHash,
      memberId: input.memberId,
      expiresAt: issued.expiresAt,
      createdByUserId: input.actorUserId,
    });
  }

  return {
    ok: true,
    token: issued.token,
    expiresAt: issued.expiresAt,
    sessionId: issued.sessionId,
  };
}

module.exports = {
  RESULT,
  ATTENDANCE_PERMISSION,
  checkInManual,
  checkInQr,
  checkInPeak,
  issueSessionCheckInQr,
  issueMemberCheckInClaimQr,
  applyValidatedCheckIn,
};
