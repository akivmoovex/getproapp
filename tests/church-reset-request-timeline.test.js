"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const adminRoutes = require("../src/routes/admin");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const memberPasswordResetRequestsRepo = require("../src/db/pg/church/memberPasswordResetRequestsRepo");
const ministryLeaderPasswordResetRequestsRepo = require("../src/db/pg/church/ministryLeaderPasswordResetRequestsRepo");
const branchAdminPasswordResetRequestsRepo = require("../src/db/pg/church/branchAdminPasswordResetRequestsRepo");
const hqAdminPasswordResetRequestsRepo = require("../src/db/pg/church/hqAdminPasswordResetRequestsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const resetRequestTimelineRepo = require("../src/db/pg/church/resetRequestTimelineRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeChurchApp(ctx, isChurchHost = true) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-reset-request-timeline",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = isChurchHost;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

function createAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-reset-request-timeline-admin-test",
      resave: false,
      saveUninitialized: false,
    })
  );
  app.use((req, res, next) => {
    req.tenant = { id: TENANT_ZM, slug: "zm" };
    req.tenantUrlPrefix = "";
    res.locals.asset = (k) => `/${String(k || "").replace(/^\//, "")}`;
    next();
  });
  app.use("/admin", adminRoutes({ db }));
  return app;
}

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

function assertTimelineOldestFirst(events) {
  for (let i = 1; i < events.length; i += 1) {
    const prev = new Date(events[i - 1].occurred_at).getTime();
    const curr = new Date(events[i].occurred_at).getTime();
    assert.ok(prev <= curr, "timeline events should be ordered oldest first");
  }
}

test("buildFallbackResetRequestTimeline orders events oldest first", () => {
  const events = resetRequestTimelineRepo.buildFallbackResetRequestTimeline("member", {
    created_at: "2026-01-01T10:00:00.000Z",
    updated_at: "2026-01-02T11:00:00.000Z",
    resolved_at: "2026-01-03T12:00:00.000Z",
    status: "reviewed",
    resolved_by_name: "Branch Admin",
  });
  assert.equal(events.length, 2);
  assert.equal(events[0].label, "Request Submitted");
  assert.equal(events[1].label, "Marked Reviewed");
  assert.equal(events.every((e) => e.source === "fallback"), true);
  assertTimelineOldestFirst(events);
});

test("buildFallbackResetRequestTimeline includes rejection note", () => {
  const events = resetRequestTimelineRepo.buildFallbackResetRequestTimeline("member", {
    created_at: "2026-01-01T10:00:00.000Z",
    resolved_at: "2026-01-02T12:00:00.000Z",
    status: "rejected",
    review_comment: "Could not verify identity.",
  });
  assert.equal(events.length, 2);
  assert.equal(events[1].label, "Request Rejected");
  assert.equal(events[1].note, "Could not verify identity.");
});

