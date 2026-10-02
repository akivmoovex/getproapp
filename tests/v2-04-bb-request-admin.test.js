"use strict";

/**
 * V2.04 Phase 10 — BB Request Administration (BB-R01–R04) Stitch parity + rules.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const {
  APPROVAL_REQUEST_STATUS,
  repository: approvalRepo,
} = require("../src/platform/requestApproval");

const {
  JOIN_REQUEST_TYPE,
  JOIN_TARGET_TYPE,
  assertResourceScopedReview,
  requestMinistryJoin,
  reviewJoinRequest,
  listJoinRequestsForAdmin,
  getJoinRequestForAdmin,
  createMemoryMembershipStore,
  RESULT: JOIN_RESULT,
} = require("../src/blessboard/services/joinRequest");

const {
  createJoinRequestAdminRouter,
  presentRequest,
} = require("../src/blessboard/http/joinRequestAdminRoutes");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHURCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const MEMBER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const MEMBER_USER = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const REVIEWER = "11111111-1111-4111-8111-111111111111";
const WRONG_LEADER = "55555555-5555-4555-8555-555555555555";
const MINISTRY = "22222222-2222-4222-8222-222222222222";
const MINISTRY_B = "33333333-3333-4333-8333-333333333333";

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
    async listApprovalRequests(_db, input) {
      return [...requests.values()]
        .filter((row) => {
          if (row.organization_id !== input.organizationId) return false;
          if (input.productCode && row.product_code !== input.productCode) return false;
          if (input.status && row.status !== input.status) return false;
          if (input.requestType && row.request_type !== input.requestType) return false;
          if (input.targetType && row.target_type !== input.targetType) return false;
          if (input.targetId && row.target_id !== input.targetId) return false;
          return true;
        })
        .map(map);
    },
  };
}

describe("V2.04 BB request admin Stitch + routes wiring", () => {
  it("ships R01–R04 templates with Stitch markers (D+M where present)", () => {
    const r01 = read("views/blessboard/v5/join-requests/inbox.ejs");
    assert.match(r01, /data-bb-stitch-v204="BB-R01"/);
    assert.match(r01, /data-bb-stitch-id="ff1bcec5a0274ca88ad46d2e889b80e8"/);
    assert.match(r01, /data-bb-stitch-id-mobile="bb1a2125b67f45d28eb18c1f43132dbd"/);
    assert.match(r01, /Requests Inbox/);
    assert.match(r01, /Pending Review/);
    assert.match(r01, /Review Request/);
    assert.match(r01, /Join Ministry\/Department/);
    assert.doesNotMatch(r01, /reviewJoinRequest|listJoinRequestsForAdmin/);

    const r02 = read("views/blessboard/v5/join-requests/review.ejs");
    assert.match(r02, /data-bb-stitch-v204="BB-R02"/);
    assert.match(r02, /data-bb-stitch-id="79b654c9af18411a839a07c616e39e86"/);
    assert.match(r02, /data-bb-stitch-id-mobile="f8c014f3282549f1939920a39e2c382b"/);
    assert.match(r02, /Conflict-of-Interest Protection Active/);
    assert.match(r02, /Adjudication Engine/);
    assert.match(r02, /Approve Request/);
    assert.match(r02, /Reject Request/);
    assert.match(r02, /Self-Review Safeguard/);
    assert.doesNotMatch(r02, /reviewJoinRequest/);

    const r03 = read("views/blessboard/v5/join-requests/decision.ejs");
    assert.match(r03, /data-bb-stitch-v204="BB-R03"/);
    assert.match(r03, /data-bb-stitch-id="ddc98054601e4362ad7e1f051efa83bb"/);
    assert.match(r03, /Confirm Request Adjudication/);
    assert.match(r03, /Path A: Approve Request/);
    assert.match(r03, /Path B: Reject Request/);
    assert.match(r03, /Creates Ministry Membership/);
    assert.match(r03, /Confirm Approval/);
    assert.match(r03, /Confirm Rejection/);
    assert.match(r03, /Reason Required/);
    assert.doesNotMatch(r03, /reviewJoinRequest/);

    const r04 = read("views/blessboard/v5/join-requests/ministry-members.ejs");
    assert.match(r04, /data-bb-stitch-v204="BB-R04"/);
    assert.match(r04, /data-bb-stitch-id="fe42f3a5c09146738394018a7b78f6bf"/);
    assert.match(r04, /Member Management/);
    assert.match(r04, /Pending Ministry Requests/);
    assert.match(r04, /Current Members/);
    assert.match(r04, /Review Pending Request/);
    assert.doesNotMatch(r04, /reviewJoinRequest/);
  });

  it("preserves pastoral requests surface and mounts join-request admin router", () => {
    const pastoral = read("views/blessboard/v5/forms-requests/admin-requests.ejs");
    assert.ok(pastoral.length > 0);
    const server = read("src/platform/http/v5FoundationServer.js");
    assert.match(server, /createJoinRequestAdminRouter/);
    assert.match(server, /createFormsRequestsAdminRouter/);
    const routes = read("src/blessboard/http/joinRequestAdminRoutes.js");
    assert.match(routes, /\/branch-admin\/join-requests/);
    assert.match(routes, /\/branch-admin\/join-requests\/:id\/decide/);
    assert.match(routes, /\/branch-admin\/join-requests\/ministries\/:ministryId/);
    assert.equal(typeof createJoinRequestAdminRouter, "function");
    assert.equal(typeof presentRequest, "function");
  });

  it("CSS ships R01–R04 selectors and shell bumps cache", () => {
    const css = read("public/blessboard/v5/branch-admin.css");
    assert.match(css, /\.bb-v204-r01/);
    assert.match(css, /\.bb-v204-r02/);
    assert.match(css, /\.bb-v204-r03/);
    assert.match(css, /\.bb-v204-r04/);
    const shell = read("views/blessboard/v5/partials/branch-admin-shell-start.ejs");
    assert.match(shell, /branch-admin\.css\?v=v204-p4-1/);
  });
});

describe("V2.04 BB request admin domain rules", () => {
  it("ministry join creates PENDING only — no automatic membership", async () => {
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const created = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        ministryId: MINISTRY,
        requesterUserId: MEMBER_USER,
        message: "I would like to join",
      },
      { store, membershipStore }
    );
    assert.equal(created.ok, true);
    assert.equal(created.status, APPROVAL_REQUEST_STATUS.PENDING);
    assert.equal(created.request.status, "pending");
    assert.equal(created.membership.status, "pending");
    assert.notEqual(created.membership.status, "active");
  });

  it("approve creates ministry relationship; reject requires reason; cancel works", async () => {
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const deps = { store, membershipStore, hasBroaderPermission: true };

    const a = await requestMinistryJoin(
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
        requestId: a.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        decision: "approve",
        reason: "audition passed",
      },
      deps
    );
    assert.equal(approved.ok, true);
    assert.equal(approved.request.status, "approved");
    const membership = await membershipStore.findMinistryByApprovalRequest(
      {},
      a.request.id
    );
    assert.equal(membership.status, "active");

    const b = await requestMinistryJoin(
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
    const noReason = await reviewJoinRequest(
      {},
      {
        requestId: b.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        decision: "reject",
        reason: "no",
      },
      deps
    );
    assert.equal(noReason.ok, false);
    assert.equal(noReason.code, JOIN_RESULT.REASON_REQUIRED);

    const rejected = await reviewJoinRequest(
      {},
      {
        requestId: b.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        decision: "reject",
        reason: "capacity full",
      },
      deps
    );
    assert.equal(rejected.ok, true);
    assert.equal(rejected.request.status, "rejected");

    const c = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: crypto.randomUUID(),
        ministryId: MINISTRY,
        requesterUserId: MEMBER_USER,
      },
      deps
    );
    const cancelled = await reviewJoinRequest(
      {},
      {
        requestId: c.request.id,
        organizationId: ORG,
        actorUserId: MEMBER_USER,
        decision: "cancel",
      },
      deps
    );
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.request.status, "cancelled");
  });

  it("self-approval denial", async () => {
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
    assert.equal(self.ok, false);
    assert.equal(self.code, JOIN_RESULT.SELF_APPROVAL_DENIED);
  });

  it("wrong ministry leader denied by resource scope", async () => {
    assert.equal(
      assertResourceScopedReview({
        targetId: MINISTRY,
        managedResourceIds: [MINISTRY_B],
        hasBroaderPermission: false,
      }).ok,
      false
    );
    const store = createMemoryApprovalStore();
    const membershipStore = createMemoryMembershipStore();
    const created = await requestMinistryJoin(
      {},
      {
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER,
        ministryId: MINISTRY,
        requesterUserId: MEMBER_USER,
      },
      { store, membershipStore }
    );
    const denied = await reviewJoinRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: WRONG_LEADER,
        decision: "approve",
      },
      {
        store,
        membershipStore,
        hasBroaderPermission: false,
        managedResourceIds: [MINISTRY_B],
      }
    );
    assert.equal(denied.ok, false);
    assert.equal(denied.code, JOIN_RESULT.RESOURCE_SCOPE_DENIED);

    const ok = await reviewJoinRequest(
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
        hasBroaderPermission: false,
        managedResourceIds: [MINISTRY],
      }
    );
    assert.equal(ok.ok, true);
  });

  it("wrong tenant denied; duplicate pending blocked", async () => {
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
    const cross = await reviewJoinRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG_B,
        actorUserId: REVIEWER,
        decision: "approve",
      },
      deps
    );
    assert.equal(cross.ok, false);
    assert.equal(cross.code, JOIN_RESULT.TENANT_MISMATCH);

    const listedWrong = await getJoinRequestForAdmin(
      {},
      { organizationId: ORG_B, requestId: created.request.id },
      { store }
    );
    assert.equal(listedWrong.code, JOIN_RESULT.TENANT_MISMATCH);

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
    assert.equal(dup.code, JOIN_RESULT.DUPLICATE);

    const inbox = await listJoinRequestsForAdmin(
      {},
      { organizationId: ORG, status: "pending" },
      { store }
    );
    assert.equal(inbox.ok, true);
    assert.equal(inbox.requests.length, 1);
    assert.equal(inbox.requests[0].requestType, JOIN_REQUEST_TYPE.MINISTRY_JOIN);
    assert.equal(inbox.requests[0].targetType, JOIN_TARGET_TYPE.MINISTRY);
  });

  it("decision is audited via approval decision history", async () => {
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
    await reviewJoinRequest(
      {},
      {
        requestId: created.request.id,
        organizationId: ORG,
        actorUserId: REVIEWER,
        decision: "approve",
        reason: "endorsed",
      },
      deps
    );
    const loaded = await getJoinRequestForAdmin(
      {},
      { organizationId: ORG, requestId: created.request.id },
      { store }
    );
    assert.equal(loaded.ok, true);
    assert.ok(Array.isArray(loaded.decisions));
    assert.ok(loaded.decisions.length >= 1);
    const statuses = loaded.decisions.map((d) => d.toStatus || d.to_status);
    assert.ok(
      statuses.includes("approved") ||
        loaded.decisions.some((d) => String(d.reason || "").includes("endorsed") || d.toStatus === "approved")
    );
  });
});
