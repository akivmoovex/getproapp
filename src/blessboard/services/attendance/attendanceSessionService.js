"use strict";

/**
 * Session lifecycle for BlessBoard V2.04 attendance.
 * DRAFT → OPEN → CLOSED → LOCKED
 */

const {
  SESSION_STATUS,
  SESSION_STATUSES,
  WRONG_BRANCH_POLICY,
  ATTENDANCE_PERMISSION,
} = require("./attendanceDomainConstants");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  UNAUTHORIZED: "unauthorized",
  NOT_FOUND: "session_not_found",
  INVALID_TRANSITION: "invalid_transition",
});

const ALLOWED_TRANSITIONS = Object.freeze({
  [SESSION_STATUS.DRAFT]: [SESSION_STATUS.OPEN],
  [SESSION_STATUS.OPEN]: [SESSION_STATUS.CLOSED],
  [SESSION_STATUS.CLOSED]: [SESSION_STATUS.LOCKED],
  [SESSION_STATUS.LOCKED]: [],
});

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

async function requirePerm(db, authorize, input, permission) {
  const authz = await authorize(db, {
    permission,
    actorUserId: input.actorUserId,
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId,
  });
  if (!authz || authz.allowed !== true) {
    return {
      ok: false,
      code: RESULT.UNAUTHORIZED,
      reasonCode: (authz && authz.reasonCode) || "unauthorized",
    };
  }
  return { ok: true, authz };
}

function normalizeSessionInput(input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const sessionDate = String((input && input.sessionDate) || "").trim();
  const startTimeRaw = input && input.startTime;
  if (!organizationId || !churchId || !branchId || !actorUserId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "session_date" };
  }
  const startTime =
    startTimeRaw instanceof Date
      ? startTimeRaw
      : new Date(String(startTimeRaw || ""));
  if (Number.isNaN(startTime.getTime())) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "start_time" };
  }
  const lateThresholdMinutes =
    input.lateThresholdMinutes != null
      ? Number(input.lateThresholdMinutes)
      : 15;
  if (
    !Number.isFinite(lateThresholdMinutes) ||
    lateThresholdMinutes < 0 ||
    lateThresholdMinutes > 240
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "late_threshold" };
  }
  const wrongBranchPolicy = String(
    input.wrongBranchPolicy || WRONG_BRANCH_POLICY.RECORD
  )
    .trim()
    .toLowerCase();
  if (!Object.values(WRONG_BRANCH_POLICY).includes(wrongBranchPolicy)) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "wrong_branch_policy" };
  }
  return {
    ok: true,
    value: {
      organizationId,
      churchId,
      branchId,
      actorUserId,
      sessionDate,
      startTime,
      lateThresholdMinutes,
      wrongBranchPolicy,
      serviceEventRef:
        input.serviceEventRef != null
          ? String(input.serviceEventRef).trim().slice(0, 120) || null
          : null,
      attendanceEventId: input.attendanceEventId || null,
      title: String(input.title || "").trim().slice(0, 200),
      notes:
        input.notes != null
          ? String(input.notes).trim().slice(0, 2000) || null
          : null,
      status: SESSION_STATUS.DRAFT,
    },
  };
}

async function createAttendanceSession(db, input, deps) {
  const normalized = normalizeSessionInput(input);
  if (!normalized.ok) return normalized;

  const authorize = createAuthorize(deps);
  const authz = await requirePerm(
    db,
    authorize,
    normalized.value,
    ATTENDANCE_PERMISSION.MANAGE_SESSION
  );
  if (!authz.ok) return authz;

  const store =
    (deps && deps.sessionStore) ||
    require("../../repositories/attendanceSessionRepository").createDbSessionStore();

  const row = await store.insert(db, {
    ...normalized.value,
    createdByUserId: normalized.value.actorUserId,
    updatedByUserId: normalized.value.actorUserId,
  });

  return { ok: true, code: RESULT.OK, session: mapSession(row) };
}

function mapSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId || row.organization_id,
    churchId: row.churchId || row.church_id,
    branchId: row.branchId || row.branch_id,
    serviceEventRef: row.serviceEventRef || row.service_event_ref || null,
    attendanceEventId: row.attendanceEventId || row.attendance_event_id || null,
    sessionDate: row.sessionDate || row.session_date,
    startTime: row.startTime || row.start_time,
    lateThresholdMinutes:
      row.lateThresholdMinutes != null
        ? row.lateThresholdMinutes
        : row.late_threshold_minutes,
    status: row.status,
    title: row.title || "",
    notes: row.notes || null,
    wrongBranchPolicy:
      row.wrongBranchPolicy || row.wrong_branch_policy || WRONG_BRANCH_POLICY.RECORD,
    openedAt: row.openedAt || row.opened_at || null,
    closedAt: row.closedAt || row.closed_at || null,
    lockedAt: row.lockedAt || row.locked_at || null,
  };
}

