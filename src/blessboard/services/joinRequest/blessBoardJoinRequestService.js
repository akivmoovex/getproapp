"use strict";

/**
 * BlessBoard ministry / department join via platform approval workflow.
 *
 * Reuses ministry_memberships pending rows; adds department pending join.
 * Does NOT immediately activate membership on create.
 * No Stitch UI.
 */

const {
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
  cancelApprovalRequest,
  APPROVAL_REQUEST_STATUS,
  APPROVAL_REQUEST_CODE,
  REQUESTER_SUBJECT_TYPE,
} = require("../../../platform/requestApproval");
const {
  JOIN_REQUEST_TYPE,
  JOIN_TARGET_TYPE,
  JOIN_PERMISSION,
  assertResourceScopedReview,
} = require("./blessBoardJoinRequestConstants");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  DUPLICATE: "duplicate_pending_request",
  UNAUTHORIZED: "unauthorized",
  RESOURCE_SCOPE_DENIED: "resource_scope_denied",
  SELF_APPROVAL_DENIED: "self_approval_denied",
  TENANT_MISMATCH: "tenant_mismatch",
  NOT_PENDING: "not_pending",
  MEMBERSHIP_CREATE_FAILED: "membership_create_failed",
  REASON_REQUIRED: "reason_required",
});

