"use strict";

/**
 * V2.04 Phase 6 — Member portal (M20–M27) functional + isolation tests.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  STATUS,
  MEMBER_SELF_EDITABLE_FIELDS,
  publicProfile,
  updateMemberPortalProfile,
} = require("../src/blessboard/services/memberPortalService");
const { PORTAL_ACCESS_STATUS } = require("../src/blessboard/services/memberDomainConstants");

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BRANCH = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MEMBER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function baseMember(overrides) {
  return {
    id: MEMBER,
    churchId: CHURCH,
    userId: USER,
    memberNumber: "CH-10001",
    firstName: "Ada",
    lastName: "Lovelace",
    preferredName: "Ada",
    emailDisplay: "ada@example.com",
    emailNormalized: "ada@example.com",
    phoneNormalized: "+260971234567",
    phoneDisplay: "+260 97 123 4567",
    phonePendingNormalized: null,
    phonePendingDisplay: null,
    phoneVerificationRequired: false,
    dateOfBirth: null,
    occupation: null,
    maritalStatus: null,
    numberOfChildren: null,
    address: {},
    nextOfKin: {},
    portalAccessStatus: PORTAL_ACCESS_STATUS.ACTIVE,
    status: "active",
    ...overrides,
  };
}

describe("V2.04 BB member portal self-edit rules", () => {
  it("exposes approved self-editable fields and never Church ID/branch", () => {
    assert.ok(MEMBER_SELF_EDITABLE_FIELDS.includes("phone"));
    assert.ok(MEMBER_SELF_EDITABLE_FIELDS.includes("occupation"));
    assert.ok(MEMBER_SELF_EDITABLE_FIELDS.includes("nextOfKin"));
    assert.equal(MEMBER_SELF_EDITABLE_FIELDS.includes("memberNumber"), false);
  });

  it("publicProfile includes Church ID as read-only presentation data", () => {
    const profile = publicProfile(
      baseMember(),
      { membershipStatus: "active", isPrimary: true, branchId: BRANCH }
    );
    assert.equal(profile.memberNumber, "CH-10001");
    assert.equal(profile.membershipStatus, "active");
  });

  it("rejects Church ID / official branch mutation attempts", async () => {
    const rejected = await updateMemberPortalProfile(
      {},
      {
        userId: USER,
        churchId: CHURCH,
        branchId: BRANCH,
        organizationId: ORG,
        preferredName: "Ada",
        memberNumber: "CH-HACK",
      },
      {
        requireActiveMemberForTenant: async () => ({
          ok: true,
          status: "ok",
          member: baseMember(),
          membership: {
            membershipStatus: "active",
            isPrimary: true,
            branchId: BRANCH,
          },
        }),
      }
    );
    assert.equal(rejected.ok, false);
    assert.equal(rejected.status, STATUS.INVALID_INPUT);
    assert.match(rejected.reason, /immutable/);
  });

  it("stores phone change as pending verification instead of immediate verified contact", async () => {
    const updated = await updateMemberPortalProfile(
      {},
      {
        userId: USER,
        churchId: CHURCH,
        branchId: BRANCH,
        organizationId: ORG,
        phone: "+260999000111",
        phoneNormalized: "+260999000111",
      },
      {
        requireActiveMemberForTenant: async () => ({
          ok: true,
          status: "ok",
          member: baseMember(),
          membership: {
            membershipStatus: "active",
            isPrimary: true,
            branchId: BRANCH,
          },
        }),
        updateMemberProfile: async (_db, input) => {
          assert.equal(input.actorKind, "member_self");
          assert.equal(input.phoneNormalized, "+260999000111");
          return {
            ok: true,
            code: "ok",
            phoneVerificationRequired: true,
            member: baseMember({
              phonePendingNormalized: "+260999000111",
              phonePendingDisplay: "+260 99 900 0111",
              phoneVerificationRequired: true,
            }),
          };
        },
      }
    );
    assert.equal(updated.ok, true);
    assert.equal(updated.phoneVerificationRequired, true);
    assert.equal(updated.profile.phonePendingNormalized, "+260999000111");
    assert.equal(updated.profile.phoneNormalized, "+260971234567");
  });
});

describe("V2.04 BB ministry join never auto-adds", () => {
  it("joinMinistry always creates pending membership", async () => {
    const participation = require("../src/blessboard/services/participationService");
    const src = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/services/participationService.js"),
      "utf8"
    );
    assert.match(src, /Request to Join is always PENDING/);
    assert.doesNotMatch(
      src,
      /joinPolicy === ["']open["'] \? ["']active["']/
    );
    assert.equal(typeof participation.joinMinistry, "function");
  });
});

describe("V2.04 BB member portal UI + isolation wiring", () => {
  it("ships M20–M27 markers, profile edit/verify templates, and mobile 390 CSS", () => {
    const root = path.join(__dirname, "..");
    const checks = [
      ["views/blessboard/v5/member/dashboard.ejs", "BB-M20"],
      ["views/blessboard/v5/member/profile.ejs", "BB-M21"],
      ["views/blessboard/v5/member/profile-edit.ejs", "BB-M22"],
      ["views/blessboard/v5/member/profile-phone-verify.ejs", "BB-M23"],
      ["views/blessboard/v5/participation/member-ministries.ejs", "BB-M24"],
      ["views/blessboard/v5/participation/member-ministry-detail.ejs", "BB-M25"],
      ["views/blessboard/v5/forms-requests/member-requests.ejs", "BB-M26"],
      ["views/blessboard/v5/forms-requests/member-request-detail.ejs", "BB-M27"],
    ];
    for (const [rel, marker] of checks) {
      const src = fs.readFileSync(path.join(root, rel), "utf8");
      assert.match(src, new RegExp(marker));
    }
    const css = fs.readFileSync(
      path.join(root, "public/blessboard/v5/member-portal-v204.css"),
      "utf8"
    );
    assert.match(css, /max-width:\s*390px/);

    const routes = fs.readFileSync(
      path.join(root, "src/blessboard/http/memberPortalRoutes.js"),
      "utf8"
    );
    assert.match(routes, /\/member\/profile\/edit/);
    assert.match(routes, /\/member\/profile\/phone-verify/);
    assert.match(routes, /startMemberPhoneVerification/);

    const requests = fs.readFileSync(
      path.join(root, "src/blessboard/http/formsRequestsMemberRoutes.js"),
      "utf8"
    );
    assert.match(requests, /memberId: scope\.memberId/);
    assert.match(requests, /forMember:\s*true/);
  });
});
