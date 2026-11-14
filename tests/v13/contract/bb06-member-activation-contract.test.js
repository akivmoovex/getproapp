"use strict";

/**
 * BB-06 — Member portal activation contracts and accurate gap reporting.
 * Does not invent a failing default CI job for missing product wiring.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  PURPOSE,
  DECISION,
  verifyMemberActivationIdentityOwnership,
} = require("../../../src/blessboard/services/memberActivationIdentityOwnershipService");
const { RESULTS } = require("../helpers/v13QaStatus");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const IDS = {
  user: "00000000-0000-4000-8000-000000000011",
  other: "00000000-0000-4000-8000-000000000012",
  org: "00000000-0000-4000-8000-000000000013",
  church: "00000000-0000-4000-8000-000000000014",
  member: "00000000-0000-4000-8000-000000000015",
  invite: "00000000-0000-4000-8000-000000000016",
};

function dbFor(invite, member) {
  let call = 0;
  return {
    query: async () => (++call === 1 ? { rows: [invite] } : { rows: [member] }),
  };
}

describe("BB-06 member portal activation contracts", () => {
  it("staff-created members start not_activated until invitation links identity", () => {
    const hq = read("src/blessboard/http/hqMembersAdminRoutes.js");
    assert.match(hq, /PURPOSE|MEMBER_PORTAL_ACTIVATION|invitation/);
    assert.match(hq, /\/hq\/members\/:id\/invitation/);
    const activate = read("src/blessboard/http/memberPortalAuthRoutes.js");
    assert.match(activate, /\/member\/activate/);
    assert.match(activate, /completeFirstTimeActivation/);
  });

  it("identity ownership allows exact recipient and rejects wrong/expired/foreign targets", async () => {
    const pending = {
      id: IDS.invite,
      organization_id: IDS.org,
      church_id: IDS.church,
      member_id: IDS.member,
      recipient_user_id: IDS.user,
      purpose: PURPOSE,
      status: "pending",
      expires_at: new Date(Date.now() + 60_000),
    };
    const member = {
      id: IDS.member,
      church_id: IDS.church,
      organization_id: IDS.org,
      user_id: null,
      portal_access_status: "not_activated",
    };
    const ok = await verifyMemberActivationIdentityOwnership(dbFor(pending, member), {
      invitationId: IDS.invite,
      authenticatedUserId: IDS.user,
      organizationId: IDS.org,
      churchId: IDS.church,
      purpose: PURPOSE,
    });
    assert.equal(ok.decision, DECISION.LINK_ALLOWED);

    const expired = await verifyMemberActivationIdentityOwnership(
      dbFor({ ...pending, expires_at: new Date(Date.now() - 1) }, member),
      {
        invitationId: IDS.invite,
        authenticatedUserId: IDS.user,
        organizationId: IDS.org,
        churchId: IDS.church,
        purpose: PURPOSE,
      }
    );
    assert.equal(expired.decision, DECISION.INVITATION_INVALID);

    const wrongUser = await verifyMemberActivationIdentityOwnership(
      dbFor({ ...pending, recipient_user_id: IDS.other }, member),
      {
        invitationId: IDS.invite,
        authenticatedUserId: IDS.user,
        organizationId: IDS.org,
        churchId: IDS.church,
        purpose: PURPOSE,
      }
    );
    assert.equal(wrongUser.decision, DECISION.IDENTITY_CONFLICT);
  });

  it("connects staff-created members to a single-use invitation without granting admin access", () => {
    const created = read("views/blessboard/v5/hq/member-created.ejs");
    const branchCreated = read("views/blessboard/v5/branch-admin/member-created.ejs");
    const access = read("views/blessboard/v5/branch-admin/member-access.ejs");
    const invite = read("views/blessboard/v5/hq/member-invitation.ejs");
    const acceptPage = read("views/blessboard/v5/member-invite/accept.ejs");
    const issue = read("src/blessboard/services/memberPortalInvitationService.js");
    const acceptRoute = read("src/blessboard/http/inviteAcceptRoutes.js");
    const admin = read("src/blessboard/http/memberPortalInvitationAdminRoutes.js");
    assert.match(created, /\/hq\/members\/<%= member && member.id %>\/invitation/);
    assert.match(branchCreated, /\/branch-admin\/members\/<%= m.id %>\/invitation/);
    assert.match(access, /\/branch-admin\/members\/<%= m.id %>\/invitation/);
    assert.match(invite, /canInvite && \(member\.email_display \|\| member\.user_id\)/);
    assert.match(invite, /member\.user_id \? '\/member-invite\/accept' : '\/member\/invite\/accept'/);
    assert.match(invite, /formAction/);
    assert.doesNotMatch(invite, /verified existing-user identity is required/);
    assert.match(acceptPage, /action="\/member-invite\/accept"/);
    assert.doesNotMatch(acceptPage, /action="\/invite\/accept"/);
    assert.match(issue, /eligible\.member\.user_id \|\| null/);
    assert.match(issue, /portal_access_status='active'/);
    assert.match(issue, /status='expired'/);
    assert.match(issue, /status='pending'/);
    assert.match(issue, /authenticated_ownership_required/);
    assert.match(issue, /member\.portal_access_status === "active"/);
    assert.doesNotMatch(issue, /assignBlessBoardRole|platform_administrator/);
    assert.match(acceptRoute, /router\.post\("\/member\/invite\/accept"/);
    assert.match(acceptRoute, /memberInvitationLimiter/);
    assert.match(admin, /formAction: req\.path/);
    assert.match(admin, /"\/hq\/members", "\/branch-admin\/members"/);
    const matrix = JSON.parse(read("docs/qa/V213_BB_REGRESSION_MATRIX.json"));
    const bb06 = matrix.issues.find((i) => i.id === "BB-06");
    assert.ok(bb06);
    assert.match(bb06.implementationStatus, /REPAIRED|UNCOMMITTED/);
    assert.equal(RESULTS.NOT_RUN, "NOT_RUN");
  });

  it("invite accept routes exist for member portal activation tokens", () => {
    const routes = read("src/blessboard/http/inviteAcceptRoutes.js");
    assert.match(routes, /\/member\/invite\/accept/);
    assert.match(routes, /Activate member portal|memberInvitationLimiter/);
  });
});
