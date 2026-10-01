"use strict";

/**
 * V2.04 Phase 7 — Request / approval foundation tests.
 * Platform workflow + BB ministry/department join adapters. No Stitch UI.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  APPROVAL_REQUEST_STATUS,
  APPROVAL_REQUEST_CODE,
  assertNotSelfApproval,
  createApprovalRequest,
  approveApprovalRequest,
  rejectApprovalRequest,
  cancelApprovalRequest,
  repository: approvalRepo,
} = require("../src/platform/requestApproval");

const {
  JOIN_REQUEST_TYPE,
  JOIN_TARGET_TYPE,
  assertResourceScopedReview,
  requestMinistryJoin,
  requestDepartmentJoin,
  reviewJoinRequest,
  createMemoryMembershipStore,
} = require("../src/blessboard/services/joinRequest");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHURCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BRANCH = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MEMBER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MEMBER_USER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const REVIEWER = "11111111-1111-4111-8111-111111111111";
const MINISTRY = "22222222-2222-4222-8222-222222222222";
const MINISTRY_B = "33333333-3333-4333-8333-333333333333";
const DEPARTMENT = "44444444-4444-4444-8444-444444444444";

function createMemoryApprovalStore() {
  const requests = new Map();
  const decisions = [];
  const map = approvalRepo.mapRequest;
  return {
    async insertApprovalRequest(_db, row) {
      const saved = {
        id: crypto.randomUUID(),
        organization_id: row.organizationId,
        product_code: row.productCode,
        request_type: row.requestType,
        requester_subject_type: row.requesterSubjectType,
        requester_subject_id: row.requesterSubjectId,
        requester_user_id: row.requesterUserId || null,
        target_type: row.targetType,
        target_id: row.targetId,
        status: row.status || "pending",
        assigned_reviewer_user_id: row.assignedReviewerUserId || null,
        payload_json: row.payload || {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      requests.set(saved.id, saved);
      return map(saved);
    },
    async findApprovalRequestById(_db, id) {
      return map(requests.get(id) || null);
    },
    async findPendingDuplicate(_db, input) {
      for (const row of requests.values()) {
        if (
          row.organization_id === input.organizationId &&
          row.product_code === input.productCode &&
          row.request_type === input.requestType &&
          row.requester_subject_id === input.requesterSubjectId &&
          row.target_type === input.targetType &&
          row.target_id === input.targetId &&
          row.status === "pending"
        ) {
          return map(row);
        }
      }
      return null;
    },
    async updateApprovalRequestStatus(_db, input) {
      const cur = requests.get(input.id);
      if (!cur) return null;
      const next = {
        ...cur,
        status: input.status,
        decision_reason:
          input.decisionReason != null ? input.decisionReason : cur.decision_reason,
        decided_by_user_id: input.decidedByUserId || cur.decided_by_user_id,
        decided_at: input.decidedAt || cur.decided_at,
        cancelled_at: input.cancelledAt || cur.cancelled_at,
        cancelled_by_user_id: input.cancelledByUserId || cur.cancelled_by_user_id,
        updated_at: new Date().toISOString(),
      };
      requests.set(input.id, next);
      return map(next);
    },
    async insertDecision(_db, row) {
      const saved = {
        id: crypto.randomUUID(),
        ...row,
        created_at: new Date().toISOString(),
      };
      decisions.push(saved);
      return saved;
    },
    async listDecisions(_db, approvalRequestId) {
      return decisions.filter((d) => d.approvalRequestId === approvalRequestId);
    },
    _requests: requests,
    _decisions: decisions,
  };
}

describe("V2.04 platform approval request workflow", () => {
  it("creates pending request with core fields", async () => {
    const store = createMemoryApprovalStore();
    const result = await createApprovalRequest(
      {},
      {
        organizationId: ORG,
        productCode: "blessboard",
        requestType: "ministry.join",
        requesterSubjectType: "member",
        requesterSubjectId: MEMBER,
        requesterUserId: MEMBER_USER,
        targetType: "ministry",
        targetId: MINISTRY,
        assignedReviewerUserId: REVIEWER,
        payload: { churchId: CHURCH },
      },
      { store }
    );
    assert.equal(result.ok, true);
    assert.equal(result.request.status, APPROVAL_REQUEST_STATUS.PENDING);
    assert.equal(result.request.requesterSubjectId, MEMBER);
    assert.equal(result.request.targetId, MINISTRY);
    assert.equal(result.request.organizationId, ORG);
    assert.ok(result.request.createdAt || result.request.id);
    assert.equal(store._decisions.length, 1);
  });

  it("denies duplicate pending for same requester/target", async () => {
    const store = createMemoryApprovalStore();
    const deps = { store };
    const first = await createApprovalRequest(
      {},
      {
        organizationId: ORG,
        productCode: "blessboard",
        requestType: "ministry.join",
        requesterSubjectId: MEMBER,
        requesterUserId: MEMBER_USER,
        targetType: "ministry",
        targetId: MINISTRY,
      },
      deps
    );
    assert.equal(first.ok, true);
    const dup = await createApprovalRequest(
      {},
      {
        organizationId: ORG,
        productCode: "blessboard",
        requestType: "ministry.join",
        requesterSubjectId: MEMBER,
        requesterUserId: MEMBER_USER,
        targetType: "ministry",
        targetId: MINISTRY,
      },
      deps
    );
    assert.equal(dup.ok, false);
    assert.equal(dup.code, APPROVAL_REQUEST_CODE.DUPLICATE_PENDING);
  });

  it("approves / rejects / cancels with decision timestamps", async () => {
    const store = createMemoryApprovalStore();
    const created = await createApprovalRequest(
      {},
      {
        organizationId: ORG,
        productCode: "blessboard",
        requestType: "ministry.join",
        requesterSubjectId: MEMBER,
        requesterUserId: MEMBER_USER,
        targetType: "ministry",
        targetId: MINISTRY,
      },
      { store }
    );

    const approved = await approveApprovalRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        reason: "welcome",
      },
      { store }
    );
    assert.equal(approved.ok, true);
    assert.equal(approved.request.status, "approved");
    assert.equal(approved.request.decidedByUserId, REVIEWER);
    assert.ok(approved.request.decidedAt);

    const store2 = createMemoryApprovalStore();
    const c2 = await createApprovalRequest(
      {},
      {
        organizationId: ORG,
        productCode: "blessboard",
        requestType: "ministry.join",
        requesterSubjectId: MEMBER,
        requesterUserId: MEMBER_USER,
        targetType: "ministry",
        targetId: MINISTRY_B,
      },
      { store: store2 }
    );
    const rejected = await rejectApprovalRequest(
      {},
      {
        requestId: c2.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        reason: "capacity",
      },
      { store: store2 }
    );
    assert.equal(rejected.request.status, "rejected");
    assert.equal(rejected.request.decisionReason, "capacity");

    const store3 = createMemoryApprovalStore();
    const c3 = await createApprovalRequest(
      {},
      {
        organizationId: ORG,
        productCode: "blessboard",
        requestType: "ministry.join",
        requesterSubjectId: MEMBER,
        requesterUserId: MEMBER_USER,
        targetType: "ministry",
        targetId: MINISTRY,
      },
      { store: store3 }
    );
    const cancelled = await cancelApprovalRequest(
      {},
      {
        requestId: c3.request.id,
        organizationId: ORG,
        actorUserId: MEMBER_USER,
        reason: "changed mind",
      },
      { store: store3 }
    );
    assert.equal(cancelled.request.status, "cancelled");
    assert.ok(cancelled.request.cancelledAt);
  });

  it("denies self-approval", async () => {
    assert.equal(
      assertNotSelfApproval(
        { requesterUserId: MEMBER_USER, requesterSubjectType: "member", requesterSubjectId: MEMBER },
        MEMBER_USER
      ).code,
      APPROVAL_REQUEST_CODE.SELF_APPROVAL_DENIED
    );

    const store = createMemoryApprovalStore();
    const created = await createApprovalRequest(
      {},
      {
        organizationId: ORG,
        productCode: "blessboard",
        requestType: "ministry.join",
        requesterSubjectId: MEMBER,
        requesterUserId: MEMBER_USER,
        targetType: "ministry",
        targetId: MINISTRY,
      },
      { store }
    );
    const self = await approveApprovalRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: MEMBER_USER,
      },
      { store }
    );
    assert.equal(self.code, APPROVAL_REQUEST_CODE.SELF_APPROVAL_DENIED);
  });

  it("enforces tenant isolation on decide", async () => {
    const store = createMemoryApprovalStore();
    const created = await createApprovalRequest(
      {},
      {
        organizationId: ORG,
        productCode: "blessboard",
        requestType: "ministry.join",
        requesterSubjectId: MEMBER,
        requesterUserId: MEMBER_USER,
        targetType: "ministry",
        targetId: MINISTRY,
      },
      { store }
    );
    const cross = await approveApprovalRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG_B,
        actorUserId: REVIEWER,
      },
      { store }
    );
    assert.equal(cross.code, APPROVAL_REQUEST_CODE.TENANT_MISMATCH);
  });
});

describe("V2.04 BB ministry / department join adapter", () => {
  it("ministry join creates pending request and pending membership (not active)", async () => {
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const result = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH,
        memberId: MEMBER,
        ministryId: MINISTRY,
        requesterUserId: MEMBER_USER,
        message: "I would like to serve",
      },
      { store, membershipStore }
    );
    assert.equal(result.ok, true);
    assert.equal(result.status, "pending");
    assert.equal(result.request.status, "pending");
    assert.equal(result.request.requestType, JOIN_REQUEST_TYPE.MINISTRY_JOIN);
    assert.equal(result.membership.status, "pending");
    assert.notEqual(result.membership.status, "active");
  });

  it("department join creates pending — does not immediately add active member", async () => {
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const result = await requestDepartmentJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH,
        memberId: MEMBER,
        departmentId: DEPARTMENT,
        requesterUserId: MEMBER_USER,
      },
      { store, membershipStore }
    );
    assert.equal(result.ok, true);
    assert.equal(result.membership.status, "pending");
    assert.equal(result.request.targetType, JOIN_TARGET_TYPE.DEPARTMENT);
  });

  it("approve activates membership; reject/cancel do not", async () => {
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const deps = { store, membershipStore, hasBroaderPermission: true };

    const created = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        ministryId: MINISTRY,
        requesterUserId: MEMBER_USER,
      },
      deps
    );

    const approved = await reviewJoinRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        decision: "approve",
        reason: "ok",
      },
      deps
    );
    assert.equal(approved.ok, true);
    assert.equal(approved.request.status, "approved");
    const membership = await membershipStore.findMinistryByApprovalRequest(
      {},
      created.request.id
    );
    assert.equal(membership.status, "active");

    const created2 = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        ministryId: MINISTRY_B,
        requesterUserId: MEMBER_USER,
      },
      deps
    );
    const rejected = await reviewJoinRequest(
      {},
      {
        requestId: created2.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        decision: "reject",
        reason: "full",
      },
      deps
    );
    assert.equal(rejected.request.status, "rejected");
    const m2 = await membershipStore.findMinistryByApprovalRequest(
      {},
      created2.request.id
    );
    assert.equal(m2.status, "rejected");
  });

  it("self-approval denied on ministry join review", async () => {
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const deps = { store, membershipStore, hasBroaderPermission: true };
    const created = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        ministryId: MINISTRY,
        requesterUserId: MEMBER_USER,
      },
      deps
    );
    const self = await reviewJoinRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: MEMBER_USER,
        decision: "approve",
      },
      deps
    );
    assert.equal(self.code, "self_approval_denied");
  });

  it("resource scope: ministry leader only reviews managed ministries", async () => {
    assert.equal(
      assertResourceScopedReview({
        targetId: MINISTRY,
        managedResourceIds: [MINISTRY],
        hasBroaderPermission: false,
      }).ok,
      true
    );
    assert.equal(
      assertResourceScopedReview({
        targetId: MINISTRY_B,
        managedResourceIds: [MINISTRY],
        hasBroaderPermission: false,
      }).code,
      "resource_scope_denied"
    );

    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const created = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        ministryId: MINISTRY_B,
        requesterUserId: MEMBER_USER,
      },
      { store, membershipStore }
    );

    const denied = await reviewJoinRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        decision: "approve",
      },
      {
        store,
        membershipStore,
        managedResourceIds: [MINISTRY],
        hasBroaderPermission: false,
      }
    );
    assert.equal(denied.code, "resource_scope_denied");

    const allowed = await reviewJoinRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        decision: "approve",
      },
      {
        store,
        membershipStore,
        managedResourceIds: [MINISTRY_B],
        hasBroaderPermission: false,
      }
    );
    assert.equal(allowed.ok, true);
  });

  it("duplicate join request handling", async () => {
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const deps = { store, membershipStore };
    const first = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        ministryId: MINISTRY,
        requesterUserId: MEMBER_USER,
      },
      deps
    );
    assert.equal(first.ok, true);
    const dup = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        ministryId: MINISTRY,
        requesterUserId: MEMBER_USER,
      },
      deps
    );
    assert.equal(dup.ok, false);
    assert.equal(dup.code, "duplicate_pending_request");
  });

  it("cancel pending join", async () => {
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const deps = { store, membershipStore, hasBroaderPermission: true };
    const created = await requestDepartmentJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        departmentId: DEPARTMENT,
        requesterUserId: MEMBER_USER,
      },
      deps
    );
    const cancelled = await reviewJoinRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: MEMBER_USER,
        decision: "cancel",
        reason: "no longer interested",
      },
      deps
    );
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.request.status, "cancelled");
    const membership = await membershipStore.findDepartmentByApprovalRequest(
      {},
      created.request.id
    );
    assert.equal(membership.status, "cancelled");
  });

  it("ships additive migrations; preserves existing participation join tables", () => {
    const platformSql = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/platform/047_approval_request_foundation.sql"
      ),
      "utf8"
    );
    assert.match(platformSql, /platform\.approval_requests/);
    assert.match(platformSql, /approval_request_decisions/);
    assert.match(platformSql, /'pending', 'approved', 'rejected', 'cancelled'/);

    const bbSql = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/blessboard/122_department_join_request_v204.sql"
      ),
      "utf8"
    );
    assert.match(bbSql, /department_memberships/);
    assert.match(bbSql, /pending/);

    assert.equal(
      fs.existsSync(
        path.join(__dirname, "../db/migrations/blessboard/022_create_participation.sql")
      ),
      true
    );

    const platformSrc = fs.readFileSync(
      path.join(
        __dirname,
        "../src/platform/requestApproval/requestApprovalWorkflow.js"
      ),
      "utf8"
    );
    assert.doesNotMatch(platformSrc, /require\(["'].*blessboard/);
    assert.doesNotMatch(platformSrc, /require\(["'].*activeclinic/);
  });
});