function createMemoryMembershipStore() {
  const ministry = new Map();
  const department = new Map();
  return {
    async findOpenMinistry(_db, memberId, ministryId) {
      for (const row of ministry.values()) {
        if (
          row.memberId === memberId &&
          row.ministryId === ministryId &&
          (row.status === "pending" || row.status === "active")
        ) {
          return row;
        }
      }
      return null;
    },
    async insertMinistry(_db, row) {
      const saved = {
        id: require("node:crypto").randomUUID(),
        status: "pending",
        ...row,
      };
      ministry.set(saved.id, saved);
      return saved;
    },
    async updateMinistry(_db, id, patch) {
      const cur = ministry.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      ministry.set(id, next);
      return next;
    },
    async findMinistryByApprovalRequest(_db, approvalRequestId) {
      for (const row of ministry.values()) {
        if (row.approvalRequestId === approvalRequestId) return row;
      }
      return null;
    },
    async findOpenDepartment(_db, memberId, departmentId) {
      for (const row of department.values()) {
        if (
          row.memberId === memberId &&
          row.departmentId === departmentId &&
          (row.status === "pending" || row.status === "active")
        ) {
          return row;
        }
      }
      return null;
    },
    async insertDepartment(_db, row) {
      const saved = {
        id: require("node:crypto").randomUUID(),
        status: "pending",
        ...row,
      };
      department.set(saved.id, saved);
      return saved;
    },
    async updateDepartment(_db, id, patch) {
      const cur = department.get(id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      department.set(id, next);
      return next;
    },
    async findDepartmentByApprovalRequest(_db, approvalRequestId) {
      for (const row of department.values()) {
        if (row.approvalRequestId === approvalRequestId) return row;
      }
      return null;
    },
  };
}

/**
 * Postgres-backed membership store for HTTP / production paths.
 * Links memberships via approval_request_id (migration 122).
 */
function createPgMembershipStore() {
  return {
    async findOpenMinistry(db, memberId, ministryId) {
      const { rows } = await db.query(
        `SELECT id, organization_id, church_id, branch_id, ministry_id, member_id,
                status, message, approval_request_id, assignment_source,
                joined_at, created_at, updated_at
           FROM blessboard.ministry_memberships
          WHERE member_id = $1 AND ministry_id = $2
            AND status IN ('pending', 'active')
          LIMIT 1`,
        [memberId, ministryId]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organization_id,
        churchId: row.church_id,
        branchId: row.branch_id,
        ministryId: row.ministry_id,
        memberId: row.member_id,
        status: row.status,
        message: row.message,
        approvalRequestId: row.approval_request_id,
        assignmentSource: row.assignment_source,
        joinedAt: row.joined_at,
      };
    },
    async insertMinistry(db, row) {
      const { rows } = await db.query(
        `INSERT INTO blessboard.ministry_memberships
           (organization_id, church_id, branch_id, ministry_id, member_id, status,
            message, approval_request_id, assignment_source, joined_at)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,NULL)
         RETURNING id, organization_id, church_id, branch_id, ministry_id, member_id,
                   status, message, approval_request_id, assignment_source, joined_at`,
        [
          row.organizationId,
          row.churchId,
          row.branchId || null,
          row.ministryId,
          row.memberId,
          row.message || null,
          row.approvalRequestId || null,
          row.assignmentSource || "self_join",
        ]
      );
      const saved = rows[0];
      return {
        id: saved.id,
        organizationId: saved.organization_id,
        churchId: saved.church_id,
        branchId: saved.branch_id,
        ministryId: saved.ministry_id,
        memberId: saved.member_id,
        status: saved.status,
        message: saved.message,
        approvalRequestId: saved.approval_request_id,
        assignmentSource: saved.assignment_source,
        joinedAt: saved.joined_at,
      };
    },
    async updateMinistry(db, id, patch) {
      const { rows } = await db.query(
        `UPDATE blessboard.ministry_memberships
            SET status = COALESCE($2, status),
                reviewed_by_user_id = COALESCE($3, reviewed_by_user_id),
                reviewed_at = COALESCE($4, reviewed_at),
                review_notes = COALESCE($5, review_notes),
                joined_at = COALESCE($6, joined_at),
                updated_at = now()
          WHERE id = $1
          RETURNING id, status, joined_at`,
        [
          id,
          patch.status || null,
          patch.reviewedByUserId || null,
          patch.reviewedAt || null,
          patch.reviewNotes !== undefined ? patch.reviewNotes : null,
          patch.joinedAt || null,
        ]
      );
      return rows[0]
        ? { id: rows[0].id, status: rows[0].status, joinedAt: rows[0].joined_at }
        : null;
    },
    async findMinistryByApprovalRequest(db, approvalRequestId) {
      const { rows } = await db.query(
        `SELECT id, organization_id, church_id, branch_id, ministry_id, member_id,
                status, message, approval_request_id, joined_at
           FROM blessboard.ministry_memberships
          WHERE approval_request_id = $1
          LIMIT 1`,
        [approvalRequestId]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organization_id,
        churchId: row.church_id,
        branchId: row.branch_id,
        ministryId: row.ministry_id,
        memberId: row.member_id,
        status: row.status,
        message: row.message,
        approvalRequestId: row.approval_request_id,
        joinedAt: row.joined_at,
      };
    },
    async findOpenDepartment(db, memberId, departmentId) {
      const { rows } = await db.query(
        `SELECT id, organization_id, church_id, branch_id, department_id, member_id,
                status, approval_request_id, joined_at
           FROM blessboard.department_memberships
          WHERE member_id = $1 AND department_id = $2
            AND status IN ('pending', 'active')
          LIMIT 1`,
        [memberId, departmentId]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organization_id,
        churchId: row.church_id,
        branchId: row.branch_id,
        departmentId: row.department_id,
        memberId: row.member_id,
        status: row.status,
        approvalRequestId: row.approval_request_id,
        joinedAt: row.joined_at,
      };
    },
    async insertDepartment(db, row) {
      const { rows } = await db.query(
        `INSERT INTO blessboard.department_memberships
           (organization_id, church_id, branch_id, department_id, member_id, status,
            approval_request_id, assignment_source, joined_at)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,'self_join',NULL)
         RETURNING id, organization_id, church_id, branch_id, department_id, member_id,
                   status, approval_request_id, joined_at`,
        [
          row.organizationId,
          row.churchId,
          row.branchId || null,
          row.departmentId,
          row.memberId,
          row.approvalRequestId || null,
        ]
      );
      const saved = rows[0];
      return {
        id: saved.id,
        organizationId: saved.organization_id,
        churchId: saved.church_id,
        branchId: saved.branch_id,
        departmentId: saved.department_id,
        memberId: saved.member_id,
        status: saved.status,
        approvalRequestId: saved.approval_request_id,
        joinedAt: saved.joined_at,
      };
    },
    async updateDepartment(db, id, patch) {
      const { rows } = await db.query(
        `UPDATE blessboard.department_memberships
            SET status = COALESCE($2, status),
                assigned_by_user_id = COALESCE($3, assigned_by_user_id),
                joined_at = COALESCE($4, joined_at),
                updated_at = now()
          WHERE id = $1
          RETURNING id, status, joined_at`,
        [
          id,
          patch.status || null,
          patch.assignedByUserId || null,
          patch.joinedAt || null,
        ]
      );
      return rows[0]
        ? { id: rows[0].id, status: rows[0].status, joinedAt: rows[0].joined_at }
        : null;
    },
    async findDepartmentByApprovalRequest(db, approvalRequestId) {
      const { rows } = await db.query(
        `SELECT id, organization_id, church_id, branch_id, department_id, member_id,
                status, approval_request_id, joined_at
           FROM blessboard.department_memberships
          WHERE approval_request_id = $1
          LIMIT 1`,
        [approvalRequestId]
      );
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organization_id,
        churchId: row.church_id,
        branchId: row.branch_id,
        departmentId: row.department_id,
        memberId: row.member_id,
        status: row.status,
        approvalRequestId: row.approval_request_id,
        joinedAt: row.joined_at,
      };
    },
  };
}