async function transitionAttendanceSession(db, input, deps) {
  const sessionId = String((input && input.sessionId) || "").trim();
  const toStatus = String((input && input.toStatus) || "")
    .trim()
    .toLowerCase();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId =
    input && input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  if (!sessionId || !SESSION_STATUSES.includes(toStatus) || !actorUserId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const authorize = createAuthorize(deps);
  const authz = await requirePerm(
    db,
    authorize,
    {
      actorUserId,
      organizationId,
      churchId,
      branchId,
    },
    ATTENDANCE_PERMISSION.MANAGE_SESSION
  );
  if (!authz.ok) return authz;

  const store =
    (deps && deps.sessionStore) ||
    require("../../repositories/attendanceSessionRepository").createDbSessionStore();
  if (!store || typeof store.findById !== "function") {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  const existing = mapSession(await store.findById(db, sessionId));
  if (!existing) return { ok: false, code: RESULT.NOT_FOUND };
  if (
    existing.organizationId !== organizationId ||
    existing.churchId !== churchId
  ) {
    return { ok: false, code: RESULT.UNAUTHORIZED, reason: "tenant_mismatch" };
  }
  if (branchId && existing.branchId !== branchId) {
    return { ok: false, code: RESULT.UNAUTHORIZED, reason: "branch_mismatch" };
  }

  const allowed = ALLOWED_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(toStatus)) {
    return {
      ok: false,
      code: RESULT.INVALID_TRANSITION,
      from: existing.status,
      to: toStatus,
    };
  }

  const patch = {
    status: toStatus,
    updatedByUserId: actorUserId,
  };
  const now = input.now instanceof Date ? input.now : new Date();
  if (toStatus === SESSION_STATUS.OPEN) patch.openedAt = now;
  if (toStatus === SESSION_STATUS.CLOSED) patch.closedAt = now;
  if (toStatus === SESSION_STATUS.LOCKED) patch.lockedAt = now;

  const updated = mapSession(await store.update(db, { sessionId, patch }));
  return { ok: true, code: RESULT.OK, session: updated };
}

async function listAttendanceSessionsForTenant(db, input, deps) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const branchId =
    input && input.branchId != null ? String(input.branchId).trim() : null;
  if (!organizationId || !churchId || !actorUserId) {
    return { ok: false, code: RESULT.INVALID_INPUT, sessions: [] };
  }

  const authorize = createAuthorize(deps);
  const authz = await requirePerm(
    db,
    authorize,
    { actorUserId, organizationId, churchId, branchId },
    ATTENDANCE_PERMISSION.VIEW
  );
  if (!authz.ok) return { ...authz, sessions: [] };

  const store =
    (deps && deps.sessionStore) ||
    require("../../repositories/attendanceSessionRepository").createDbSessionStore();
  const rows =
    store && typeof store.list === "function"
      ? await store.list(db, {
          organizationId,
          churchId,
          branchId,
          status: input.status || null,
          fromDate: input.fromDate || null,
          toDate: input.toDate || null,
          limit: input.limit,
        })
      : [];
  return {
    ok: true,
    code: RESULT.OK,
    sessions: (rows || []).map(mapSession),
  };
}

async function getAttendanceSessionForTenant(db, input, deps) {
  const sessionId = String((input && input.sessionId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const branchId =
    input && input.branchId != null ? String(input.branchId).trim() : null;
  if (!sessionId || !organizationId || !churchId || !actorUserId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const authorize = createAuthorize(deps);
  const authz = await requirePerm(
    db,
    authorize,
    { actorUserId, organizationId, churchId, branchId },
    ATTENDANCE_PERMISSION.VIEW
  );
  if (!authz.ok) return authz;

  const store =
    (deps && deps.sessionStore) ||
    require("../../repositories/attendanceSessionRepository").createDbSessionStore();
  const existing = mapSession(await store.findById(db, sessionId));
  if (!existing) return { ok: false, code: RESULT.NOT_FOUND };
  if (
    existing.organizationId !== organizationId ||
    existing.churchId !== churchId
  ) {
    return { ok: false, code: RESULT.UNAUTHORIZED, reason: "tenant_mismatch" };
  }
  if (branchId && existing.branchId !== branchId) {
    return { ok: false, code: RESULT.UNAUTHORIZED, reason: "branch_mismatch" };
  }
  return { ok: true, code: RESULT.OK, session: existing };
}

module.exports = {
  RESULT,
  ALLOWED_TRANSITIONS,
  createAttendanceSession,
  transitionAttendanceSession,
  listAttendanceSessionsForTenant,
  getAttendanceSessionForTenant,
  mapSession,
  normalizeSessionInput,
};