test(
  "getResetRequestTimeline uses fallback when audit logs absent",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("timeline_fallback");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `tl_fb_${suffix}`,
      name: `Timeline Fallback Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Timeline Fallback Branch ${suffix}`,
    });

    const reqRow = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: org.id,
      branchId: branch.id,
      memberId: null,
      identifierSubmitted: `unknown_${suffix}@example.com`,
      fullNameSubmitted: "Unknown",
    });

    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branch.id]);

    const timeline = await resetRequestTimelineRepo.getResetRequestTimeline(pool, {
      request_type: "member",
      request_id: reqRow.id,
      organization_id: org.id,
      branch_id: branch.id,
      requestRow: reqRow,
    });

    assert.equal(timeline.length, 1);
    assert.equal(timeline[0].label, "Request Submitted");
    assert.equal(timeline[0].source, "fallback");

    await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE branch_id = $1`, [
      branch.id,
    ]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);

test(
  "listResetRequestTimelineEvents ignores unrelated audit logs",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("timeline_filter");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `tl_a_${suffix}`,
      name: `Timeline Org A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `tl_b_${suffix}`,
      name: `Timeline Org B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Timeline Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Timeline Branch B ${suffix}`,
    });

    const reqRow = await memberPasswordResetRequestsRepo.createPasswordResetRequest(pool, {
      organizationId: orgA.id,
      branchId: branchA.id,
      memberId: null,
      identifierSubmitted: `user_${suffix}@example.com`,
      fullNameSubmitted: "User",
    });

    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      actor_type: "public",
      action: "member_password_reset_requested",
      entity_type: "password_reset_request",
      entity_id: reqRow.id,
      metadata_json: { request_id: reqRow.id, action_source: "member_forgot_password_request" },
    });

    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      actor_type: "public",
      action: "member_login_failed",
      entity_type: "password_reset_request",
      entity_id: reqRow.id,
      metadata_json: { request_id: reqRow.id },
    });

    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      actor_type: "public",
      action: "member_password_reset_requested",
      entity_type: "password_reset_request",
      entity_id: reqRow.id,
      metadata_json: { request_id: reqRow.id },
    });

    const events = await resetRequestTimelineRepo.listResetRequestTimelineEvents(pool, {
      request_type: "member",
      request_id: reqRow.id,
      organization_id: orgA.id,
      branch_id: branchA.id,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].label, "Request Submitted");
    assert.equal(events[0].source, "audit");

    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = ANY($1::bigint[])`, [
      [branchA.id, branchB.id],
    ]);
    await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE branch_id = ANY($1::bigint[])`, [
      [branchA.id, branchB.id],
    ]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = ANY($1::bigint[])`, [[branchA.id, branchB.id]]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::bigint[])`, [[orgA.id, orgB.id]]);
  }
);