function resolveMembershipStore(deps) {
  if (deps && deps.membershipStore) return deps.membershipStore;
  if (deps && deps.usePgMembershipStore === true) return createPgMembershipStore();
  return createMemoryMembershipStore();
}

/**
 * Create ministry join: PENDING request + pending membership (not active).
 */
async function requestMinistryJoin(db, input, deps) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const ministryId = String((input && input.ministryId) || "").trim();
  const requesterUserId = input.requesterUserId
    ? String(input.requesterUserId).trim()
    : null;

  if (!organizationId || !churchId || !memberId || !ministryId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  // Never immediately add active member for request-policy join.
  if (input.forceActive === true) {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "force_active_forbidden" };
  }

  const membershipStore = resolveMembershipStore(deps);
  const existing = await membershipStore.findOpenMinistry(db, memberId, ministryId);
  if (existing) {
    return {
      ok: false,
      code: RESULT.DUPLICATE,
      membership: existing,
    };
  }

  const created = await createApprovalRequest(
    db,
    {
      organizationId,
      productCode: "blessboard",
      requestType: JOIN_REQUEST_TYPE.MINISTRY_JOIN,
      requesterSubjectType: REQUESTER_SUBJECT_TYPE.MEMBER,
      requesterSubjectId: memberId,
      requesterUserId,
      targetType: JOIN_TARGET_TYPE.MINISTRY,
      targetId: ministryId,
      assignedReviewerUserId: input.assignedReviewerUserId || null,
      payload: {
        churchId,
        branchId: branchId || null,
        message: input.message || null,
      },
    },
    {
      store: deps && deps.store,
      async onCreated(innerDb, { request }) {
        const membership = await membershipStore.insertMinistry(innerDb, {
          organizationId,
          churchId,
          branchId: branchId || null,
          ministryId,
          memberId,
          status: "pending",
          message: input.message || null,
          approvalRequestId: request.id,
          assignmentSource: "self_join",
        });
        if (!membership || membership.status !== "pending") {
          return { ok: false, code: RESULT.MEMBERSHIP_CREATE_FAILED };
        }
        request._membership = membership;
        return { ok: true, membership };
      },
    }
  );

  if (!created.ok) {
    if (created.code === APPROVAL_REQUEST_CODE.DUPLICATE_PENDING) {
      return { ok: false, code: RESULT.DUPLICATE, request: created.request };
    }
    return { ok: false, code: created.code || RESULT.INVALID_INPUT, detail: created };
  }

  return {
    ok: true,
    code: RESULT.OK,
    request: created.request,
    membership: created.request._membership || null,
    status: APPROVAL_REQUEST_STATUS.PENDING,
  };
}

/**
 * Create department join: PENDING only — no active membership until approve.
 */
