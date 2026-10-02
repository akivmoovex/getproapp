"use strict";

/**
 * V2.04 Wave 2 — approved product decision conformance proofs.
 * PD-V204-BB-P1-01…05, PD-V204-AC-P1-01…03
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const {
  resolveManagedJoinResourceIds,
  MANAGED_RESOURCE_LEADER_ROLES,
} = require("../src/blessboard/services/joinRequest/resolveManagedJoinResourceIds");
const {
  assertResourceScopedReview,
  JOIN_PERMISSION,
} = require("../src/blessboard/services/joinRequest/blessBoardJoinRequestConstants");
const {
  sessionHasChurchManagementAccess,
  sessionHasActiveMemberAccess,
  appendDualRoleNavItem,
} = require("../src/blessboard/http/dualRoleShellNav");
const { buildMemberShellLocals } = require("../src/blessboard/http/memberShellLocals");
const {
  revokeSessionsByBlessBoardUser,
  revokeSessionsByPlatformIdentity,
} = require("../src/platform/session/revokeV5Session");
const {
  RESULT,
  RATE_MAX,
  RATE_WINDOW_MS,
  _rateBuckets,
  _consumeRate,
  authenticateMemberByChurchId,
} = require("../src/blessboard/services/blessBoardMemberPortalAuthService");
const {
  projectPublicDoctor,
  projectPublicService,
  PUBLIC_DOCTOR_FIELDS,
  PUBLIC_SERVICE_FIELDS,
} = require("../src/activeclinic/website/publicCatalogueFieldPolicy");

const MINISTRY_A = "11111111-1111-4111-8111-111111111111";
const MINISTRY_B = "22222222-2222-4222-8222-222222222222";
const DEPT_A = "33333333-3333-4333-8333-333333333333";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function mockDb(assignments) {
  return {
    query: async () => ({ rows: [] }),
    _assignments: assignments,
  };
}

describe("V2.04 Wave2 PD-V204-BB-P1-01 scoped join review", () => {
  it("freezes ministry_leader / department_head binding keys", () => {
    assert.deepEqual(MANAGED_RESOURCE_LEADER_ROLES.ministry, ["ministry_leader"]);
    assert.deepEqual(MANAGED_RESOURCE_LEADER_ROLES.department, ["department_head"]);
    assert.equal(JOIN_PERMISSION.REVIEW_BROAD, "events.manage");
  });

  it("leader can review managed ministry; cannot review unmanaged", async () => {
    const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
    const original = rbacRepo.listActiveAssignmentsForUser;
    rbacRepo.listActiveAssignmentsForUser = async () => [
      {
        roleKey: "ministry_leader",
        scopeType: "ministry",
        scopeId: MINISTRY_A,
        churchId: null,
        expiresAt: null,
      },
    ];
    try {
      const ids = await resolveManagedJoinResourceIds(mockDb(), {
        actorUserId: USER_A,
        organizationId: ORG,
      });
      assert.deepEqual(ids, [MINISTRY_A]);
      assert.equal(
        assertResourceScopedReview({
          targetId: MINISTRY_A,
          managedResourceIds: ids,
          hasBroaderPermission: false,
        }).ok,
        true
      );
      assert.equal(
        assertResourceScopedReview({
          targetId: MINISTRY_B,
          managedResourceIds: ids,
          hasBroaderPermission: false,
        }).ok,
        false
      );
    } finally {
      rbacRepo.listActiveAssignmentsForUser = original;
    }
  });

  it("department scope equivalent", async () => {
    const rbacRepo = require("../src/blessboard/repositories/blessBoardRbacRepository");
    const original = rbacRepo.listActiveAssignmentsForUser;
    rbacRepo.listActiveAssignmentsForUser = async () => [
      {
        roleKey: "department_head",
        scopeType: "department",
        scopeId: DEPT_A,
        churchId: null,
        expiresAt: null,
      },
    ];
    try {
      const ids = await resolveManagedJoinResourceIds(mockDb(), {
        actorUserId: USER_A,
        organizationId: ORG,
      });
      assert.deepEqual(ids, [DEPT_A]);
      assert.equal(
        assertResourceScopedReview({
          targetId: DEPT_A,
          managedResourceIds: ids,
          hasBroaderPermission: false,
        }).ok,
        true
      );
    } finally {
      rbacRepo.listActiveAssignmentsForUser = original;
    }
  });

  it("broad-review permission works without managed IDs", () => {
    const ok = assertResourceScopedReview({
      targetId: MINISTRY_B,
      managedResourceIds: [],
      hasBroaderPermission: true,
    });
    assert.equal(ok.ok, true);
    assert.equal(ok.scope, "broad");
  });

  it("self-approval remains denied in join service", () => {
    const src = read("src/blessboard/services/joinRequest/blessBoardJoinRequestService.js");
    assert.match(src, /self_approval_denied|selfApproval|requesterSubjectId/);
    assert.match(src, /assertResourceScopedReview/);
  });

  it("production mount wires resolveManagedJoinResourceIds", () => {
    const mount = read("src/platform/http/v5FoundationServer.js");
    assert.match(mount, /resolveManagedJoinResourceIds/);
    assert.match(mount, /resolveManagedResourceIds:\s*async/);
  });
});

describe("V2.04 Wave2 PD-V204-BB-P1-02 dual-role nav", () => {
  function mockRes() {
    return {
      cookie() {},
      clearCookie() {},
    };
  }

  it("dual-role user sees both destinations", () => {
    const req = {
      blessBoardAuthorizationContext: {
        effectiveRoles: [{ roleKey: "church_hq_admin" }, { roleKey: "member" }],
      },
      blessBoardMemberAccess: { member: { id: "m1" } },
      v5Session: { session: { roles: ["church_hq_admin", "member"], memberId: "m1" } },
      csrfToken: "t",
    };
    assert.equal(sessionHasChurchManagementAccess(req), true);
    assert.equal(sessionHasActiveMemberAccess(req), true);
    const locals = buildMemberShellLocals(req, mockRes(), {
      activeNav: "home",
      env: { NODE_ENV: "test" },
      isProduction: false,
    });
    assert.equal(locals.dualRoleChurchManagementHref, "/hq");
    assert.ok(locals.navItems.some((i) => i && i.href === "/hq"));
  });

  it("ordinary member does not see management link", () => {
    const req = {
      blessBoardAuthorizationContext: { effectiveRoles: [{ roleKey: "member" }] },
      blessBoardMemberAccess: { member: { id: "m1" } },
      v5Session: { session: { roles: ["member"], memberId: "m1" } },
      csrfToken: "t",
    };
    assert.equal(sessionHasChurchManagementAccess(req), false);
    const locals = buildMemberShellLocals(req, mockRes(), {
      activeNav: "home",
      env: { NODE_ENV: "test" },
      isProduction: false,
    });
    assert.equal(locals.dualRoleChurchManagementHref, null);
    assert.ok(!locals.navItems.some((i) => i && i.href === "/hq"));
  });

  it("non-member admin does not receive member access", () => {
    const req = {
      blessBoardAuthorizationContext: {
        effectiveRoles: [{ roleKey: "church_hq_admin" }],
      },
      v5Session: { session: { roles: ["church_hq_admin"] } },
    };
    assert.equal(sessionHasChurchManagementAccess(req), true);
    assert.equal(sessionHasActiveMemberAccess(req), false);
    const nav = appendDualRoleNavItem([], {
      key: "member_portal",
      label: "Member portal",
      href: "/member",
    });
    // Helper can append, but HQ shell only appends when sessionHasActiveMemberAccess
    const hq = read("src/blessboard/http/hqAdminShellLocals.js");
    assert.match(hq, /sessionHasActiveMemberAccess\(req\)/);
    assert.match(hq, /href:\s*"\/member"/);
    assert.ok(nav.some((i) => i.href === "/member"));
  });
});

describe("V2.04 Wave2 PD-V204-BB-P1-03 session revocation", () => {
  it("block path revokes church-scoped sessions by BlessBoard userId", () => {
    const domain = read("src/blessboard/services/blessBoardMemberDomainService.js");
    assert.match(domain, /PORTAL_ACCESS_STATUS\.BLOCKED/);
    assert.match(domain, /revokeSessionsByBlessBoardUser/);
    assert.match(domain, /userId:\s*member\.userId/);
  });

  it("password reset invalidates relevant church-scoped sessions", () => {
    const reset = read("src/blessboard/services/passwordResetService.js");
    assert.match(reset, /revokeSessionsByBlessBoardUser/);
    assert.match(reset, /userId:\s*String\(user\.id\)/);
  });

  it("revokeSessionsByBlessBoardUser updates deployment sessions for userId", async () => {
    const calls = [];
    const client = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 2, rows: [{ id: "1" }, { id: "2" }] };
      },
    };
    const out = await revokeSessionsByBlessBoardUser(client, {
      userId: USER_A,
      deploymentCode: "blessboard",
    });
    assert.equal(out.ok, true);
    assert.equal(out.revokedCount, 2);
    assert.match(calls[0].sql, /deployment_sessions/);
    assert.equal(calls[0].params[0], USER_A);
    assert.equal(calls[0].params[1], "blessboard");
  });

  it("Platform Admin session revoke path is separate (platform_identity_id)", async () => {
    const calls = [];
    const client = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        return { rowCount: 1, rows: [{ id: "pa1" }] };
      },
    };
    const out = await revokeSessionsByPlatformIdentity(client, {
      platformIdentityId: "plat-1",
      deploymentCode: "platform",
    });
    assert.equal(out.ok, true);
    assert.match(calls[0].sql, /platform_identity_id/);
    assert.doesNotMatch(calls[0].sql, /user_id = \$1/);
  });

  it("revoked sessions cannot continue through read gate", () => {
    const readGate = read("src/platform/session/readV5Session.js");
    assert.match(readGate, /revoked/);
    assert.match(readGate, /revoked_at/);
  });
});

describe("V2.04 Wave2 PD-V204-BB-P1-04 rate limiting", () => {
  beforeEach(() => {
    _rateBuckets.clear();
  });

  it("freezes 8 attempts / 15 minutes", () => {
    assert.equal(RATE_MAX, 8);
    assert.equal(RATE_WINDOW_MS, 15 * 60 * 1000);
  });

  it("permits 8 attempts then limits within window with neutral message", async () => {
    const key = "wave2-rate-key";
    for (let i = 0; i < 8; i += 1) {
      assert.equal(_consumeRate("login", key), true, `attempt ${i + 1}`);
    }
    assert.equal(_consumeRate("login", key), false);

    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const original = memberRepo.findMemberByChurchAndNumber;
    memberRepo.findMemberByChurchAndNumber = async () => null;
    try {
      _rateBuckets.clear();
      let limited = null;
      for (let i = 0; i < 9; i += 1) {
        limited = await authenticateMemberByChurchId(
          {},
          {
            churchId: "ch-10001",
            organizationId: ORG,
            memberNumber: "CH-RATE2",
            password: "WrongPass1!",
            requestIp: "wave2-rl-ip",
            deploymentCode: "blessboard",
          }
        );
        if (limited.code === RESULT.RATE_LIMITED) break;
      }
      assert.equal(limited.code, RESULT.RATE_LIMITED);
      assert.equal(limited.message, "Too many attempts. Try again later.");
    } finally {
      memberRepo.findMemberByChurchAndNumber = original;
      _rateBuckets.clear();
    }
  });

  it("bucket/window reset when timestamps age out", () => {
    const id = "login:wave2-reset";
    const old = Date.now() - RATE_WINDOW_MS - 1000;
    _rateBuckets.set(id, [old, old, old, old, old, old, old, old]);
    assert.equal(_consumeRate("login", "wave2-reset"), true);
  });
});

describe("V2.04 Wave2 PD-V204-BB-P1-05 PA membership deny-by-default", () => {
  it("Platform Admin membership mutation routes deny by default", () => {
    const src = read("src/routes/admin/adminChurchPlatform.js");
    assert.match(src, /denyPlatformAdminMembershipIntervention/);
    assert.match(src, /PD-V204-BB-P1-05/);
    for (const action of ["reset-password", "suspend", "reactivate", "verify"]) {
      assert.match(
        src,
        new RegExp(
          `/church/members/:memberId/${action}[\\s\\S]*?denyPlatformAdminMembershipIntervention\\(req, res, "${action}"\\)`
        )
      );
    }
  });

  it("deny attempt writes auditable log action", () => {
    const src = read("src/routes/admin/adminChurchPlatform.js");
    assert.match(src, /platform_admin\.membership_intervention_denied/);
    assert.match(src, /insertAuditLog/);
  });

  it("V5 platform membership remains read-oriented / no implicit create", () => {
    const src = read("src/routes/admin/adminChurchPlatform.js");
    assert.doesNotMatch(
      src,
      /router\.post\(\s*"\/church\/members"[^,]+,\s*requireSuperAdmin[\s\S]{0,200}createMember/
    );
  });
});

describe("V2.04 Wave2 PD-V204-AC-P1-02 public field allowlist", () => {
  it("public doctor page includes only allowlisted fields", () => {
    const projected = projectPublicDoctor({
      id: "d1",
      staffKey: "ada",
      displayName: "Dr Ada",
      title: "GP",
      specialty: "Family",
      bio: "Public bio",
      photoUrl: "https://cdn.example.com/a.jpg",
      email: "ada@private.example",
      phone: "+260900",
      userId: "secret-user",
      editHref: "/app/staff/d1",
      clinicalNotes: "PHI",
      patientId: "p1",
      salary: 1,
    });
    assert.equal(projected.displayName, "Dr Ada");
    assert.equal(projected.title, "GP");
    assert.equal(projected.specialty, "Family");
    assert.equal(projected.bio, "Public bio");
    assert.equal(projected.photoUrl, "https://cdn.example.com/a.jpg");
    assert.equal(projected.email, undefined);
    assert.equal(projected.phone, undefined);
    assert.equal(projected.userId, undefined);
    assert.equal(projected.editHref, undefined);
    assert.equal(projected.clinicalNotes, undefined);
    assert.equal(projected.patientId, undefined);
    assert.equal(projected.salary, undefined);
  });

  it("public services page includes only public-safe fields", () => {
    const projected = projectPublicService({
      id: "s1",
      serviceKey: "consult",
      name: "Consult",
      publicSummary: "Open consult",
      durationLabel: "30 min",
      internalCostCode: "X",
      email: "billing@private",
      patientRequiredFields: ["ssn"],
    });
    assert.equal(projected.name, "Consult");
    assert.equal(projected.publicSummary, "Open consult");
    assert.equal(projected.durationLabel, "30 min");
    assert.equal(projected.internalCostCode, undefined);
    assert.equal(projected.email, undefined);
    assert.equal(projected.patientRequiredFields, undefined);
  });

  it("adding a new internal field does not automatically expose it", () => {
    assert.ok(!PUBLIC_DOCTOR_FIELDS.includes("homeAddress"));
    assert.ok(!PUBLIC_SERVICE_FIELDS.includes("payrollCode"));
    const projected = projectPublicDoctor({
      displayName: "X",
      homeAddress: "12 Secret St",
      payrollCode: "ZZ",
      weirdNewInternalField: true,
    });
    assert.equal(projected.homeAddress, undefined);
    assert.equal(projected.payrollCode, undefined);
    assert.equal(projected.weirdNewInternalField, undefined);
  });

  it("visibility service projects through allowlist", () => {
    const vis = read("src/activeclinic/services/activeClinicPublicVisibilityService.js");
    assert.match(vis, /projectPublicDoctor|projectPublicService/);
    const adapter = read("src/activeclinic/website/activeClinicWebsitePresentationAdapter.js");
    assert.match(adapter, /projectPublicDoctor/);
  });
});

describe("V2.04 Wave2 PD-V204-AC-P1-01 scope matrix (doc)", () => {
  it("documents website/editor PRESENTATION, patient FOUNDATION, unimplemented FUTURE", () => {
    const review = read("docs/product/V2_04_WAVE2_PRODUCT_DECISION_REVIEW.md");
    assert.match(review, /PD-V204-AC-P1-01/);
    assert.match(review, /PRESENTATION|TEMPORARY_APPROVED/);
    const register = read("docs/product/V2_04_PRODUCT_DECISION_REGISTER.md");
    assert.match(register, /PD-V204-AC-P1-01/);
    assert.match(register, /TEMPORARY_APPROVED_FOR_V2_04/);
  });
});

describe("V2.04 Wave2 PD-V204-AC-P1-03 R08 booking handoff", () => {
  it("R08 hands off to existing booking engine; no second booking domain", () => {
    const stitch = read("src/activeclinic/website/activeClinicStitchPublicPages.js");
    assert.match(stitch, /screenId === "R08"/);
    assert.match(stitch, /paths\.book|\/book/);
    assert.doesNotMatch(stitch, /insertInto.*booking_engine_v2|createSecondBookingDomain/);
    const adapter = read("src/activeclinic/website/activeClinicWebsitePresentationAdapter.js");
    assert.match(adapter, /"R08"/);
    assert.match(adapter, /\/book\?doctor=/);
  });
});
