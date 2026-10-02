"use strict";

/**
 * V2.04 Phase 4 — BlessBoard member domain foundation tests.
 * No Stitch UI. Covers create, Church ID, person reuse, authz, portal/membership split.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  RESULT,
  MEMBERSHIP_STATUS,
  PORTAL_ACCESS_STATUS,
  MEMBER_PERMISSION,
  createStaffManagedMember,
  updateMemberProfile,
  manageChurchId,
  setPortalAccessStatus,
  setMembershipStatus,
  findReusablePersonForMember,
  assertVisitorConversionDoesNotCreateMembership,
  assertStaffActor,
} = require("../src/blessboard/services/blessBoardMemberDomainService");
const {
  CANONICAL_MEMBERSHIP_STATUSES,
} = require("../src/blessboard/services/memberDomainConstants");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACTOR = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MEMBER_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const PERSON_ID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

function allow(permission) {
  return async (_db, input) => ({
    allowed: input.permission === permission || true,
    reasonCode: "RBAC_ALLOWED",
    permission: input.permission,
  });
}

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

describe("V2.04 BB member domain constants + gates", () => {
  it("defines canonical membership and portal statuses separately", () => {
    assert.deepEqual([...CANONICAL_MEMBERSHIP_STATUSES], [
      "active",
      "inactive",
      "transferred",
      "former",
      "deceased",
    ]);
    assert.equal(PORTAL_ACCESS_STATUS.NOT_ACTIVATED, "not_activated");
    assert.equal(PORTAL_ACCESS_STATUS.BLOCKED, "blocked");
    assert.equal(MEMBER_PERMISSION.CHURCH_ID_MANAGE, "members.manage_church_id");
    assert.equal(MEMBER_PERMISSION.BLOCK, "members.block");
  });

  it("forbids self-create and visitor auto membership", () => {
    assert.equal(
      assertStaffActor({ selfCreate: true, actorUserId: ACTOR, organizationId: ORG, churchId: CHURCH })
        .code,
      RESULT.SELF_CREATE_FORBIDDEN
    );
    assert.equal(
      assertVisitorConversionDoesNotCreateMembership({
        source: "visitor_conversion_auto",
      }).code,
      RESULT.VISITOR_AUTO_MEMBERSHIP_FORBIDDEN
    );
    assert.equal(
      assertVisitorConversionDoesNotCreateMembership({
        source: "membership_preparation_auto",
      }).ok,
      false
    );
  });
});

describe("V2.04 BB member create + Church ID + person reuse", () => {
  it("creates via staff path with portal not_activated and separate membership", async () => {
    const audits = [];
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberByChurchAndNumber;
    memberRepo.findMemberByChurchAndNumber = async () => null;
    try {
    const result = await createStaffManagedMember(
      {},
      {
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH,
        memberNumber: "CH-100",
        demographics: {
          firstName: "Mary",
          lastName: "Phiri",
          phoneNormalized: "+260971111111",
          email: "mary@example.com",
        },
        source: "staff_api",
      },
      {
        authorize: allowOnly([MEMBER_PERMISSION.CREATE]),
        hooks: {
          async createPerson() {
            return {
              ok: true,
              person: { id: PERSON_ID, organizationId: ORG, platformIdentityId: null },
            };
          },
          async linkPersonProductRelationship(_db, input) {
            return {
              ok: true,
              link: { id: "link-1", subjectRef: input.subjectRef, personId: PERSON_ID },
            };
          },
          async recordAudit(_db, payload) {
            audits.push(payload);
            return { ok: true };
          },
          evaluatePersonDuplicates: () => ({
            ok: true,
            overallMatchCode: "NO_MATCH",
            action: "ALLOW",
            blocking: false,
            matches: [],
          }),
        },
        adapter: {
          productCode: "blessboard",
          relationshipKey: "bb.membership",
          duplicatePolicy: {
            decide: () => ({
              action: "ALLOW",
              blocking: false,
              overrideAllowed: false,
            }),
          },
          authorize: async () => ({ ok: true }),
          normalizeProductFields: () => ({
            ok: true,
            product: {
              churchId: CHURCH,
              branchId: BRANCH,
              memberNumber: "CH-100",
              membershipStatus: "active",
              portalAccessStatus: "not_activated",
            },
            productIdentifiers: [
              { key: "member_number", valueNormalized: "CH-100", blocking: true },
            ],
          }),
          loadDuplicateCandidates: async () => ({ ok: true, candidates: [] }),
          createProductRelationship: async () => ({
            ok: true,
            subjectRef: MEMBER_ID,
            productIdentifier: "CH-100",
            relationshipStatus: "active",
            portalAccessStatus: "not_activated",
            productRecord: { member: { id: MEMBER_ID, status: "active" } },
            location: { organizationId: ORG, churchId: CHURCH, branchId: BRANCH },
          }),
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.membershipStatus, MEMBERSHIP_STATUS.ACTIVE);
    assert.equal(result.portalAccessStatus, PORTAL_ACCESS_STATUS.NOT_ACTIVATED);
    assert.equal(result.productIdentifier, "CH-100");
    assert.equal(result.person.id, PERSON_ID);
    assert.ok(audits.length >= 1);
    } finally {
      memberRepo.findMemberByChurchAndNumber = originalFind;
    }
  });

  it("blocks duplicate Church ID at domain pre-check", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const original = memberRepo.findMemberByChurchAndNumber;
    memberRepo.findMemberByChurchAndNumber = async () => ({
      id: MEMBER_ID,
      memberNumber: "CH-100",
      churchId: CHURCH,
    });
    try {
      const result = await createStaffManagedMember(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          branchId: BRANCH,
          memberNumber: "CH-100",
          demographics: { firstName: "A", lastName: "B" },
        },
        { authorize: allowOnly([MEMBER_PERMISSION.CREATE]) }
      );
      assert.equal(result.ok, false);
      assert.equal(result.code, RESULT.DUPLICATE_CHURCH_ID);
    } finally {
      memberRepo.findMemberByChurchAndNumber = original;
    }
  });

  it("reuses person when safely identified", async () => {
    const db = {
      async query() {
        return {
          rows: [
            {
              id: PERSON_ID,
              organization_id: ORG,
              phone_normalized: "+260971111111",
              email_normalized: null,
              status: "active",
            },
          ],
        };
      },
    };
    const found = await findReusablePersonForMember(db, {
      organizationId: ORG,
      phoneNormalized: "+260971111111",
    });
    assert.equal(found.ok, true);
    assert.equal(found.person.id, PERSON_ID);
    assert.equal(found.reason, "exact_match");

    const ambiguous = await findReusablePersonForMember(
      {
        async query() {
          return {
            rows: [
              { id: "1", organization_id: ORG, status: "active" },
              { id: "2", organization_id: ORG, status: "active" },
            ],
          };
        },
      },
      { organizationId: ORG, emailNormalized: "a@b.com" }
    );
    assert.equal(ambiguous.person, null);
    assert.equal(ambiguous.reason, "ambiguous");
  });
});

describe("V2.04 BB authorization + Church ID immutability + portal block", () => {
  it("denies create without members.create", async () => {
    const result = await createStaffManagedMember(
      {},
      {
        actorUserId: ACTOR,
        organizationId: ORG,
        churchId: CHURCH,
        branchId: BRANCH,
        demographics: { firstName: "A", lastName: "B" },
      },
      { authorize: allowOnly([MEMBER_PERMISSION.VIEW]) }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.UNAUTHORIZED);
  });

  it("member cannot edit Church ID; staff manageChurchId requires permission", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    const originalUpdate = memberRepo.updateMemberDomainProfile;
    memberRepo.findMemberById = async () => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      memberNumber: "CH-1",
      phoneNormalized: "+260971111111",
      portalAccessStatus: "not_activated",
      status: "active",
    });
    memberRepo.updateMemberDomainProfile = async () => {
      throw new Error("should_not_update");
    };
    try {
      const denied = await updateMemberProfile(
        {},
        {
          actorKind: "member_self",
          actorMemberId: MEMBER_ID,
          memberId: MEMBER_ID,
          churchId: CHURCH,
          memberNumber: "CH-HACK",
        }
      );
      assert.equal(denied.code, RESULT.CHURCH_ID_IMMUTABLE);

      const noPerm = await manageChurchId(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          memberId: MEMBER_ID,
          memberNumber: "CH-2",
        },
        { authorize: allowOnly([MEMBER_PERMISSION.EDIT]) }
      );
      assert.equal(noPerm.code, RESULT.UNAUTHORIZED);
    } finally {
      memberRepo.findMemberById = originalFind;
      memberRepo.updateMemberDomainProfile = originalUpdate;
    }
  });

  it("blocks/unblocks portal without changing membership status", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    const originalPortal = memberRepo.updatePortalAccessStatus;
    let saved = null;
    memberRepo.findMemberById = async () => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      status: MEMBERSHIP_STATUS.ACTIVE,
      portalAccessStatus: PORTAL_ACCESS_STATUS.ACTIVE,
    });
    memberRepo.updatePortalAccessStatus = async (_db, input) => {
      saved = input;
      return {
        id: MEMBER_ID,
        churchId: CHURCH,
        status: MEMBERSHIP_STATUS.ACTIVE,
        portalAccessStatus: input.portalAccessStatus,
      };
    };
    try {
      const blocked = await setPortalAccessStatus(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          memberId: MEMBER_ID,
          portalAccessStatus: PORTAL_ACCESS_STATUS.BLOCKED,
          reason: "policy",
        },
        { authorize: allowOnly([MEMBER_PERMISSION.BLOCK]) }
      );
      assert.equal(blocked.ok, true);
      assert.equal(saved.portalAccessStatus, "blocked");
      assert.equal(blocked.member.status, MEMBERSHIP_STATUS.ACTIVE);
      assert.equal(blocked.member.portalAccessStatus, "blocked");
    } finally {
      memberRepo.findMemberById = originalFind;
      memberRepo.updatePortalAccessStatus = originalPortal;
    }
  });

  it("member cannot edit official branch via profile", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    memberRepo.findMemberById = async () => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      status: "active",
    });
    try {
      const denied = await updateMemberProfile(
        {},
        {
          actorKind: "member_self",
          actorMemberId: MEMBER_ID,
          memberId: MEMBER_ID,
          churchId: CHURCH,
          branchId: BRANCH, // tenant scope is allowed
          officialBranchId: "00000000-0000-4000-8000-000000000099",
        }
      );
      assert.equal(denied.code, RESULT.BRANCH_NOT_MEMBER_EDITABLE);
    } finally {
      memberRepo.findMemberById = originalFind;
    }
  });

  it("phone change requires verification for member self", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    const originalUpdate = memberRepo.updateMemberDomainProfile;
    memberRepo.findMemberById = async () => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      phoneNormalized: "+260971111111",
      status: "active",
    });
    let patch = null;
    memberRepo.updateMemberDomainProfile = async (_db, fields) => {
      patch = fields;
      return {
        id: MEMBER_ID,
        phoneVerificationRequired: true,
        phonePendingNormalized: fields.phonePendingNormalized,
      };
    };
    try {
      const result = await updateMemberProfile(
        {},
        {
          actorKind: "member_self",
          actorMemberId: MEMBER_ID,
          memberId: MEMBER_ID,
          churchId: CHURCH,
          phoneNormalized: "+260972222222",
        }
      );
      assert.equal(result.ok, true);
      assert.equal(result.phoneVerificationRequired, true);
      assert.equal(patch.phonePendingNormalized, "+260972222222");
      assert.equal(patch.phoneVerificationRequired, true);
      assert.equal(patch.phoneNormalized, undefined);
    } finally {
      memberRepo.findMemberById = originalFind;
      memberRepo.updateMemberDomainProfile = originalUpdate;
    }
  });

  it("sets membership status and clears ordinary active portal on non-active lifecycle", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    const originalStatus = memberRepo.updateMembershipLifecycleStatus;
    const originalPortal = memberRepo.updatePortalAccessStatus;
    let member = {
      id: MEMBER_ID,
      churchId: CHURCH,
      status: "active",
      portalAccessStatus: "active",
      userId: null,
    };
    memberRepo.findMemberById = async () => ({ ...member });
    memberRepo.updateMembershipLifecycleStatus = async (_db, input) => {
      member = { ...member, status: input.status };
      return { ...member };
    };
    memberRepo.updatePortalAccessStatus = async (_db, input) => {
      member = { ...member, portalAccessStatus: input.portalAccessStatus };
      return { ...member };
    };
    try {
      const result = await setMembershipStatus(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: CHURCH,
          memberId: MEMBER_ID,
          membershipStatus: MEMBERSHIP_STATUS.FORMER,
        },
        { authorize: allowOnly([MEMBER_PERMISSION.EDIT]) }
      );
      assert.equal(result.ok, true);
      assert.equal(result.member.status, "former");
      assert.equal(result.member.portalAccessStatus, "not_activated");
      assert.equal(result.portalAdjusted, true);
    } finally {
      memberRepo.findMemberById = originalFind;
      memberRepo.updateMembershipLifecycleStatus = originalStatus;
      memberRepo.updatePortalAccessStatus = originalPortal;
    }
  });

  it("enforces tenant isolation on profile update", async () => {
    const memberRepo = require("../src/blessboard/repositories/memberIdentityRepository");
    const originalFind = memberRepo.findMemberById;
    memberRepo.findMemberById = async () => ({
      id: MEMBER_ID,
      churchId: CHURCH,
      status: "active",
    });
    try {
      const result = await updateMemberProfile(
        {},
        {
          actorUserId: ACTOR,
          organizationId: ORG,
          churchId: "99999999-9999-4999-8999-999999999999",
          memberId: MEMBER_ID,
          firstName: "X",
        },
        { authorize: allowOnly([MEMBER_PERMISSION.EDIT]) }
      );
      assert.equal(result.code, RESULT.TENANT_MISMATCH);
    } finally {
      memberRepo.findMemberById = originalFind;
    }
  });
});

describe("V2.04 BB member domain migration + permissions", () => {
  it("ships additive domain migration with portal + permissions", () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../db/migrations/blessboard/120_member_domain_v204.sql"
      ),
      "utf8"
    );
    assert.match(sql, /portal_access_status/);
    assert.match(sql, /members\.block/);
    assert.match(sql, /members\.manage_church_id/);
    assert.match(sql, /transferred/);
    assert.match(sql, /date_of_birth/);
    assert.match(sql, /next_of_kin_name/);
    assert.doesNotMatch(sql, /DROP TABLE blessboard\.members/);
  });
});