async function requestDepartmentJoin(db, input, deps) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const departmentId = String((input && input.departmentId) || "").trim();
  const requesterUserId = input.requesterUserId
    ? String(input.requesterUserId).trim()
    : null;

  if (!organizationId || !churchId || !memberId || !departmentId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  const membershipStore = resolveMembershipStore(deps);
  const existing = await membershipStore.findOpenDepartment(
    db,
    memberId,
    departmentId
  );
  if (existing) {
    return { ok: false, code: RESULT.DUPLICATE, membership: existing };
  }

  const created = await createApprovalRequest(
    db,
    {
      organizationId,
      productCode: "blessboard",
      requestType: JOIN_REQUEST_TYPE.DEPARTMENT_JOIN,
      requesterSubjectType: REQUESTER_SUBJECT_TYPE.MEMBER,
      requesterSubjectId: memberId,
      requesterUserId,
      targetType: JOIN_TARGET_TYPE.DEPARTMENT,
      targetId: departmentId,
      assignedReviewerUserId: input.assignedReviewerUserId || null,
      payload: {
        churchId,
        branchId: branchId || null,
        message: input.message || null,
      },
    },
    {
      store: deps && deps.store,
      async onCreated(innerDb, { request }) {
        const membership = await membershipStore.insertDepartment(innerDb, {
          organizationId,
          churchId,
          branchId: branchId || null,
          departmentId,
          memberId,
          status: "pending",
          approvalRequestId: request.id,
          assignmentSource: "self_join",
        });
        if (!membership || membership.status !== "pending") {
          return { ok: false, code: RESULT.MEMBERSHIP_CREATE_FAILED };
        }
        request._membership = membership;
        return { ok: true, membership };
      },
    }
  );

  if (!created.ok) {
    if (created.code === APPROVAL_REQUEST_CODE.DUPLICATE_PENDING) {
      return { ok: false, code: RESULT.DUPLICATE, request: created.request };
    }
    return { ok: false, code: created.code || RESULT.INVALID_INPUT, detail: created };
  }

  return {
    ok: true,
    code: RESULT.OK,
    request: created.request,
    membership: created.request._membership || null,
    status: APPROVAL_REQUEST_STATUS.PENDING,
  };
}

function buildReviewDeps(deps, membershipStore) {
  return {
    store: deps && deps.store,
    async authorizeDecision(_db, ctx) {
      // Cancel by requester is handled before authorize for approve/reject only.
      if (ctx.toStatus === APPROVAL_REQUEST_STATUS.CANCELLED) {
        return { ok: true };
      }
      const scope = assertResourceScopedReview({
        targetId: ctx.request.targetId,
        managedResourceIds: (deps && deps.managedResourceIds) || [],
        hasBroaderPermission: Boolean(deps && deps.hasBroaderPermission),
      });
      if (!scope.ok) {
        return { ok: false, code: RESULT.RESOURCE_SCOPE_DENIED, detail: scope };
      }
      return { ok: true };
    },
    async onDecision(innerDb, ctx) {
      const { request, toStatus } = ctx;
      if (request.targetType === JOIN_TARGET_TYPE.MINISTRY) {
        const membership =
          await membershipStore.findMinistryByApprovalRequest(
            innerDb,
            request.id
          );
        if (!membership) return { ok: true, skipped: true };
        const status =
          toStatus === APPROVAL_REQUEST_STATUS.APPROVED
            ? "active"
            : toStatus === APPROVAL_REQUEST_STATUS.REJECTED
              ? "rejected"
              : "cancelled";
        await membershipStore.updateMinistry(innerDb, membership.id, {
          status,
          reviewedByUserId: ctx.actorUserId,
          reviewedAt: new Date().toISOString(),
          reviewNotes: ctx.reason || null,
          joinedAt:
            status === "active" ? new Date().toISOString() : membership.joinedAt || null,
        });
        return { ok: true };
      }
      if (request.targetType === JOIN_TARGET_TYPE.DEPARTMENT) {
        const membership =
          await membershipStore.findDepartmentByApprovalRequest(
            innerDb,
            request.id
          );
        if (!membership) return { ok: true, skipped: true };
        const status =
          toStatus === APPROVAL_REQUEST_STATUS.APPROVED
            ? "active"
            : toStatus === APPROVAL_REQUEST_STATUS.REJECTED
              ? "rejected"
              : "cancelled";
        await membershipStore.updateDepartment(innerDb, membership.id, {
          status,
          assignedByUserId: ctx.actorUserId,
          joinedAt:
            status === "active" ? new Date().toISOString() : membership.joinedAt,
        });
        return { ok: true };
      }
      return { ok: true };
    },
  };
}

