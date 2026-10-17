"use strict";

const assert = require("node:assert/strict");
const crypto = require("crypto");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const { Pool } = require("pg");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const { PURPOSE } = require("../src/blessboard/services/memberActivationIdentityOwnershipService");
const { verifyMemberActivationIdentityOwnership } = require("../src/blessboard/services/memberActivationIdentityOwnershipService");
const { issueMemberPortalInvitation, revokeMemberPortalInvitation } = require("../src/blessboard/services/memberPortalInvitationService");

let pool;
let app;
let context;
let adminId;
let adminCookie;
const fixtures = [];

function cookie(res, name) {
  const line = (res.headers["set-cookie"] || []).find((v) => v.startsWith(`${name}=`));
  return line && line.split(";")[0];
}

async function makeFixture(label, withInvitation = true) {
  const suffix = `${label}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString("hex")}`;
  const email = `v211-token.${suffix}@example.invalid`;
  const user = await createBlessBoardUser(pool, {
    email, displayName: `V211 ${label}`, password: "V211-token-password!",
  });
  assert.equal(user.ok, true, user.message);
  const member = await pool.query(`
    insert into blessboard.members
      (church_id,user_id,first_name,last_name,email_normalized,email_display,status,portal_access_status)
    values ($1,$2,'V211',$3,$4,$4,'active','not_activated') returning id
  `, [context.church_id, user.user.id, label, email]);
  await pool.query(`
    insert into blessboard.member_branch_memberships
      (member_id,branch_id,membership_status,is_primary,joined_at)
    values ($1,$2,'active',true,now())
  `, [member.rows[0].id, context.branch_id]);
  const rawToken = `v211-token-${crypto.randomBytes(24).toString("hex")}`;
  const invitation = withInvitation ? await pool.query(`
    insert into blessboard.member_portal_invitations
      (organization_id,church_id,branch_id,member_id,recipient_user_id,purpose,token_hash,expires_at,invited_by_user_id)
    values ($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days',$5) returning id
  `, [context.organization_id, context.church_id, context.branch_id, member.rows[0].id,
    user.user.id, PURPOSE, hashSessionToken(rawToken)]) : { rows: [{ id: null }] };
  const session = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging", userId: user.user.id,
    organizationId: context.organization_id, churchId: context.church_id, branchId: context.branch_id,
  });
  assert.equal(session.ok, true, session.code);
  const fixture = { userId: user.user.id, memberId: member.rows[0].id,
    invitationId: invitation.rows[0].id, rawToken,
    cookie: `${DEFAULT_V5_COOKIE}=${session.rawToken}` };
  fixtures.push(fixture);
  return fixture;
}

async function accept(fixture, token) {
  const get = await request(app).get(`/member-invite/accept?token=${encodeURIComponent(token)}`)
    .set("Cookie", fixture.cookie);
  assert.equal(get.status, 200);
  const csrfCookie = cookie(get, CSRF_COOKIE);
  const csrf = get.text.match(/name="_csrf" value="([^"]+)"/);
  assert.ok(csrfCookie && csrf);
  return request(app).post("/member-invite/accept")
    .set("Cookie", `${fixture.cookie}; ${csrfCookie}`)
    .type("form").send({ [CSRF_FIELD]: csrf[1], token });
}

