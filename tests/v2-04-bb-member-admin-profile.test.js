"use strict";

/**
 * V2.04 Phase 4 — BB-M06–M12 Member Admin Profile.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const {
  RESULT,
  MEMBER_PERMISSION,
  PORTAL_ACCESS_STATUS,
  MEMBERSHIP_STATUS,
  manageChurchId,
  setPortalAccessStatus,
  presentMemberHistoryEvent,
  listMemberAdminHistory,
  requestAuthorizedBranchTransfer,
} = require("../src/blessboard/services/blessBoardMemberDomainService");
const {
  resolveAdminCapabilities,
  buildProfileModel,
} = require("../src/blessboard/services/blessBoardStaffMemberAdminUiService");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MEMBER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function allowOnly(allowedKeys) {
  const set = new Set(allowedKeys);
  return async (_db, input) => ({
    allowed: set.has(input.permission),
    reasonCode: set.has(input.permission)
      ? "RBAC_ALLOWED"
      : "RBAC_PERMISSION_DENIED",
    permission: input.permission,
  });
}

describe("V2.04 BB M06–M12 templates + route authz gates", () => {
  it("ships Stitch markers and membership/portal split on M06", () => {
    const m06 = read("views/blessboard/v5/branch-admin/member-detail.ejs");
    assert.match(m06, /data-bb-stitch-v204="BB-M06"/);
    assert.match(m06, /Edit Member/);
    assert.match(m06, /Manage Access/);
    assert.match(m06, /Change Church ID \(Privileged\)/);
    assert.match(m06, /Transfer Branch/);
    assert.match(m06, /Membership status and portal access are managed separately/);
    assert.doesNotMatch(m06, /manageChurchId\(|setPortalAccessStatus\(/);

    for (const [file, marker] of [
      ["member-edit.ejs", "BB-M07"],
      ["member-church-id.ejs", "BB-M08"],
      ["member-access.ejs", "BB-M09"],
      ["member-access-block.ejs", "BB-M10"],
      ["member-transfer.ejs", "BB-M11"],
      ["member-history.ejs", "BB-M12"],
    ]) {
      const src = read(`views/blessboard/v5/branch-admin/${file}`);
      assert.match(src, new RegExp(`data-bb-stitch-v204="${marker}"`));
    }
  });

  it("gates privileged routes with members.edit / block / manage_church_id", () => {
    const routes = read("src/blessboard/http/branchRegistrationAdminRoutes.js");
    assert.match(routes, /gateEdit/);
    assert.match(routes, /gateBlock/);
    assert.match(routes, /gateChurchId/);
    assert.match(routes, /members\.manage_church_id/);
    assert.match(routes, /members\.block/);
    assert.match(routes, /members\.edit/);
    assert.match(routes, /members\/:id\/church-id/);
    assert.match(routes, /members\/:id\/access\/block/);
    assert.match(routes, /members\/:id\/transfer/);
    assert.match(routes, /members\/:id\/history/);
    const history = routes.indexOf('router.get("/branch-admin/members/:id/history"');
    const byId = routes.lastIndexOf('router.get("/branch-admin/members/:id"');
    assert.ok(history > 0 && byId > history, "specific routes precede :id");
  });

  it("history presentation hides technical keys", () => {
    const event = presentMemberHistoryEvent({
      id: "1",
      actionKey: "members.block",
      createdAt: new Date().toISOString(),
      metadata: {
        portal_access_status: "blocked",
        membership_status_unchanged: "active",
        reason: "Abuse report",
        sessions_revoked: 2,
      },
    });
    assert.equal(event.title, "Portal access blocked");
    assert.match(event.detail, /Abuse report/);
    assert.doesNotMatch(JSON.stringify(event), /sessions_revoked|actionKey|entity_id/);
  });
});

describe("V2.04 BB admin profile negative authorization", () => {
  it("denies Church ID manage without members.manage_church_id", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    memberRepo.findMemberById = async () => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      memberNumber: "CH-1",
    });
    try {
      const denied = await manageChurchId(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          memberId: MEMBER_ID,
          memberNumber: "CH-2",
          reason: "Correction",
        },
        { authorize: allowOnly([MEMBER_PERMISSION.EDIT, MEMBER_PERMISSION.VIEW]) }
      );
      assert.equal(denied.ok, false);
      assert.equal(denied.code, RESULT.UNAUTHORIZED);
    } finally {
      memberRepo.findMemberById = originalFind;
    }
  });

  it("requires reason for Church ID change even with permission", async () => {
    const denied = await manageChurchId(
      {},
      {
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER_ID,
        memberNumber: "CH-2",
      },
      { authorize: allowOnly([MEMBER_PERMISSION.CHURCH_ID_MANAGE]) }
    );
    assert.equal(denied.code, RESULT.REASON_REQUIRED);
  });

  it("denies portal block without members.block and requires reason", async () => {
    const noPerm = await setPortalAccessStatus(
      {},
      {
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER_ID,
        portalAccessStatus: PORTAL_ACCESS_STATUS.BLOCKED,
        reason: "policy",
      },
      { authorize: allowOnly([MEMBER_PERMISSION.EDIT]) }
    );
    assert.equal(noPerm.code, RESULT.UNAUTHORIZED);

    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    memberRepo.findMemberById = async () => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      status: MEMBERSHIP_STATUS.ACTIVE,
      portalAccessStatus: PORTAL_ACCESS_STATUS.ACTIVE,
      userId: null,
    });
    try {
      const noReason = await setPortalAccessStatus(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          memberId: MEMBER_ID,
          portalAccessStatus: PORTAL_ACCESS_STATUS.BLOCKED,
        },
        { authorize: allowOnly([MEMBER_PERMISSION.BLOCK]) }
      );
      assert.equal(noReason.code, RESULT.REASON_REQUIRED);
    } finally {
      memberRepo.findMemberById = originalFind;
    }
  });

  it("revokes sessions on portal block when user linked", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    const originalPortal = memberRepo.updatePortalAccessStatus;
    let revoked = null;
    memberRepo.findMemberById = async () => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      status: MEMBERSHIP_STATUS.ACTIVE,
      portalAccessStatus: PORTAL_ACCESS_STATUS.ACTIVE,
      userId: "user-1",
    });
    memberRepo.updatePortalAccessStatus = async (_db, input) => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      status: MEMBERSHIP_STATUS.ACTIVE,
      portalAccessStatus: input.portalAccessStatus,
    });
    try {
      const blocked = await setPortalAccessStatus(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          memberId: MEMBER_ID,
          portalAccessStatus: PORTAL_ACCESS_STATUS.BLOCKED,
          reason: "Suspicious login",
        },
        {
          authorize: allowOnly([MEMBER_PERMISSION.BLOCK]),
          deploymentCode: "test-deployment",
          revokeSessionsByBlessBoardUser: async (_db, opts) => {
            revoked = opts;
            return { ok: true, revokedCount: 3 };
          },
        }
      );
      assert.equal(blocked.ok, true);
      assert.equal(blocked.membershipStatusUnchanged, true);
      assert.equal(blocked.sessionsRevoked, 3);
      assert.equal(revoked.userId, "user-1");
      assert.equal(revoked.deploymentCode, "test-deployment");
    } finally {
      memberRepo.findMemberById = originalFind;
      memberRepo.updatePortalAccessStatus = originalPortal;
    }
  });

  it("denies transfer without members.edit", async () => {
    const denied = await requestAuthorizedBranchTransfer(
      {},
      {
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER_ID,
        toBranchId: BRANCH,
        reason: "Relocation",
      },
      { authorize: allowOnly([MEMBER_PERMISSION.VIEW]) }
    );
    assert.equal(denied.code, RESULT.UNAUTHORIZED);
  });

  it("denies history without members.view", async () => {
    const denied = await listMemberAdminHistory(
      {},
      {
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        memberId: MEMBER_ID,
      },
      { authorize: allowOnly([MEMBER_PERMISSION.EDIT]) }
    );
    assert.equal(denied.code, RESULT.UNAUTHORIZED);
  });

  it("UI capabilities hide privileged actions without permissions", async () => {
    const caps = await resolveAdminCapabilities(
      {},
      {
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH,
      },
      { authorize: allowOnly([MEMBER_PERMISSION.VIEW]) }
    );
    assert.equal(caps.canEditMember, false);
    assert.equal(caps.canManageAccess, false);
    assert.equal(caps.canChangeChurchId, false);
    assert.equal(caps.canTransferBranch, false);
    assert.equal(caps.canViewHistory, true);

    const model = buildProfileModel(
      {
        id: MEMBER_ID,
        firstName: "Abby",
        lastName: "Mensah",
        status: "active",
        portalAccessStatus: "not_activated",
        memberNumber: "CH-1",
      },
      caps
    );
    assert.equal(model.membershipLabel, "Active Member");
    assert.equal(model.portalLabel, "Not Activated");
    assert.notEqual(model.membershipLabel, model.portalLabel);
  });
});
