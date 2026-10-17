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

let pool;
let app;
let fixture;
const created = { users: [], sessions: [], roles: [], members: [], invitations: [], branches: [] };

function cookie(res, name) {
  const line = (res.headers["set-cookie"] || []).find((v) => v.startsWith(`${name}=`));
  return line && line.split(";")[0];
}

async function user(email, displayName) {
  const result = await createBlessBoardUser(pool, {
    email, displayName, password: "V211-management-password!",
  });
  assert.equal(result.ok, true, result.message);
  created.users.push(result.user.id);
  return result.user.id;
}

async function role(userId, roleKey, orgId, churchId, branchId) {
  const result = await pool.query(`
    insert into blessboard.user_role_assignments
      (user_id, organization_id, church_id, role_id, scope_type, scope_id,
       status, assignment_origin, assignment_reason)
    select $1,$2,$3,r.id,$4,$5,'active','manual','V211 HTTP fixture'
      from blessboard.roles r
     where r.role_key=$6 and r.is_active=true
    returning id
  `, [userId, orgId, churchId, branchId ? "branch" : "church",
    branchId || churchId, roleKey]);
  assert.equal(result.rowCount, 1, `role ${roleKey} missing`);
  created.roles.push(result.rows[0].id);
}

async function session(userId, orgId, churchId, branchId) {
  const result = await createV5Session(pool, {
    deploymentCode: "blessboard-org-staging", userId,
    organizationId: orgId, churchId, branchId,
  });
  assert.equal(result.ok, true, result.code);
  created.sessions.push(result.rawToken);
  return `${DEFAULT_V5_COOKIE}=${result.rawToken}`;
}

