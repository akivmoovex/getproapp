"use strict";

const assert = require("node:assert/strict");
const crypto = require("crypto");
const { describe, it, before, after } = require("node:test");
const request = require("supertest");
const { Pool } = require("pg");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { createV5Session } = require("../src/platform/session/createV5Session");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");
const { CSRF_COOKIE, CSRF_FIELD } = require("../src/platform/http/v5Csrf");
const { createBlessBoardUser } = require("../src/blessboard/services/createBlessBoardUser");
const { hashSessionToken } = require("../src/platform/session/sessionToken");
const { PURPOSE } = require("../src/blessboard/services/memberActivationIdentityOwnershipService");
const { createTenantLoginTransferRequest } = require("../src/platform/services/authTransferService");

let pool;
let app;
let fixture;
let sessionCookie;
let roleAssignmentId;

function cookieValue(response, name) {
  const cookies = response.headers["set-cookie"] || [];
  const line = cookies.find((value) => value.startsWith(`${name}=`));
  return line && line.split(";")[0];
}

describe("V211 member invitation HTTP acceptance", () => {
  before(async () => {
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL || "postgresql:///getpro_v211_test_01?host=/tmp",
    });
    const context = await pool.query(`
      select c.id church_id, c.organization_id, b.id branch_id,
             d.hostname
        from blessboard.churches c
        join blessboard.branches b on b.church_id = c.id
        left join platform.domains d
          on d.organization_id = c.organization_id and d.status = 'active'
       where c.status = 'active' and b.status = 'active' and b.is_primary = true
       order by d.hostname nulls last
       limit 1
    `);
    assert.equal(context.rowCount, 1);
    const suffix = `${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString("hex")}`;
    const email = `v211-http.${suffix}@example.invalid`;
    const user = await createBlessBoardUser(pool, {
      email,
      displayName: "V211 HTTP Member",
      password: "V211-http-password!",
    });
    assert.equal(user.ok, true, user.message);
    const role = await pool.query(`
      insert into blessboard.user_role_assignments
        (user_id, organization_id, church_id, role_id, scope_type, scope_id,
             status, assignment_origin, assignment_reason)
      select $1, $2, $3, r.id, 'church', $3, 'active', 'manual',
             'V211 member login fixture'
        from blessboard.roles r
       where r.role_key = 'member' and r.is_active = true
      returning id
    `, [user.user.id, context.rows[0].organization_id, context.rows[0].church_id]);
    assert.equal(role.rowCount, 1, "active member role required");
    roleAssignmentId = role.rows[0].id;
    const member = await pool.query(`
      insert into blessboard.members
        (church_id, user_id, first_name, last_name, email_normalized,
         email_display, status, portal_access_status)
      values ($1,$2,'V211','HTTP',$3,$3,'active','not_activated')
      returning id, user_id, church_id
    `, [context.rows[0].church_id, user.user.id, email]);
    await pool.query(`
      insert into blessboard.member_branch_memberships
        (member_id, branch_id, membership_status, is_primary, joined_at)
      values ($1, $2, 'active', true, now())
    `, [member.rows[0].id, context.rows[0].branch_id]);
    const token = `v211-http-${crypto.randomBytes(24).toString("hex")}`;
    const invite = await pool.query(`
      insert into blessboard.member_portal_invitations
        (organization_id, church_id, branch_id, member_id, recipient_user_id,
         purpose, token_hash, expires_at, invited_by_user_id)
      values ($1,$2,$3,$4,$5,$6,$7,now()+interval '7 days',$5)
      returning id
    `, [
      context.rows[0].organization_id, context.rows[0].church_id,
      context.rows[0].branch_id, member.rows[0].id, user.user.id,
      PURPOSE, hashSessionToken(token),
    ]);
    fixture = {
      ...context.rows[0], userId: user.user.id, memberId: member.rows[0].id,
      invitationId: invite.rows[0].id, token, email,
      password: "V211-http-password!",
    };
    const session = await createV5Session(pool, {
      deploymentCode: "blessboard-org-staging",
      userId: fixture.userId,
      organizationId: fixture.organization_id,
      churchId: fixture.church_id,
      branchId: fixture.branch_id,
    });
    assert.equal(session.ok, true, session.code);
    sessionCookie = `${DEFAULT_V5_COOKIE}=${session.rawToken}`;
    app = createV5FoundationApp({
      getPool: () => pool,
      env: {
        ...process.env,
        NODE_ENV: "test",
        SESSION_SECRET: process.env.SESSION_SECRET || "v211-http-test-secret",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
        BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
        BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
        BLESSBOARD_APEX_ORIGIN: "https://blessboard.org",
        PUBLIC_SCHEME: "https",
      },
    });
  });

  after(async () => {
    if (pool && fixture) {
      await pool.query("delete from platform.deployment_sessions where user_id=$1", [fixture.userId]);
      await pool.query("delete from platform.auth_transfers where user_id=$1", [fixture.userId]);
      await pool.query("delete from blessboard.user_role_assignments where id=$1", [roleAssignmentId]);
      await pool.query("delete from blessboard.member_portal_invitations where id=$1", [fixture.invitationId]);
      await pool.query("delete from blessboard.member_branch_memberships where member_id=$1", [fixture.memberId]);
      await pool.query("delete from blessboard.members where id=$1", [fixture.memberId]);
      await pool.query("delete from blessboard.users where id=$1", [fixture.userId]);
    }
    if (pool) await pool.end();
  });

  it("performs authenticated GET and POST activation through Express", async () => {
    const get = await request(app)
      .get(`/member-invite/accept?token=${encodeURIComponent(fixture.token)}`)
      .set("Cookie", sessionCookie);
    assert.equal(get.status, 200);
    assert.match(get.text, /Accept member invitation/);
    const csrfCookie = cookieValue(get, CSRF_COOKIE);
    const csrfToken = csrfCookie && decodeURIComponent(csrfCookie.split("=")[1]);
    assert.ok(csrfToken);
    const post = await request(app)
      .post("/member-invite/accept")
      .set("Cookie", [sessionCookie, csrfCookie])
      .type("form")
      .send({ [CSRF_FIELD]: csrfToken, token: fixture.token });
    assert.equal(post.status, 200);
    assert.match(post.text, /Member access activated/);
    const rows = await pool.query(`
      select m.user_id, m.portal_access_status, i.status
        from blessboard.members m
        join blessboard.member_portal_invitations i on i.member_id=m.id
       where i.id=$1
    `, [fixture.invitationId]);
    assert.equal(String(rows.rows[0].user_id), String(fixture.userId));
    assert.equal(rows.rows[0].portal_access_status, "active");
    assert.equal(rows.rows[0].status, "accepted");
    const transfer = await createTenantLoginTransferRequest(pool, {
      deploymentCode: "blessboard-org-staging",
      hostname: fixture.hostname || "localhost",
      organizationId: fixture.organization_id,
      churchId: fixture.church_id,
      branchId: fixture.branch_id,
      returnPath: "/account",
    });
    assert.equal(transfer.ok, true, transfer.status);
    const loginGet = await request(app)
      .get(`/login?tr=${encodeURIComponent(transfer.rawToken)}`)
      .set("Host", "blessboard.org");
    assert.equal(loginGet.status, 200);
    const loginCsrfCookie = cookieValue(loginGet, CSRF_COOKIE);
    const csrfInput = loginGet.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(loginCsrfCookie && csrfInput);
    const loginPost = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .set("Cookie", loginCsrfCookie)
      .type("form")
      .redirects(0)
      .send({
        email: fixture.email,
        password: fixture.password,
        tr: transfer.rawToken,
        _csrf: csrfInput[1],
      });
    assert.equal(loginPost.status, 303, loginPost.text);
    const code = new URL(loginPost.headers.location).searchParams.get("code");
    assert.ok(code);
    const callback = await request(app)
      .get(`/auth/callback?code=${encodeURIComponent(code)}`)
      .set("Host", fixture.hostname || "localhost")
      .redirects(0);
    assert.equal(callback.status, 303, `${fixture.hostname} ${callback.text}`);
    const loginSession = cookieValue(callback, DEFAULT_V5_COOKIE);
    assert.ok(loginSession);
    const portal = await request(app)
      .get("/member")
      .set("Host", fixture.hostname || "localhost")
      .set("Cookie", loginSession);
    assert.equal(portal.status, 200);
  });

  it("rejects anonymous and missing-CSRF POST requests", async () => {
    const anonymous = await request(app).post("/member-invite/accept")
      .type("form").send({ token: fixture.token });
    assert.equal(anonymous.status, 401);
    const missing = await request(app).post("/member-invite/accept")
      .set("Cookie", sessionCookie).type("form").send({ token: fixture.token });
    assert.equal(missing.status, 403);
  });
});