test(
  "reset request detail pages render timeline across request types",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("timeline_pages");
    const secretPassword = "testpass123";
    const passwordHash = await bcrypt.hash(secretPassword, 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `tl_pages_${suffix}`,
      name: `Timeline Pages Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Timeline Pages Branch ${suffix}`,
    });

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Timeline Branch Admin",
      email: `tl_ba_${suffix}@example.com`,
      phone: "0977111301",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `tl_member_${suffix}@example.com`,
      phone: "0977111302",
      full_name: "Timeline Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");

    const ministry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: `Timeline Ministry ${suffix}`,
      slug: "timeline-ministry",
      description: "Test ministry",
    });

    await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: ministry.id,
      full_name: "Timeline Leader",
      email: `tl_leader_${suffix}@example.com`,
      phone: "0977111303",
      password_hash: passwordHash,
      role: "ministry_leader",
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "Timeline HQ Admin",
      email: `tl_hq_${suffix}@example.com`,
      phone: "0977111304",
      password_hash: passwordHash,
      role: "hq_admin",
    });

    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });

    await request(churchApp).post("/forgot-password").type("form").send({
      identifier: `tl_member_${suffix}@example.com`,
      full_name: "Timeline Member",
    });
    await request(churchApp).post("/leader/forgot-password").type("form").send({
      identifier: `tl_leader_${suffix}@example.com`,
      full_name: "Timeline Leader",
    });
    await request(churchApp).post("/branch/forgot-password").type("form").send({
      identifier: `tl_ba_${suffix}@example.com`,
      full_name: "Timeline Branch Admin",
    });
    await request(churchApp).post("/hq/forgot-password").type("form").send({
      identifier: `tl_hq_${suffix}@example.com`,
      full_name: "Timeline HQ Admin",
    });

    const memberReq = (
      await pool.query(
        `SELECT * FROM public.church_member_password_reset_requests
         WHERE branch_id = $1 ORDER BY id DESC LIMIT 1`,
        [branch.id]
      )
    ).rows[0];
    const leaderReq = (
      await pool.query(
        `SELECT * FROM public.church_ministry_leader_password_reset_requests
         WHERE branch_id = $1 ORDER BY id DESC LIMIT 1`,
        [branch.id]
      )
    ).rows[0];
    const branchAdminReq = (
      await pool.query(
        `SELECT * FROM public.church_branch_admin_password_reset_requests
         WHERE branch_id = $1 ORDER BY id DESC LIMIT 1`,
        [branch.id]
      )
    ).rows[0];
    const hqAdminReq = (
      await pool.query(
        `SELECT * FROM public.church_hq_admin_password_reset_requests
         WHERE organization_id = $1 ORDER BY id DESC LIMIT 1`,
        [org.id]
      )
    ).rows[0];

    const branchAgent = request.agent(churchApp);
    await branchAgent.post("/branch/login").type("form").send({
      identifier: `tl_ba_${suffix}@example.com`,
      password: secretPassword,
    });

    const memberDetail = await branchAgent.get(`/branch/password-reset-requests/${memberReq.id}`);
    assert.equal(memberDetail.status, 200);
    assert.match(memberDetail.text, /Request Timeline/i);
    assert.match(memberDetail.text, /Request Submitted/i);

    const leaderDetail = await branchAgent.get(
      `/branch/leader-password-reset-requests/${leaderReq.id}`
    );
    assert.equal(leaderDetail.status, 200);
    assert.match(leaderDetail.text, /Request Timeline/i);
    assert.match(leaderDetail.text, /Request Submitted/i);

    const superHash = await bcrypt.hash("superpw123456", 12);
    const superName = `tl_super_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: superHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const adminApp = createAdminApp();
    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");

    const platformMemberDetail = await superAgent.get(
      `/admin/church/member-password-reset-requests/${memberReq.id}`
    );
    assert.equal(platformMemberDetail.status, 200);
    assert.match(platformMemberDetail.text, /Request Timeline/i);
    assert.match(platformMemberDetail.text, /Request Submitted/i);

    const branchAdminDetail = await superAgent.get(
      `/admin/church/branch-admin-password-reset-requests/${branchAdminReq.id}`
    );
    assert.equal(branchAdminDetail.status, 200);
    assert.match(branchAdminDetail.text, /Request Timeline/i);

    const hqAdminDetail = await superAgent.get(
      `/admin/church/hq-admin-password-reset-requests/${hqAdminReq.id}`
    );
    assert.equal(hqAdminDetail.status, 200);
    assert.match(hqAdminDetail.text, /Request Timeline/i);

    await branchAgent
      .post(`/branch/password-reset-requests/${memberReq.id}/mark-reviewed`)
      .type("form")
      .send({});
    await branchAgent
      .post(`/branch/password-reset-requests/${memberReq.id}/reset-password`)
      .type("form")
      .send({ new_password: "newTimelinePw123", confirm_password: "newTimelinePw123" });

    const memberTimeline = await resetRequestTimelineRepo.getResetRequestTimeline(pool, {
      request_type: "member",
      request_id: memberReq.id,
      organization_id: org.id,
      branch_id: branch.id,
      requestRow: memberReq,
    });
    assert.ok(memberTimeline.length >= 3);
    assertTimelineOldestFirst(memberTimeline);
    assert.equal(memberTimeline[0].label, "Request Submitted");
    assert.equal(memberTimeline[memberTimeline.length - 1].label, "Password Reset Completed");

    const completedMemberDetail = await branchAgent.get(
      `/branch/password-reset-requests/${memberReq.id}`
    );
    assert.match(completedMemberDetail.text, /Marked Reviewed/i);
    assert.match(completedMemberDetail.text, /Password Reset Completed/i);
    assert.doesNotMatch(completedMemberDetail.text, /newTimelinePw123/);
    assert.doesNotMatch(completedMemberDetail.text, /password_hash/i);
    assert.doesNotMatch(completedMemberDetail.text, new RegExp(`tl_member_${suffix}@example.com`, "i"));
    assert.doesNotMatch(completedMemberDetail.text, new RegExp(String(member.id), "i"));

    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `tl_pages_b_${suffix}`,
      name: `Timeline Pages Org B ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Timeline Pages Branch B ${suffix}`,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Other Branch Admin",
      email: `tl_other_ba_${suffix}@example.com`,
      phone: "0977111399",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const churchAppB = makeChurchApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const branchAgentB = request.agent(churchAppB);
    await branchAgentB.post("/branch/login").type("form").send({
      identifier: `tl_other_ba_${suffix}@example.com`,
      password: secretPassword,
    });
    const crossBranch = await branchAgentB.get(`/branch/password-reset-requests/${memberReq.id}`);
    assert.equal(crossBranch.status, 404);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_ministry_leader_password_reset_requests WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_branch_admin_password_reset_requests WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_hq_admin_password_reset_requests WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_ministries WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = ANY($1::bigint[])`, [
      [org.id, orgB.id],
    ]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::bigint[])`, [[org.id, orgB.id]]);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
