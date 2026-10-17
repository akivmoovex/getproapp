"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");
const { Pool } = require("pg");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const { acceptMemberPortalInvitation } = require("../src/blessboard/services/memberPortalInvitationAcceptanceService");
const { PURPOSE } = require("../src/blessboard/services/memberActivationIdentityOwnershipService");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");

let pool;
let fixture;
let invitationId;
let rawToken;
let originalPortalStatus;
let createdMemberId;
let createdUserId;

describe("V211 member portal invitation acceptance", () => {
  before(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || "postgresql:///getpro_v211_test_01?host=/tmp",
    });
    const context = await pool.query(`
      select c.id as church_id, c.organization_id, b.id as branch_id
        from blessboard.churches c join blessboard.branches b on b.church_id = c.id
       where c.status = 'active' and b.status = 'active' limit 1
    `);
    assert.equal(context.rowCount, 1, "synthetic church fixture required");
    const suffix = `${process.pid}.${Date.now()}`;
    const user = await createBlessBoardUser(pool, {
      email: `acceptance.${suffix}@example.invalid`,
      displayName: "V211 Acceptance User",
      password: "V211-acceptance-password!",
    });
    assert.equal(user.ok, true, user.message);
    createdUserId = user.user.id;
    const member = await pool.query(`
      insert into blessboard.members
        (church_id, user_id, first_name, last_name, email_normalized,
         email_display, phone_normalized, phone_display, status, portal_access_status)
      values ($1,$2,'V211','Acceptance',$3,$3,$4,$4,'pending','not_activated')
      returning id, user_id, church_id
    `, [context.rows[0].church_id, createdUserId, `acceptance.${suffix}@example.invalid`,
      `+260977${String(process.pid).slice(-4)}01`]);
    fixture = { ...member.rows[0], organization_id: context.rows[0].organization_id };
    createdMemberId = fixture.id;
    originalPortalStatus = "not_activated";
    rawToken = `v211-accept-${crypto.randomBytes(20).toString("hex")}`;
    const inserted = await pool.query(`
      insert into blessboard.member_portal_invitations
        (organization_id, church_id, member_id, recipient_user_id, purpose,
         token_hash, expires_at, invited_by_user_id)
      values ($1,$2,$3,$4,$5,$6,now()+interval '7 days',$4)
      returning id
    `, [fixture.organization_id, fixture.church_id, fixture.id, fixture.user_id,
      PURPOSE, hashSessionToken(rawToken)]);
    invitationId = inserted.rows[0].id;
  });

  after(async () => {
    if (pool && invitationId) {
      await pool.query("delete from blessboard.member_portal_invitations where id = $1", [invitationId]);
      await pool.query("delete from blessboard.members where id = $1", [createdMemberId]);
      await pool.query("delete from blessboard.users where id = $1", [createdUserId]);
    }
    await pool.end();
  });

  it("atomically links the proven existing user, activates membership and consumes once", async () => {
    const result = await acceptMemberPortalInvitation(pool, {
      token: rawToken,
      authenticatedUserId: fixture.user_id,
      organizationId: fixture.organization_id,
      churchId: fixture.church_id,
    });
    assert.equal(result.ok, true, result.reason || result.code);
    const stored = await pool.query(`
      select m.user_id, m.portal_access_status, i.status, i.accepted_user_id
        from blessboard.members m
        join blessboard.member_portal_invitations i on i.member_id = m.id
       where i.id = $1
    `, [invitationId]);
    assert.equal(String(stored.rows[0].user_id), String(fixture.user_id));
    assert.equal(stored.rows[0].portal_access_status, "active");
    assert.equal(stored.rows[0].status, "accepted");
    assert.equal(String(stored.rows[0].accepted_user_id), String(fixture.user_id));
    const replay = await acceptMemberPortalInvitation(pool, {
      token: rawToken,
      authenticatedUserId: fixture.user_id,
      organizationId: fixture.organization_id,
      churchId: fixture.church_id,
    });
    assert.equal(replay.ok, false);
    assert.equal(replay.code, "INVITATION_INVALID");
  });
});