describe("V211 member invitation token lifecycle HTTP", () => {
  before(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL || "postgresql:///getpro_v211_test_01?host=/tmp" });
    const result = await pool.query(`
      select c.id church_id,c.organization_id,b.id branch_id
        from blessboard.churches c join blessboard.branches b
          on b.church_id=c.id and b.is_primary=true and b.status='active'
       where c.status='active' limit 1
    `);
    assert.equal(result.rowCount, 1);
    context = result.rows[0];
    const admin = await createBlessBoardUser(pool, {
      email: `v211-token-admin.${process.pid}.${Date.now()}@example.invalid`,
      displayName: "V211 Token Admin", password: "V211-token-admin-password!",
    });
    assert.equal(admin.ok, true);
    adminId = admin.user.id;
    await pool.query(`
      insert into blessboard.user_role_assignments
        (user_id,organization_id,church_id,role_id,scope_type,scope_id,status,assignment_origin,assignment_reason)
      select $1,$2,$3,r.id,'church',$3,'active','manual','V211 token fixture'
        from blessboard.roles r where r.role_key='church_system_administrator' and r.is_active=true
    `, [adminId, context.organization_id, context.church_id]);
    const adminSession = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging", userId: adminId,
      organizationId: context.organization_id, churchId: context.church_id, branchId: context.branch_id,
    });
    assert.equal(adminSession.ok, true, adminSession.code);
    adminCookie = `${DEFAULT_V5_COOKIE}=${adminSession.rawToken}`;
    app = createV5FoundationApp({
      getPool: () => pool,
      env: { ...process.env, NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative", BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*" },
    });
  });

  after(async () => {
    for (const f of fixtures) {
      await pool.query("delete from platform.deployment_sessions where user_id=$1", [f.userId]);
      await pool.query("delete from blessboard.member_portal_invitations where member_id=$1", [f.memberId]);
      await pool.query("delete from blessboard.member_branch_memberships where member_id=$1", [f.memberId]);
      await pool.query("delete from blessboard.members where id=$1", [f.memberId]);
      await pool.query("delete from blessboard.users where id=$1", [f.userId]);
    }
    if (adminId) {
      await pool.query("delete from platform.deployment_sessions where user_id=$1", [adminId]);
      await pool.query("delete from blessboard.user_role_assignments where user_id=$1", [adminId]);
      await pool.query("delete from blessboard.users where id=$1", [adminId]);
    }
    await pool.end();
  });

  it("rejects a revoked token without activation", async () => {
    const f = await makeFixture("revoked");
    const revoked = await revokeMemberPortalInvitation(pool, {
      invitationId: f.invitationId, actorUserId: adminId,
      organizationId: context.organization_id, churchId: context.church_id, branchId: context.branch_id,
    });
    assert.equal(revoked.ok, true);
    const response = await accept(f, f.rawToken);
    assert.equal(response.status, 400);
    const row = await pool.query("select status from blessboard.member_portal_invitations where id=$1", [f.invitationId]);
    const member = await pool.query("select portal_access_status from blessboard.members where id=$1", [f.memberId]);
    assert.equal(row.rows[0].status, "revoked");
    assert.equal(member.rows[0].portal_access_status, "not_activated");
  });

  it("rejects an expired token without activation", async () => {
    const f = await makeFixture("expired");
    await pool.query("update blessboard.member_portal_invitations set created_at=now()-interval '2 minutes', expires_at=now()-interval '1 minute' where id=$1", [f.invitationId]);
    const response = await accept(f, f.rawToken);
    assert.equal(response.status, 400);
    const row = await pool.query("select status from blessboard.member_portal_invitations where id=$1", [f.invitationId]);
    const member = await pool.query("select portal_access_status from blessboard.members where id=$1", [f.memberId]);
    assert.equal(row.rows[0].status, "pending");
    assert.equal(member.rows[0].portal_access_status, "not_activated");
  });

  it("rejects replay after one successful consumed acceptance", async () => {
    const f = await makeFixture("consumed");
    const first = await accept(f, f.rawToken);
    assert.equal(first.status, 200);
    const replay = await accept(f, f.rawToken);
    assert.equal(replay.status, 400);
    const row = await pool.query("select status,accepted_user_id from blessboard.member_portal_invitations where id=$1", [f.invitationId]);
    const member = await pool.query("select portal_access_status,user_id from blessboard.members where id=$1", [f.memberId]);
    assert.equal(row.rows[0].status, "accepted");
    assert.equal(String(row.rows[0].accepted_user_id), String(f.userId));
    assert.equal(member.rows[0].portal_access_status, "active");
    assert.equal(String(member.rows[0].user_id), String(f.userId));
  });

  it("rejects an unknown token safely", async () => {
    const f = await makeFixture("invalid");
    const response = await accept(f, "v211-invalid-token");
    assert.equal(response.status, 400);
    const member = await pool.query("select portal_access_status,user_id from blessboard.members where id=$1", [f.memberId]);
    assert.equal(member.rows[0].portal_access_status, "not_activated");
    assert.equal(String(member.rows[0].user_id), String(f.userId));
  });

  it("rejects acceptance with an invalid CSRF token", async () => {
    const f = await makeFixture("csrf");
    const get = await request(app).get(`/member-invite/accept?token=${encodeURIComponent(f.rawToken)}`)
      .set("Cookie", f.cookie);
    assert.equal(get.status, 200);
    const csrfCookie = cookie(get, CSRF_COOKIE);
    const response = await request(app).post("/member-invite/accept")
      .set("Cookie", `${f.cookie}; ${csrfCookie}`)
      .type("form").send({ [CSRF_FIELD]: "v211-invalid-csrf", token: f.rawToken });
    assert.equal(response.status, 403);
    const row = await pool.query("select status from blessboard.member_portal_invitations where id=$1", [f.invitationId]);
    assert.equal(row.rows[0].status, "pending");
  });

  it("rejects the original token after a real HQ resend", async () => {
    const f = await makeFixture("replaced", false);
    const path = `/hq/members/${f.memberId}/invitation`;
    const page = await request(app).get(path).set("Cookie", adminCookie);
    assert.equal(page.status, 200);
    const csrfCookie = cookie(page, CSRF_COOKIE);
    const csrf = page.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrfCookie && csrf);
    const issue = await request(app).post(path)
      .set("Cookie", `${adminCookie}; ${csrfCookie}`).type("form")
      .send({ [CSRF_FIELD]: csrf[1], action: "issue" });
    assert.equal(issue.status, 200);
    const original = decodeURIComponent(issue.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1]);
    const resendPage = await request(app).get(path).set("Cookie", adminCookie);
    assert.equal(resendPage.status, 200);
    const resendCookie = cookie(resendPage, CSRF_COOKIE);
    const resendCsrf = resendPage.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(resendCookie && resendCsrf);
    const resend = await request(app).post(path)
      .set("Cookie", `${adminCookie}; ${resendCookie}`).type("form")
      .send({ [CSRF_FIELD]: resendCsrf[1], action: "resend" });
    assert.equal(resend.status, 200);
    const replacement = decodeURIComponent(resend.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1]);
    assert.notEqual(original, replacement);
    const states = await pool.query(
      "select status,token_hash from blessboard.member_portal_invitations where member_id=$1 order by created_at",
      [f.memberId],
    );
    assert.equal(states.rows.length, 2);
    assert.equal(states.rows[0].status, "revoked");
    assert.equal(states.rows[1].status, "pending");
    assert.notEqual(states.rows[0].token_hash, states.rows[1].token_hash);
    const accepted = await accept(f, original);
    assert.equal(accepted.status, 400);
    const final = await pool.query(
      "select status from blessboard.member_portal_invitations where member_id=$1 order by created_at",
      [f.memberId],
    );
    const member = await pool.query(
      "select portal_access_status,user_id from blessboard.members where id=$1", [f.memberId],
    );
    assert.deepEqual(final.rows.map((row) => row.status), ["revoked", "pending"]);
    assert.equal(member.rows[0].portal_access_status, "not_activated");
    assert.equal(String(member.rows[0].user_id), String(f.userId));
  });

  it("rejects User B and permits User A for a User A invitation", async () => {
    const f = await makeFixture("wrong-recipient");
    const suffix = `${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString("hex")}`;
    const other = await createBlessBoardUser(pool, {
      email: `v211-wrong-recipient.${suffix}@example.invalid`,
      displayName: "V211 Wrong Recipient", password: "V211-token-password!",
    });
    assert.equal(other.ok, true, other.message);
    assert.notEqual(String(other.user.id), String(f.userId));
    const otherSession = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging", userId: other.user.id,
      organizationId: context.organization_id, churchId: context.church_id, branchId: context.branch_id,
    });
    assert.equal(otherSession.ok, true, otherSession.code);
    const otherFixture = { ...f, userId: other.user.id,
      cookie: `${DEFAULT_V5_COOKIE}=${otherSession.rawToken}` };
    try {
      const before = await pool.query(
        "select status,recipient_user_id from blessboard.member_portal_invitations where id=$1",
        [f.invitationId],
      );
      const memberBefore = await pool.query(
        "select portal_access_status,user_id from blessboard.members where id=$1", [f.memberId],
      );
      assert.equal(String(before.rows[0].recipient_user_id), String(f.userId));
      assert.equal(String(memberBefore.rows[0].user_id), String(f.userId));
      const denied = await accept(otherFixture, f.rawToken);
      assert.equal(denied.status, 400);
      const after = await pool.query(
        "select status,recipient_user_id from blessboard.member_portal_invitations where id=$1",
        [f.invitationId],
      );
      const memberAfter = await pool.query(
        "select portal_access_status,user_id from blessboard.members where id=$1", [f.memberId],
      );
      assert.equal(after.rows[0].status, "pending");
      assert.equal(String(after.rows[0].recipient_user_id), String(f.userId));
      assert.equal(memberAfter.rows[0].portal_access_status, "not_activated");
      assert.equal(String(memberAfter.rows[0].user_id), String(f.userId));
      const accepted = await accept(f, f.rawToken);
      assert.equal(accepted.status, 200);
      const final = await pool.query(
        "select status,accepted_user_id from blessboard.member_portal_invitations where id=$1",
        [f.invitationId],
      );
      const active = await pool.query(
        "select portal_access_status,user_id from blessboard.members where id=$1", [f.memberId],
      );
      assert.equal(final.rows[0].status, "accepted");
      assert.equal(String(final.rows[0].accepted_user_id), String(f.userId));
      assert.equal(active.rows[0].portal_access_status, "active");
      assert.equal(String(active.rows[0].user_id), String(f.userId));
    } finally {
      await pool.query("delete from platform.deployment_sessions where user_id=$1", [other.user.id]);
      await pool.query("delete from blessboard.users where id=$1", [other.user.id]);
    }
  });

  it("verifies the unbound-member ownership boundary", async () => {
    const email = `v211-unbound.${process.pid}.${Date.now()}@example.invalid`;
    const inserted = await pool.query(`
      insert into blessboard.members
        (church_id,first_name,last_name,email_normalized,email_display,status,portal_access_status)
      values ($1,'V211','Unbound',$2,$2,'active','not_activated') returning id
    `, [context.church_id, email]);
    const memberId = inserted.rows[0].id;
    await pool.query(`
      insert into blessboard.member_branch_memberships
        (member_id,branch_id,membership_status,is_primary,joined_at)
      values ($1,$2,'active',true,now())
    `, [memberId, context.branch_id]);
    try {
      const path = `/hq/members/${memberId}/invitation`;
      const csrf = issueCsrfToken({ ...process.env, NODE_ENV: "test" });
      const issuance = await request(app).post(path)
        .set("Cookie", `${adminCookie}; ${CSRF_COOKIE}=${csrf}`).type("form")
        .send({ [CSRF_FIELD]: csrf, action: "issue" });
      assert.equal(issuance.status, 400);
      const invitation = await pool.query(
        "select id,status,recipient_user_id from blessboard.member_portal_invitations where member_id=$1",
        [memberId],
      );
      assert.equal(invitation.rowCount, 0);
      const ownership = await verifyMemberActivationIdentityOwnership(pool, {
        invitationId: "00000000-0000-0000-0000-000000000000", authenticatedUserId: adminId,
        purpose: PURPOSE, organizationId: context.organization_id, churchId: context.church_id,
      });
      assert.equal(ownership.ok, false);
      assert.equal(ownership.decision, "INVITATION_INVALID");
      const branchCsrf = issueCsrfToken({ ...process.env, NODE_ENV: "test" });
      const branchPath = `/branch-admin/members/${memberId}/invitation`;
      const branchIssue = await request(app).post(branchPath)
        .set("Cookie", `${adminCookie}; ${CSRF_COOKIE}=${branchCsrf}`).type("form")
        .send({ [CSRF_FIELD]: branchCsrf, action: "issue" });
      assert.equal(branchIssue.status, 400);
      const legacy = await pool.query(`
        insert into blessboard.member_portal_invitations
          (organization_id,church_id,branch_id,member_id,purpose,token_hash,expires_at,invited_by_user_id)
        values ($1,$2,$3,$4,$5,$6,now()+interval '7 days',$7) returning id
      `, [context.organization_id, context.church_id, context.branch_id, memberId,
        PURPOSE, hashSessionToken(`legacy-unbound-${crypto.randomBytes(16).toString("hex")}`), adminId]);
      const resendCsrf = issueCsrfToken({ ...process.env, NODE_ENV: "test" });
      const resend = await request(app).post(path)
        .set("Cookie", `${adminCookie}; ${CSRF_COOKIE}=${resendCsrf}`).type("form")
        .send({ [CSRF_FIELD]: resendCsrf, action: "resend" });
      assert.equal(resend.status, 400);
      const branchResendCsrf = issueCsrfToken({ ...process.env, NODE_ENV: "test" });
      const branchResend = await request(app).post(branchPath)
        .set("Cookie", `${adminCookie}; ${CSRF_COOKIE}=${branchResendCsrf}`).type("form")
        .send({ [CSRF_FIELD]: branchResendCsrf, action: "resend" });
      assert.equal(branchResend.status, 400);
      const legacyState = await pool.query(
        "select status from blessboard.member_portal_invitations where id=$1", [legacy.rows[0].id],
      );
      assert.equal(legacyState.rows[0].status, "pending");
      const member = await pool.query(
        "select user_id,portal_access_status from blessboard.members where id=$1", [memberId],
      );
      assert.equal(member.rows[0].user_id, null);
      assert.equal(member.rows[0].portal_access_status, "not_activated");
    } finally {
      await pool.query("delete from blessboard.member_portal_invitations where member_id=$1", [memberId]);
      await pool.query("delete from blessboard.member_branch_memberships where member_id=$1", [memberId]);
      await pool.query("delete from blessboard.members where id=$1", [memberId]);
    }
  });

  it("serializes concurrent acceptance to one successful HTTP request", async () => {
    for (let run = 0; run < 3; run += 1) {
      const f = await makeFixture(`concurrent-${run}`);
      const second = await createV5Session(pool, {
        deploymentCode: "blessboard-org-staging", userId: f.userId,
        organizationId: context.organization_id, churchId: context.church_id, branchId: context.branch_id,
      });
      assert.equal(second.ok, true, second.code);
      const secondFixture = { ...f, cookie: `${DEFAULT_V5_COOKIE}=${second.rawToken}` };
      const results = await Promise.allSettled([accept(f, f.rawToken), accept(secondFixture, f.rawToken)]);
      assert.equal(results.length, 2);
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
      const statuses = results.map((r) => r.value.status).sort();
      assert.deepEqual(statuses, [200, 400]);
      const invitation = await pool.query(
        "select status,accepted_user_id from blessboard.member_portal_invitations where id=$1",
        [f.invitationId],
      );
      const member = await pool.query(
        "select portal_access_status,user_id from blessboard.members where id=$1", [f.memberId],
      );
      assert.equal(invitation.rows[0].status, "accepted");
      assert.equal(String(invitation.rows[0].accepted_user_id), String(f.userId));
      assert.equal(member.rows[0].portal_access_status, "active");
      assert.equal(String(member.rows[0].user_id), String(f.userId));
      const audit = await pool.query(
        `select count(*)::int as count from platform.audit_events
          where entity_id=$1 and action_key='member_portal_invitation.accepted'`,
        [f.invitationId],
      );
      assert.equal(audit.rows[0].count, 1);
      await pool.query("delete from platform.deployment_sessions where user_id=$1", [f.userId]);
    }
  });
});