describe("V211 member invitation management HTTP", () => {
  before(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL || "postgresql:///getpro_v211_test_01?host=/tmp" });
    const context = await pool.query(`
      select c.id church_id,c.organization_id,b.id branch_id,d.hostname
        from blessboard.churches c
        join blessboard.branches b on b.church_id=c.id and b.is_primary=true and b.status='active'
        left join platform.domains d on d.organization_id=c.organization_id and d.status='active'
       where c.status='active' order by d.hostname nulls last limit 1
    `);
    assert.equal(context.rowCount, 1);
    const c = context.rows[0];
    const branch2 = await pool.query(`
      select id from blessboard.branches
       where church_id=$1 and status='active' and id<>$2 limit 1
    `, [c.church_id, c.branch_id]);
    if (branch2.rowCount === 0) {
      const insertedBranch = await pool.query(`
        insert into blessboard.branches
          (church_id,branch_key,display_name,branch_type,status,is_primary,timezone,country_code)
        values ($1,$2,'V211 Branch A2','branch','active',false,'Africa/Lusaka','ZM')
        returning id
      `, [c.church_id, `v211-a2-${process.pid}-${Date.now()}`]);
      branch2.rows = insertedBranch.rows;
      created.branches.push(branch2.rows[0].id);
    }
    const foreign = await pool.query(`
      select c.id church_id,c.organization_id,b.id branch_id
        from blessboard.churches c
        join blessboard.branches b on b.church_id=c.id and b.status='active' and b.is_primary=true
       where c.id<>$1 and c.status='active' limit 1
    `, [c.church_id]);
    assert.equal(foreign.rowCount, 1, "foreign church fixture required");
    const suffix = `${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString("hex")}`;
    const hq = await user(`v211-hq.${suffix}@example.invalid`, "V211 HQ");
    const branch = await user(`v211-branch.${suffix}@example.invalid`, "V211 Branch");
    const recipient = await user(`v211-recipient.${suffix}@example.invalid`, "V211 Recipient");
    const viewHq = await user(`v211-view-hq.${suffix}@example.invalid`, "V211 View HQ");
    const viewBranch = await user(`v211-view-branch.${suffix}@example.invalid`, "V211 View Branch");
    await role(hq, "church_system_administrator", c.organization_id, c.church_id, null);
    await role(branch, "branch_administrator", c.organization_id, c.church_id, c.branch_id);
    await role(viewHq, "auditor", c.organization_id, c.church_id, null);
    await role(viewBranch, "auditor", c.organization_id, c.church_id, c.branch_id);
    const member = await pool.query(`
      insert into blessboard.members
        (church_id,user_id,first_name,last_name,email_normalized,email_display,status,portal_access_status)
      values ($1,$2,'V211','Invite',$3,$3,'active','not_activated') returning id
    `, [c.church_id, recipient, `v211-recipient.${suffix}@example.invalid`]);
    created.members.push(member.rows[0].id);
    let memberA2Id;
    let memberBId;
    for (const target of [
      { church: c.church_id, user: recipient, branch: branch2.rows[0].id, label: "A2" },
      { church: foreign.rows[0].church_id, user: recipient, branch: foreign.rows[0].branch_id, label: "B" },
    ]) {
      const foreignMember = await pool.query(`
        insert into blessboard.members
          (church_id,user_id,first_name,last_name,email_normalized,email_display,status,portal_access_status)
        values ($1,$2,'V211','Foreign',$3,$3,'active','not_activated') returning id
      `, [target.church, target.user, `v211-${target.label}.${suffix}@example.invalid`]);
      created.members.push(foreignMember.rows[0].id);
      if (target.label === "A2") memberA2Id = foreignMember.rows[0].id;
      else memberBId = foreignMember.rows[0].id;
      await pool.query(`
        insert into blessboard.member_branch_memberships
          (member_id,branch_id,membership_status,is_primary,joined_at)
        values ($1,$2,'active',true,now())
      `, [foreignMember.rows[0].id, target.branch]);
    }
    await pool.query(`
      insert into blessboard.member_branch_memberships
        (member_id,branch_id,membership_status,is_primary,joined_at)
      values ($1,$2,'active',true,now())
    `, [member.rows[0].id, c.branch_id]);
    fixture = {
      ...c, memberId: member.rows[0].id, memberA2Id, memberBId, branch2Id: branch2.rows[0].id,
      foreignChurchId: foreign.rows[0].church_id, foreignOrgId: foreign.rows[0].organization_id,
      hq: await session(hq, c.organization_id, c.church_id, c.branch_id),
      branch: await session(branch, c.organization_id, c.church_id, c.branch_id),
      member: await session(recipient, c.organization_id, c.church_id, c.branch_id),
      viewHq: await session(viewHq, c.organization_id, c.church_id, c.branch_id),
      viewBranch: await session(viewBranch, c.organization_id, c.church_id, c.branch_id),
    };
    app = createV5FoundationApp({
      getPool: () => pool,
      env: { ...process.env, NODE_ENV: "test", PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging", BLESSBOARD_TENANT_ROUTING_MODE: "authoritative", BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*", BLESSBOARD_APEX_ORIGIN: "https://blessboard.org", PUBLIC_SCHEME: "https" },
    });
  });

  after(async () => {
    if (!pool) return;
    for (const id of created.members) await pool.query("delete from blessboard.member_portal_invitations where member_id=$1", [id]);
    for (const id of created.members) {
      await pool.query("delete from blessboard.member_branch_memberships where member_id=$1", [id]);
      await pool.query("delete from blessboard.members where id=$1", [id]);
    }
    for (const id of created.branches) await pool.query("delete from blessboard.branches where id=$1", [id]);
    for (const id of created.sessions) await pool.query("delete from platform.deployment_sessions where session_token_hash=encode(digest($1,'sha256'),'hex')", [id]).catch(() => {});
    for (const id of created.roles) await pool.query("delete from blessboard.user_role_assignments where id=$1", [id]);
    for (const id of created.users) {
      await pool.query("delete from platform.deployment_sessions where user_id=$1", [id]);
      await pool.query("delete from blessboard.users where id=$1", [id]);
    }
    await pool.end();
  });

  async function act(path, authCookie, action) {
    const get = await request(app).get(path).set("Host", fixture.hostname || "localhost").set("Cookie", authCookie);
    assert.equal(get.status, 200);
    const csrf = cookie(get, CSRF_COOKIE);
    const field = get.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf && field);
    return request(app).post(path).set("Host", fixture.hostname || "localhost").set("Cookie", authCookie + "; " + csrf).type("form")
      .send({ [CSRF_FIELD]: field[1], action });
  }

  async function denied(path, authCookie) {
    const get = await request(app).get(path).set("Host", fixture.hostname || "localhost").set("Cookie", authCookie);
    if (get.status !== 200) return get.status;
    const csrf = cookie(get, CSRF_COOKIE);
    const field = get.text.match(/name="_csrf" value="([^"]+)"/);
    assert.ok(csrf && field);
    const post = await request(app).post(path).set("Host", fixture.hostname || "localhost")
      .set("Cookie", authCookie + "; " + csrf).type("form")
      .send({ [CSRF_FIELD]: field[1], action: "issue" });
    return post.status;
  }

  it("executes authorized HQ issue, resend and revoke lifecycle", async () => {
    const path = `/hq/members/${fixture.memberId}/invitation`;
    const hq = await act(path, fixture.hq, "issue");
    assert.equal(hq.status, 200);
    const firstToken = hq.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
    const invitation = await pool.query("select id,purpose,recipient_user_id,status,token_hash from blessboard.member_portal_invitations where member_id=$1", [fixture.memberId]);
    assert.equal(invitation.rowCount, 1);
    assert.equal(invitation.rows[0].purpose, "MEMBER_PORTAL_ACTIVATION");
    assert.equal(invitation.rows[0].status, "pending");
    assert.ok(invitation.rows[0].token_hash);
    created.invitations.push(invitation.rows[0].id);
    const resent = await act(path, fixture.hq, "resend");
    assert.equal(resent.status, 200);
    const secondToken = resent.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
    assert.notEqual(secondToken, firstToken);
    const afterResend = await pool.query("select id,status,token_hash from blessboard.member_portal_invitations where member_id=$1 order by created_at", [fixture.memberId]);
    assert.equal(afterResend.rows.filter((row) => row.status === "pending").length, 1);
    assert.equal(afterResend.rows.filter((row) => row.status === "revoked").length, 1);
    created.invitations.push(afterResend.rows[afterResend.rows.length - 1].id);
    const revoked = await act(path, fixture.hq, "revoke");
    assert.equal(revoked.status, 200);
    const final = await pool.query("select status from blessboard.member_portal_invitations where member_id=$1", [fixture.memberId]);
    assert.equal(final.rows.filter((row) => row.status === "pending").length, 0);
    assert.equal(final.rows.filter((row) => row.status === "revoked").length, 2);
    const member = await pool.query("select portal_access_status from blessboard.members where id=$1", [fixture.memberId]);
    assert.equal(member.rows[0].portal_access_status, "not_activated");
  });

  it("rejects missing CSRF on the HQ mutation route", async () => {
    const denied = await request(app).post(`/hq/members/${fixture.memberId}/invitation`)
      .set("Host", fixture.hostname || "localhost").set("Cookie", fixture.hq).type("form").send({ action: "issue" });
    assert.equal(denied.status, 403);
  });

  it("denies anonymous and ordinary-member HQ/branch mutations", async () => {
    for (const path of [
      `/hq/members/${fixture.memberId}/invitation`,
      `/branch-admin/members/${fixture.memberId}/invitation`,
    ]) {
      const anonymous = await request(app).post(path).set("Host", fixture.hostname || "localhost")
        .type("form").send({ action: "issue" });
      assert.equal(anonymous.status, 403);
      const member = await request(app).post(path).set("Host", fixture.hostname || "localhost")
        .set("Cookie", fixture.member).type("form").send({ action: "issue" });
      assert.equal(member.status, 403);
    }
  });

  it("executes authorized branch issue, resend and revoke lifecycle", async () => {
    const path = `/branch-admin/members/${fixture.memberId}/invitation`;
    const issued = await act(path, fixture.branch, "issue");
    assert.equal(issued.status, 200);
    const first = await pool.query(
      "select id,status,branch_id from blessboard.member_portal_invitations where member_id=$1 and status='pending'",
      [fixture.memberId]
    );
    assert.equal(first.rowCount, 1);
    assert.equal(String(first.rows[0].branch_id), String(fixture.branch_id));
    created.invitations.push(first.rows[0].id);
    const resent = await act(path, fixture.branch, "resend");
    assert.equal(resent.status, 200);
    const replacement = await pool.query(
      "select status from blessboard.member_portal_invitations where member_id=$1",
      [fixture.memberId]
    );
    assert.equal(replacement.rows.filter((row) => row.status === "pending").length, 1);
    const revoked = await act(path, fixture.branch, "revoke");
    assert.equal(revoked.status, 200);
    const final = await pool.query(
      "select status from blessboard.member_portal_invitations where member_id=$1",
      [fixture.memberId]
    );
    assert.equal(final.rows.filter((row) => row.status === "pending").length, 0);
    assert.equal(final.rows.filter((row) => row.status === "revoked").length >= 2, true);
  });

  it("denies HQ view-only users", async () => {
    assert.equal(await denied(`/hq/members/${fixture.memberId}/invitation`, fixture.viewHq), 403);
  });

  it("denies branch view-only users", async () => {
    assert.equal(await denied(`/branch-admin/members/${fixture.memberId}/invitation`, fixture.viewBranch), 403);
  });

  it("denies HQ foreign-church members", async () => {
    assert.ok([403, 404].includes(await denied(`/hq/members/${fixture.memberBId}/invitation`, fixture.hq)));
  });

  it("denies branch foreign-church members", async () => {
    assert.ok([403, 404].includes(await denied(`/branch-admin/members/${fixture.memberBId}/invitation`, fixture.branch)));
  });

  it("denies branch foreign-branch members", async () => {
    assert.ok([400, 403, 404].includes(await denied(`/branch-admin/members/${fixture.memberA2Id}/invitation`, fixture.branch)));
  });

  it("denies HQ foreign-organization members", async () => {
    assert.ok([403, 404].includes(await denied(`/hq/members/${fixture.memberBId}/invitation`, fixture.hq)));
  });

  it("denies branch foreign-organization members", async () => {
    assert.ok([403, 404].includes(await denied(`/branch-admin/members/${fixture.memberBId}/invitation`, fixture.branch)));
  });

  it("rejects deliberately invalid CSRF on HQ and branch mutations", async () => {
    for (const [path, authCookie] of [
      [`/hq/members/${fixture.memberId}/invitation`, fixture.hq],
      [`/branch-admin/members/${fixture.memberId}/invitation`, fixture.branch],
    ]) {
      const response = await request(app).post(path)
        .set("Host", fixture.hostname || "localhost")
        .set("Cookie", authCookie)
        .type("form")
        .send({ [CSRF_FIELD]: "v211-invalid-csrf", action: "issue" });
      assert.equal(response.status, 403);
    }
  });

  it("protects one-time invitation secrets across HQ and branch presentation", async () => {
    const hqPath = `/hq/members/${fixture.memberId}/invitation`;
    const issued = await act(hqPath, fixture.hq, "issue");
    assert.equal(issued.status, 200);
    assert.equal(issued.headers["cache-control"], "no-store");
    assert.equal(issued.headers["referrer-policy"], "no-referrer");
    const original = issued.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
    assert.ok(original);
    const refresh = await request(app).get(hqPath).set("Cookie", fixture.hq);
    assert.equal(refresh.status, 200);
    assert.equal(refresh.headers["cache-control"], "no-store");
    assert.equal(refresh.headers["referrer-policy"], "no-referrer");
    assert.equal(refresh.text.includes(original), false);
    const view = await request(app).get(hqPath).set("Cookie", fixture.viewHq);
    assert.equal(view.status, 200);
    assert.equal(view.text.includes(original), false);
    assert.equal(view.text.includes('value="issue"'), false);
    const foreign = await request(app).get(`/hq/members/${fixture.memberBId}/invitation`)
      .set("Cookie", fixture.hq);
    assert.equal(foreign.status, 404);
    assert.equal(foreign.text.includes(original), false);
    const resent = await act(hqPath, fixture.hq, "resend");
    assert.equal(resent.status, 200);
    const replacement = resent.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
    assert.ok(replacement);
    assert.notEqual(replacement, original);
    const afterResend = await request(app).get(hqPath).set("Cookie", fixture.hq);
    assert.equal(afterResend.text.includes(original), false);
    assert.equal(afterResend.text.includes(replacement), false);
    const branchPath = `/branch-admin/members/${fixture.memberId}/invitation`;
    const branchRevoke = await act(hqPath, fixture.hq, "revoke");
    assert.equal(branchRevoke.status, 200);
    const branchIssued = await act(branchPath, fixture.branch, "issue");
    assert.equal(branchIssued.status, 200);
    const branchToken = branchIssued.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
    assert.ok(branchToken);
    const branchRefresh = await request(app).get(branchPath).set("Cookie", fixture.branch);
    assert.equal(branchRefresh.status, 200);
    assert.equal(branchRefresh.text.includes(branchToken), false);
    const rows = await pool.query(
      "select token_hash from blessboard.member_portal_invitations where member_id=$1", [fixture.memberId],
    );
    assert.ok(rows.rows.every((row) => row.token_hash && !row.token_hash.includes(original) && !row.token_hash.includes(branchToken)));
  });

  it("keeps issued secrets out of audit, logs and session state", async () => {
    const path = `/hq/members/${fixture.memberId}/invitation`;
    const captured = [];
    const originalConsole = {};
    for (const method of ["log", "info", "warn", "error", "debug"]) {
      originalConsole[method] = console[method];
      console[method] = (...args) => captured.push(args.map(String).join(" "));
    }
    try {
      const clear = await act(path, fixture.hq, "revoke");
      assert.equal(clear.status, 200);
      const issued = await act(path, fixture.hq, "issue");
      assert.equal(issued.status, 200);
      const token = issued.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
      const resent = await act(path, fixture.hq, "resend");
      assert.equal(resent.status, 200);
      const replacement = resent.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
      assert.notEqual(token, replacement);
      const revoked = await act(path, fixture.hq, "revoke");
      assert.equal(revoked.status, 200);
      const events = await pool.query(
        `select action_key,metadata_json::text as metadata
           from platform.audit_events
          where entity_type='member_portal_invitation'
            and entity_id in (
              select id from blessboard.member_portal_invitations where member_id=$1
            )`,
        [fixture.memberId],
      );
      const auditText = events.rows.map((row) => `${row.action_key} ${row.metadata}`).join(" ");
      assert.equal(auditText.includes(token), false);
      assert.equal(auditText.includes(replacement), false);
      const sessions = await pool.query(
        "select context_json::text as context from platform.deployment_sessions where user_id=$1",
        [fixture.recipient],
      );
      const sessionText = sessions.rows.map((row) => row.context || "").join(" ");
      assert.equal(sessionText.includes(token), false);
      assert.equal(sessionText.includes(replacement), false);
      assert.equal(captured.some((line) => line.includes(token) || line.includes(replacement)), false);
    } finally {
      for (const method of ["log", "info", "warn", "error", "debug"]) console[method] = originalConsole[method];
    }
  });

  it("keeps invitation secrets out of client-held cookies", async () => {
    const path = `/hq/members/${fixture.memberId}/invitation`;
    const clear = await act(path, fixture.hq, "revoke");
    assert.ok([200, 400].includes(clear.status));
    const responses = [];
    const page = await request(app).get(path).set("Cookie", fixture.hq);
    responses.push(page);
    const issue = await act(path, fixture.hq, "issue");
    responses.push(issue);
    const first = issue.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
    const refresh = await request(app).get(path).set("Cookie", fixture.hq);
    responses.push(refresh);
    const resend = await act(path, fixture.hq, "resend");
    responses.push(resend);
    const second = resend.text.match(/\/member-invite\/accept\?token=([^<\s]+)/)[1];
    const refresh2 = await request(app).get(path).set("Cookie", fixture.hq);
    responses.push(refresh2);
    const revoke = await act(path, fixture.hq, "revoke");
    responses.push(revoke);
    const refresh3 = await request(app).get(path).set("Cookie", fixture.hq);
    responses.push(refresh3);
    assert.notEqual(first, second);
    const encoded = (value) => encodeURIComponent(value);
    const cookieHeaders = responses.flatMap((response) => response.headers["set-cookie"] || []);
    assert.ok(cookieHeaders.length > 0);
    for (const header of cookieHeaders) {
      assert.equal(header.includes(first), false);
      assert.equal(header.includes(second), false);
      assert.equal(header.includes(encoded(first)), false);
      assert.equal(header.includes(encoded(second)), false);
      assert.equal(header.includes("/member-invite/accept?token="), false);
    }
    const sessionCookie = [fixture.hq, ...cookieHeaders]
      .flatMap((value) => String(value).split(";"))
      .map((value) => value.trim())
      .find((value) => value.startsWith(`${DEFAULT_V5_COOKIE}=`));
    assert.ok(sessionCookie);
    assert.match(sessionCookie.split("=")[1], /^[A-Za-z0-9_-]{32,}$/);
    const csrfHeader = cookieHeaders.find((header) => /^blessboard_org_csrf=/.test(header));
    assert.ok(csrfHeader);
    assert.match(csrfHeader, /SameSite=Lax/i);
    assert.match(csrfHeader, /Path=\//i);
    assert.equal(/Domain=/i.test(csrfHeader), false);
    assert.equal(cookieHeaders.some((header) => /invitation|activation/i.test(header.split("=")[0])), false);
  });
});
