"use strict";

/**
 * Attendance corrections — never silent overwrite.
 * Requires permission, original, corrected, actor, timestamp, reason.
 * Preserves original check-in method and checked-in time.
 */

const { ATTENDANCE_PERMISSION } = require("./attendanceDomainConstants");
const {
  SHARED_AUDIT_OUTCOME,
  recordSharedPlatformAudit,
} = require("../../../platform/audit");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  UNAUTHORIZED: "unauthorized",
  NOT_FOUND: "check_in_not_found",
  SESSION_LOCKED: "session_locked",
  ORIGINAL_MISMATCH: "original_mismatch",
});

/** Fields that may be corrected — method + checked_in_at are immutable. */
const CORRECTABLE_FIELDS = Object.freeze([
  "status",
  "lateArrival",
  "wrongBranch",
  "needsReview",
]);

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

function snapshotCheckIn(row) {
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    method: row.method,
    checkedInAt: row.checkedInAt || row.checked_in_at || null,
    lateArrival:
      row.lateArrival != null ? row.lateArrival === true : row.late_arrival === true,
    wrongBranch:
      row.wrongBranch != null ? row.wrongBranch === true : row.wrong_branch === true,
    needsReview:
      row.needsReview != null ? row.needsReview === true : row.needs_review === true,
    memberId: row.memberId || row.member_id || null,
    sessionId: row.sessionId || row.session_id || null,
    membershipBranchId:
      row.membershipBranchId != null
        ? row.membershipBranchId
        : row.membership_branch_id || null,
    attendanceBranchId:
      row.attendanceBranchId || row.attendance_branch_id || null,
  };
}

/**
 * Strip immutable fields from corrected payload — never overwrite method/time.
 */
function sanitizeCorrectedValue(correctedValue, originalSnapshot) {
  const src = correctedValue && typeof correctedValue === "object" ? correctedValue : {};
  const out = {};
  for (const key of CORRECTABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = src[key];
    }
  }
  // Explicitly preserve originals (not applied as updates, but recorded in audit)
  out.method = originalSnapshot.method;
  out.checkedInAt = originalSnapshot.checkedInAt;
  return out;
}

function originalsMatch(provided, actual) {
  if (!provided || !actual) return false;
  if (String(provided.status || "") !== String(actual.status || "")) return false;
  if (Boolean(provided.lateArrival) !== Boolean(actual.lateArrival)) return false;
  if (Boolean(provided.wrongBranch) !== Boolean(actual.wrongBranch)) return false;
  return true;
}

/**
 * @param {{
 *   checkInId: string,
 *   organizationId: string,
 *   churchId: string,
 *   actorUserId: string,
 *   originalValue: object,
 *   correctedValue: object,
 *   reason: string,
 *   sessionStatus?: string,
 *   branchId?: string,
 * }} input
 */
async function correctAttendanceCheckIn(db, input, deps) {
  const checkInId = String((input && input.checkInId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const reason = String((input && input.reason) || "").trim();
  const originalValue = input && input.originalValue;
  const correctedValue = input && input.correctedValue;

  if (
    !checkInId ||
    !actorUserId ||
    !organizationId ||
    !churchId ||
    !originalValue ||
    !correctedValue ||
    reason.length < 3
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const authorize = createAuthorize(deps);
  const authz = await authorize(db, {
    permission: ATTENDANCE_PERMISSION.CORRECT,
    actorUserId,
    organizationId,
    churchId,
    branchId: input.branchId || null,
  });
  if (!authz || authz.allowed !== true) {
    return {
      ok: false,
      code: RESULT.UNAUTHORIZED,
      reasonCode: (authz && authz.reasonCode) || "unauthorized",
    };
  }

  let checkIn = input.checkIn || null;
  if (
    !checkIn &&
    deps &&
    deps.checkInStore &&
    typeof deps.checkInStore.findById === "function"
  ) {
    checkIn = await deps.checkInStore.findById(db, checkInId);
  }

  let sessionStatus = input.sessionStatus;
  if (
    sessionStatus == null &&
    checkIn &&
    deps &&
    deps.sessionStore &&
    typeof deps.sessionStore.findById === "function"
  ) {
    const session = await deps.sessionStore.findById(
      db,
      checkIn.sessionId || checkIn.session_id
    );
    sessionStatus = session && (session.status || session.status);
  }

  if (String(sessionStatus || "").toLowerCase() === "locked") {
    return { ok: false, code: RESULT.SESSION_LOCKED };
  }

  if (checkIn) {
    if (
      String(checkIn.organizationId || checkIn.organization_id) !== organizationId ||
      String(checkIn.churchId || checkIn.church_id) !== churchId
    ) {
      return { ok: false, code: RESULT.UNAUTHORIZED, reason: "tenant_mismatch" };
    }
    const actual = snapshotCheckIn(checkIn);
    if (!originalsMatch(originalValue, actual)) {
      return {
        ok: false,
        code: RESULT.ORIGINAL_MISMATCH,
        actual,
      };
    }
  } else if (deps && deps.checkInStore && typeof deps.checkInStore.findById === "function") {
    return { ok: false, code: RESULT.NOT_FOUND };
  }

  const originalSnapshot = checkIn
    ? snapshotCheckIn(checkIn)
    : snapshotCheckIn({ ...originalValue, id: checkInId });

  const safeCorrected = sanitizeCorrectedValue(correctedValue, originalSnapshot);
  if (!safeCorrected.status) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "corrected_status" };
  }

  const now = input.now instanceof Date ? input.now : new Date();
  const correction = {
    id: require("node:crypto").randomUUID(),
    organizationId,
    churchId,
    checkInId,
    actorUserId,
    originalValue: originalSnapshot,
    correctedValue: safeCorrected,
    reason,
    createdAt: now,
  };

  if (deps && deps.correctionStore && typeof deps.correctionStore.insert === "function") {
    const saved = await deps.correctionStore.insert(db, correction);
    Object.assign(correction, saved || {});
  }

  if (deps && deps.checkInStore && typeof deps.checkInStore.applyCorrection === "function") {
    await deps.checkInStore.applyCorrection(db, {
      checkInId,
      correctedValue: {
        status: safeCorrected.status,
        lateArrival: safeCorrected.lateArrival,
        wrongBranch: safeCorrected.wrongBranch,
        needsReview: safeCorrected.needsReview,
      },
      actorUserId,
      // method + checkedInAt intentionally omitted — immutable
    });
  }

  await recordSharedPlatformAudit(db, {
    actionKey: "attendance.correct",
    outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
    productCode: "blessboard",
    organizationId,
    churchId,
    branchId: input.branchId || null,
    actorUserId,
    entityType: "attendance_correction",
    entityId: correction.id,
    metadata: {
      check_in_id: checkInId,
      original_value: originalSnapshot,
      corrected_value: safeCorrected,
      reason,
      corrected_at: now.toISOString(),
      preserved_method: originalSnapshot.method,
      preserved_checked_in_at: originalSnapshot.checkedInAt,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    correction: {
      id: correction.id,
      checkInId,
      actorUserId,
      originalValue: originalSnapshot,
      correctedValue: safeCorrected,
      reason,
      timestamp: now.toISOString(),
    },
  };
}

module.exports = {
  RESULT,
  CORRECTABLE_FIELDS,
  correctAttendanceCheckIn,
  snapshotCheckIn,
  sanitizeCorrectedValue,
};
