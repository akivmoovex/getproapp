"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PURPOSE,
  DECISION,
  verifyMemberActivationIdentityOwnership,
  authorizeLinkedMemberAccess,
} = require("../src/blessboard/services/memberActivationIdentityOwnershipService");

const IDS = {
  user: "00000000-0000-4000-8000-000000000001",
  other: "00000000-0000-4000-8000-000000000002",
  org: "00000000-0000-4000-8000-000000000003",
  church: "00000000-0000-4000-8000-000000000004",
  member: "00000000-0000-4000-8000-000000000005",
  invite: "00000000-0000-4000-8000-000000000006",
};

function dbFor(invite, member) {
  let call = 0;
  return {
    query: async () => (++call === 1 ? { rows: [invite] } : { rows: [member] }),
  };
}

function input(overrides) {
  return {
    invitationId: IDS.invite,
    authenticatedUserId: IDS.user,
    organizationId: IDS.org,
    churchId: IDS.church,
    purpose: PURPOSE,
    ...overrides,
  };
}

test("allows only an exact bound authenticated recipient without mutation", async () => {
  const result = await verifyMemberActivationIdentityOwnership(
    dbFor({
      id: IDS.invite, organization_id: IDS.org, church_id: IDS.church,
      member_id: IDS.member, recipient_user_id: IDS.user, purpose: PURPOSE,
      status: "pending", expires_at: new Date(Date.now() + 60000),
    }, {
      id: IDS.member, church_id: IDS.church, organization_id: IDS.org,
      user_id: null, portal_access_status: "not_activated",
    }),
    input({})
  );
  assert.equal(result.decision, DECISION.LINK_ALLOWED);
});

test("requires proof for an unbound invitation and rejects wrong users", async () => {
  const base = {
    id: IDS.invite, organization_id: IDS.org, church_id: IDS.church,
    member_id: IDS.member, recipient_user_id: null, purpose: PURPOSE,
    status: "pending", expires_at: new Date(Date.now() + 60000),
  };
  const member = { id: IDS.member, church_id: IDS.church, organization_id: IDS.org,
    user_id: null, portal_access_status: "not_activated" };
  assert.equal(
    (await verifyMemberActivationIdentityOwnership(dbFor(base, member), input({}))).decision,
    DECISION.OWNERSHIP_PROOF_REQUIRED
  );
  assert.equal(
    (await verifyMemberActivationIdentityOwnership(dbFor({ ...base, recipient_user_id: IDS.other }, member), input({}))).decision,
    DECISION.IDENTITY_CONFLICT
  );
});

test("rejects expired, foreign and already-active targets", async () => {
  const base = {
    id: IDS.invite, organization_id: IDS.org, church_id: IDS.church,
    member_id: IDS.member, recipient_user_id: IDS.user, purpose: PURPOSE,
    status: "pending", expires_at: new Date(Date.now() - 1),
  };
  assert.equal(
    (await verifyMemberActivationIdentityOwnership(dbFor(base, {}), input({}))).decision,
    DECISION.INVITATION_INVALID
  );
  const foreign = { ...base, expires_at: new Date(Date.now() + 60000), church_id: IDS.other };
  assert.equal(
    (await verifyMemberActivationIdentityOwnership(dbFor(foreign, {}), input({}))).decision,
    DECISION.TENANT_MISMATCH
  );
  assert.equal(
    (await verifyMemberActivationIdentityOwnership(dbFor({ ...base, expires_at: new Date(Date.now() + 60000) }, {
      id: IDS.member, church_id: IDS.church, organization_id: IDS.org,
      user_id: IDS.user, portal_access_status: "active",
    }), input({}))).decision,
    DECISION.MEMBER_ALREADY_ACTIVE
  );
});

test("member portal authorization requires exact linked user and active access", () => {
  assert.equal(authorizeLinkedMemberAccess({
    authenticatedUserId: IDS.user, memberUserId: IDS.other, portalAccessStatus: "active",
  }).decision, DECISION.IDENTITY_CONFLICT);
  assert.equal(authorizeLinkedMemberAccess({
    authenticatedUserId: IDS.user, memberUserId: IDS.user, portalAccessStatus: "not_activated",
  }).decision, DECISION.OWNERSHIP_PROOF_REQUIRED);
});