async function reviewJoinRequest(db, input, deps) {
  const decision = String((input && input.decision) || "")
    .trim()
    .toLowerCase();
  const membershipStore = resolveMembershipStore(deps);
  const reviewDeps = buildReviewDeps(deps, membershipStore);
  const reason =
    input && input.reason != null ? String(input.reason).trim() : "";

  if (decision === "reject" && reason.length < 3) {
    return { ok: false, code: RESULT.REASON_REQUIRED };
  }

  const payload = {
    requestId: input.requestId,
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    reason: reason || null,
  };

  let result;
  if (decision === "approve") {
    result = await approveApprovalRequest(db, payload, reviewDeps);
  } else if (decision === "reject") {
    result = await rejectApprovalRequest(db, payload, reviewDeps);
  } else if (decision === "cancel") {
    result = await cancelApprovalRequest(db, payload, {
      store: deps && deps.store,
      async onDecision(innerDb, ctx) {
        return buildReviewDeps(deps, membershipStore).onDecision(innerDb, ctx);
      },
    });
  } else {
    return { ok: false, code: RESULT.INVALID_INPUT, detail: "decision" };
  }

  if (!result.ok) {
    if (result.code === APPROVAL_REQUEST_CODE.SELF_APPROVAL_DENIED) {
      return { ok: false, code: RESULT.SELF_APPROVAL_DENIED };
    }
    if (result.code === APPROVAL_REQUEST_CODE.RESOURCE_SCOPE_DENIED || result.code === RESULT.RESOURCE_SCOPE_DENIED) {
      return { ok: false, code: RESULT.RESOURCE_SCOPE_DENIED, detail: result.detail };
    }
    if (result.code === APPROVAL_REQUEST_CODE.TENANT_MISMATCH) {
      return { ok: false, code: RESULT.TENANT_MISMATCH };
    }
    if (result.code === APPROVAL_REQUEST_CODE.NOT_PENDING) {
      return { ok: false, code: RESULT.NOT_PENDING, request: result.request };
    }
    return { ok: false, code: result.code || RESULT.UNAUTHORIZED, detail: result };
  }

  return { ok: true, code: RESULT.OK, request: result.request };
}

/**
 * List BB join requests for admin inbox (tenant-scoped).
 */
async function listJoinRequestsForAdmin(db, input, deps) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) {
    return { ok: false, code: RESULT.INVALID_INPUT, requests: [] };
  }
  const store = (deps && deps.store) || require("../../../platform/requestApproval").repository;
  const status = input.status
    ? String(input.status).trim().toLowerCase()
    : null;
  const rows = await store.listApprovalRequests(db, {
    organizationId,
    productCode: "blessboard",
    status: status && status !== "all" ? status : null,
    requestType: input.requestType || null,
    targetType: input.targetType || null,
    targetId: input.targetId || null,
    limit: input.limit || 100,
  });
  const joinTypes = new Set([
    JOIN_REQUEST_TYPE.MINISTRY_JOIN,
    JOIN_REQUEST_TYPE.DEPARTMENT_JOIN,
  ]);
  const requests = (rows || []).filter((r) => joinTypes.has(r.requestType));
  return { ok: true, code: RESULT.OK, requests };
}

async function getJoinRequestForAdmin(db, input, deps) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const requestId = String((input && input.requestId) || "").trim();
  if (!organizationId || !requestId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }
  const store = (deps && deps.store) || require("../../../platform/requestApproval").repository;
  const request = await store.findApprovalRequestById(db, requestId);
  if (!request) return { ok: false, code: RESULT.NOT_FOUND };
  if (request.organizationId !== organizationId) {
    return { ok: false, code: RESULT.TENANT_MISMATCH };
  }
  if (request.productCode !== "blessboard") {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  const decisions =
    typeof store.listDecisions === "function"
      ? await store.listDecisions(db, requestId)
      : [];
  return { ok: true, code: RESULT.OK, request, decisions };
}

module.exports = {
  RESULT,
  JOIN_REQUEST_TYPE,
  JOIN_TARGET_TYPE,
  JOIN_PERMISSION,
  assertResourceScopedReview,
  requestMinistryJoin,
  requestDepartmentJoin,
  reviewJoinRequest,
  listJoinRequestsForAdmin,
  getJoinRequestForAdmin,
  createMemoryMembershipStore,
  createPgMembershipStore,
};
