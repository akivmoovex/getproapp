"use strict";

/**
 * Reusable request / approval workflow (V2.04 Phase 7).
 *
 * Platform-owned: statuses, self-approval denial, decision history, duplicates.
 * Product adapters own: target semantics, resource scope, post-decision effects.
 *
 * Does NOT require BlessBoard or ActiveClinic.
 */

const {
  APPROVAL_REQUEST_STATUS,
  APPROVAL_TRANSITIONS,
  APPROVAL_REQUEST_CODE,
  REQUESTER_SUBJECT_TYPE,
} = require("./approvalRequestConstants");
const repo = require("./approvalRequestRepository");
const {
  SHARED_AUDIT_OUTCOME,
  recordSharedPlatformAudit,
} = require("../audit");

const RESULT = APPROVAL_REQUEST_CODE;

function uuidEqual(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function resolveStore(deps) {
  return (deps && deps.store) || repo;
}

/**
 * Server-side rule: requester must not approve their own request.
 */
function assertNotSelfApproval(request, actorUserId) {
  const actor = String(actorUserId || "").trim();
  if (!actor) return { ok: false, code: RESULT.INVALID_INPUT };
  if (request.requesterUserId && uuidEqual(request.requesterUserId, actor)) {
    return { ok: false, code: RESULT.SELF_APPROVAL_DENIED };
  }
  // When requester is a user subject, subject id is also blocked.
  if (
    request.requesterSubjectType === REQUESTER_SUBJECT_TYPE.USER &&
    uuidEqual(request.requesterSubjectId, actor)
  ) {
    return { ok: false, code: RESULT.SELF_APPROVAL_DENIED };
  }
  return { ok: true };
}

async function createApprovalRequest(db, input, deps) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const productCode = String((input && input.productCode) || "")
    .trim()
    .toLowerCase();
  const requestType = String((input && input.requestType) || "").trim();
  const requesterSubjectId = String((input && input.requesterSubjectId) || "").trim();
  const targetType = String((input && input.targetType) || "").trim();
  const targetId = String((input && input.targetId) || "").trim();
  const requesterSubjectType = String(
    (input && input.requesterSubjectType) || REQUESTER_SUBJECT_TYPE.USER
  ).trim();

  if (
    !organizationId ||
    !productCode ||
    !requestType ||
    !requesterSubjectId ||
    !targetType ||
    !targetId
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const store = resolveStore(deps);
  const dup = await store.findPendingDuplicate(db, {
    organizationId,
    productCode,
    requestType,
    requesterSubjectId,
    targetType,
    targetId,
  });
  if (dup) {
    return {
      ok: false,
      code: RESULT.DUPLICATE_PENDING,
      request: dup,
    };
  }

  const request = await store.insertApprovalRequest(db, {
    organizationId,
    productCode,
    requestType,
    requesterSubjectType,
    requesterSubjectId,
    requesterUserId: input.requesterUserId || null,
    targetType,
    targetId,
    status: APPROVAL_REQUEST_STATUS.PENDING,
    assignedReviewerUserId: input.assignedReviewerUserId || null,
    payload: input.payload || {},
  });

  await store.insertDecision(db, {
    approvalRequestId: request.id,
    organizationId,
    actorUserId: input.requesterUserId || requesterSubjectId,
    fromStatus: APPROVAL_REQUEST_STATUS.PENDING,
    toStatus: APPROVAL_REQUEST_STATUS.PENDING,
    reason: "created",
    metadata: { event: "created", request_type: requestType },
  });

  if (deps && typeof deps.onCreated === "function") {
    const side = await deps.onCreated(db, { request, input });
    if (side && side.ok === false) {
      return { ok: false, code: RESULT.ADAPTER_FAILED, detail: side };
    }
  }

  await recordSharedPlatformAudit(db, {
    actionKey: "approval_request.created",
    outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
    productCode,
    organizationId,
    actorUserId: input.requesterUserId || null,
    entityType: "approval_request",
    entityId: request.id,
    metadata: {
      request_type: requestType,
      target_type: targetType,
      target_id: targetId,
      status: APPROVAL_REQUEST_STATUS.PENDING,
    },
  });

  return {
    ok: true,
    code: RESULT.OK,
    request,
  };
}

async function decideApprovalRequest(db, input, deps) {
  const requestId = String((input && input.requestId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const toStatus = String((input && input.toStatus) || "")
    .trim()
    .toLowerCase();
  const reason = input.reason != null ? String(input.reason).trim() : null;

  if (!requestId || !actorUserId || !organizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  if (
    toStatus !== APPROVAL_REQUEST_STATUS.APPROVED &&
    toStatus !== APPROVAL_REQUEST_STATUS.REJECTED &&
    toStatus !== APPROVAL_REQUEST_STATUS.CANCELLED
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "to_status" };
  }

  const store = resolveStore(deps);
  const request = await store.findApprovalRequestById(db, requestId);
  if (!request) return { ok: false, code: RESULT.NOT_FOUND };
  if (request.organizationId !== organizationId) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }
  if (request.status !== APPROVAL_REQUEST_STATUS.PENDING) {
    return { ok: false, code: RESULT.NOT_PENDING, request };
  }

  const allowed = APPROVAL_TRANSITIONS[request.status] || [];
  if (!allowed.includes(toStatus)) {
    return { ok: false, code: RESULT.INVALID_TRANSITION };
  }

  // Cancel may be by requester; approve/reject never by requester.
  if (
    toStatus === APPROVAL_REQUEST_STATUS.APPROVED ||
    toStatus === APPROVAL_REQUEST_STATUS.REJECTED
  ) {
    const self = assertNotSelfApproval(request, actorUserId);
    if (!self.ok) return self;
  }

  if (typeof (deps && deps.authorizeDecision) === "function") {
    const authz = await deps.authorizeDecision(db, {
      request,
      actorUserId,
      toStatus,
      input,
    });
    if (!authz || authz.ok !== true) {
      return {
        ok: false,
        code:
          (authz && authz.code) ||
          RESULT.UNAUTHORIZED,
        detail: authz,
      };
    }
  }

  const now = input.now instanceof Date ? input.now : new Date();
  const patch = {
    id: requestId,
    status: toStatus,
    decisionReason: reason,
  };
  if (toStatus === APPROVAL_REQUEST_STATUS.CANCELLED) {
    patch.cancelledAt = now;
    patch.cancelledByUserId = actorUserId;
  } else {
    patch.decidedAt = now;
    patch.decidedByUserId = actorUserId;
  }

  const updated = await store.updateApprovalRequestStatus(db, patch);

  await store.insertDecision(db, {
    approvalRequestId: requestId,
    organizationId,
    actorUserId,
    fromStatus: APPROVAL_REQUEST_STATUS.PENDING,
    toStatus,
    reason,
    metadata: {
      event: "decision",
      target_type: request.targetType,
      target_id: request.targetId,
    },
  });

  if (typeof (deps && deps.onDecision) === "function") {
    const side = await deps.onDecision(db, {
      request: updated,
      previous: request,
      toStatus,
      actorUserId,
      reason,
      input,
    });
    if (side && side.ok === false) {
      return { ok: false, code: RESULT.ADAPTER_FAILED, detail: side };
    }
  }

  await recordSharedPlatformAudit(db, {
    actionKey: `approval_request.${toStatus}`,
    outcome: SHARED_AUDIT_OUTCOME.SUCCESS,
    productCode: request.productCode,
    organizationId,
    actorUserId,
    entityType: "approval_request",
    entityId: requestId,
    metadata: {
      request_type: request.requestType,
      target_type: request.targetType,
      target_id: request.targetId,
      from_status: APPROVAL_REQUEST_STATUS.PENDING,
      to_status: toStatus,
      reason: reason || null,
    },
  });

  return { ok: true, code: RESULT.OK, request: updated };
}

async function approveApprovalRequest(db, input, deps) {
  return decideApprovalRequest(
    db,
    { ...input, toStatus: APPROVAL_REQUEST_STATUS.APPROVED },
    deps
  );
}

async function rejectApprovalRequest(db, input, deps) {
  return decideApprovalRequest(
    db,
    { ...input, toStatus: APPROVAL_REQUEST_STATUS.REJECTED },
    deps
  );
}

async function cancelApprovalRequest(db, input, deps) {
  return decideApprovalRequest(
    db,
    { ...input, toStatus: APPROVAL_REQUEST_STATUS.CANCELLED },
    deps
  );
}

module.exports = {
  RESULT,
  APPROVAL_REQUEST_STATUS,
  assertNotSelfApproval,
  createApprovalRequest,
  decideApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
  cancelApprovalRequest,
};
