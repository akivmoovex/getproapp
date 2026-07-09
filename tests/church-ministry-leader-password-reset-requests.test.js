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
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const ministryLeaderPasswordResetRequestsRepo = require("../src/db/pg/church/ministryLeaderPasswordResetRequestsRepo");
const { verifyLeaderPassword } = require("../src/church/leaderAuth");
const {
  validatePublicLeaderForgotPasswordBody,
  validateBranchAdminResetPasswordBody,
  validateRejectPasswordResetBody,
  PUBLIC_SUCCESS_MESSAGE,
} = require("../src/church/ministryLeaderPasswordResetRequestValidation");
const { PASSWORD_RESET_REQUEST_TYPES } = require("../src/church/passwordResetRateLimit");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx, isChurchHost = true) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-leader-password-reset",
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

async function cleanup(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(
      `DELETE FROM public.church_ministry_leader_password_reset_requests WHERE branch_id = $1`,
      [branchId]
    );
    await pool.query(`DELETE FROM public.church_password_reset_rate_limits WHERE branch_id = $1`, [
      branchId,
    ]);
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("validation helpers enforce public and branch admin rules", () => {
  assert.equal(validatePublicLeaderForgotPasswordBody({}).ok, false);
  assert.equal(validatePublicLeaderForgotPasswordBody({ identifier: "leader@example.com" }).ok, true);
  assert.equal(
    validatePublicLeaderForgotPasswordBody({ identifier: "x", email: "bad" }).ok,
    false
  );
  assert.equal(
    validateBranchAdminResetPasswordBody({
      new_password: "12345678",
      confirm_password: "12345678",
    }).ok,
    true
  );
  assert.equal(validateRejectPasswordResetBody({}).ok, false);
  assert.equal(validateRejectPasswordResetBody({ review_comment: "not valid" }).ok, true);
});

test("password reset rate limit types include ministry_leader", () => {
  assert.ok(PASSWORD_RESET_REQUEST_TYPES.includes("ministry_leader"));
});

test("non-church host cannot access /leader/forgot-password", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/leader/forgot-password");
  assert.equal(res.status, 404);
});

test("public leader forgot-password page loads on active branch host", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/leader/forgot-password");
  assert.equal(res.status, 200);
  assert.match(res.text, /Forgot password/i);
  assert.match(res.text, /Submit request/i);
});

test(
  "ministry leader password reset request flow",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ldrpw");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ldrpw_a_${suffix}`,
      name: `Leader PW Reset A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ldrpw_b_${suffix}`,
      name: `Leader PW Reset B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Leader PW Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Leader PW Branch B ${suffix}`,
    });
    const oldPassword = "oldpass123456";
    const newPassword = "newpass123456";
    const passwordHash = await bcrypt.hash(oldPassword, 12);

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Branch Admin A",
      email: `ldr_admin_a_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const ministry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Youth Ministry",
      slug: "youth",
      description: "Youth",
      leader_name: "Grace Mwansa",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const leader = await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      ministry_id: ministry.id,
      full_name: "Grace Mwansa",
      email: `leader_a_${suffix}@example.com`,
      phone: "0977222002",
      password_hash: passwordHash,
      role: "ministry_leader",
      status: "active",
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });

    const knownSubmit = await request(app).post("/leader/forgot-password").type("form").send({
      identifier: `leader_a_${suffix}@example.com`,
      full_name: "Grace Mwansa",
    });
    assert.equal(knownSubmit.status, 303);
    assert.equal(knownSubmit.headers.location, "/leader/forgot-password-submitted");

    const submittedPage = await request(app).get("/leader/forgot-password-submitted");
    assert.equal(submittedPage.status, 200);
    assert.match(
      submittedPage.text,
      new RegExp(PUBLIC_SUCCESS_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    );
    assert.doesNotMatch(submittedPage.text, /leader_a_/i);
    assert.doesNotMatch(submittedPage.text, /not found/i);
    assert.doesNotMatch(submittedPage.text, /no account/i);

    const unknownSubmit = await request(app).post("/leader/forgot-password").type("form").send({
      identifier: `unknown_${suffix}@example.com`,
    });
    assert.equal(unknownSubmit.status, 303);

    const knownRequests = await pool.query(
      `SELECT * FROM public.church_ministry_leader_password_reset_requests
       WHERE branch_id = $1 AND identifier_submitted ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [branchA.id, `%leader_a_${suffix}%`]
    );
    assert.ok(knownRequests.rows[0]);
    assert.equal(knownRequests.rows[0].ministry_leader_id, leader.id);
    assert.equal(knownRequests.rows[0].ministry_id, ministry.id);

    const unknownRequests = await pool.query(
      `SELECT * FROM public.church_ministry_leader_password_reset_requests
       WHERE branch_id = $1 AND identifier_submitted ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [branchA.id, `%unknown_${suffix}%`]
    );
    assert.ok(unknownRequests.rows[0]);
    assert.equal(unknownRequests.rows[0].ministry_leader_id, null);

    const auditRequested = await pool.query(
      `SELECT * FROM public.church_audit_logs
       WHERE branch_id = $1 AND action = 'ministry_leader_password_reset_requested'
       ORDER BY id DESC LIMIT 2`,
      [branchA.id]
    );
    assert.ok(auditRequested.rows.length >= 2);
    for (const row of auditRequested.rows) {
      assert.equal(row.actor_type, "public");
      assert.equal(row.actor_id, null);
      const meta =
        typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json;
      assert.equal(meta.action_source, "ministry_leader_forgot_password_request");
      assert.ok(meta.identifier_masked);
      assert.equal(JSON.stringify(meta).includes(oldPassword), false);
    }

    const rateRows = await pool.query(
      `SELECT * FROM public.church_password_reset_rate_limits
       WHERE branch_id = $1 AND request_type = 'ministry_leader'`,
      [branchA.id]
    );
    assert.ok(rateRows.rows.length >= 1);

    const adminAgent = request.agent(app);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `ldr_admin_a_${suffix}@example.com`,
      password: oldPassword,
    });

    const queue = await adminAgent.get("/branch/leader-password-reset-requests");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Ministry leader password reset requests/i);

    const requestId = knownRequests.rows[0].id;
    const detail = await adminAgent.get(`/branch/leader-password-reset-requests/${requestId}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Grace Mwansa/);

    await pool.query(
      `UPDATE public.church_ministry_leaders
       SET login_locked_until = now() + interval '15 minutes',
           failed_login_attempts = 5
       WHERE id = $1`,
      [leader.id]
    );

    const markReviewed = await adminAgent
      .post(`/branch/leader-password-reset-requests/${requestId}/mark-reviewed`)
      .type("form")
      .send({});
    assert.equal(markReviewed.status, 303);

    const reset = await adminAgent
      .post(`/branch/leader-password-reset-requests/${requestId}/reset-password`)
      .type("form")
      .send({
        new_password: newPassword,
        confirm_password: newPassword,
      });
    assert.equal(reset.status, 303);
    assert.match(reset.headers.location, /notice=reset_completed/);

    const completed =
      await ministryLeaderPasswordResetRequestsRepo.findMinistryLeaderPasswordResetRequestByIdForBranch(
        pool,
        branchA.id,
        requestId
      );
    assert.equal(completed.status, "reset_completed");
    assert.ok(completed.resolved_at);
    assert.ok(completed.resolved_by_branch_admin_id);

    const leaderRow = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leader.id, branchA.id);
    assert.equal(await verifyLeaderPassword(oldPassword, leaderRow.password_hash), false);
    assert.equal(await verifyLeaderPassword(newPassword, leaderRow.password_hash), true);
    assert.ok(!leaderRow.login_locked_until);
    assert.equal(Number(leaderRow.failed_login_attempts), 0);
    assert.ok(leaderRow.last_password_reset_at);
    assert.equal(JSON.stringify(leaderRow).includes(newPassword), false);

    const loginOld = await request(app).post("/leader/login").type("form").send({
      identifier: `leader_a_${suffix}@example.com`,
      password: oldPassword,
    });
    assert.equal(loginOld.status, 400);

    const loginNewAgent = request.agent(app);
    const loginNew = await loginNewAgent.post("/leader/login").type("form").send({
      identifier: `leader_a_${suffix}@example.com`,
      password: newPassword,
    });
    assert.equal(loginNew.status, 302);
    assert.equal(loginNew.headers.location, "/leader/dashboard");

    await pool.query(`UPDATE public.church_ministry_leaders SET status = 'inactive' WHERE id = $1`, [
      leader.id,
    ]);
    const inactiveLogin = await request(app).post("/leader/login").type("form").send({
      identifier: `leader_a_${suffix}@example.com`,
      password: newPassword,
    });
    assert.equal(inactiveLogin.status, 400);
    assert.match(inactiveLogin.text, /inactive/i);

    const statusAttempt = await pool.query(
      `SELECT failure_reason FROM public.church_login_attempts
       WHERE branch_id = $1 AND account_type = 'ministry_leader' AND account_id = $2
         AND failure_reason = 'account_status'
       ORDER BY id DESC LIMIT 1`,
      [branchA.id, leader.id]
    );
    assert.equal(statusAttempt.rows.length, 1);

    const unmatched = unknownRequests.rows[0];
    const unmatchedReset = await adminAgent
      .post(`/branch/leader-password-reset-requests/${unmatched.id}/reset-password`)
      .type("form")
      .send({
        new_password: newPassword,
        confirm_password: newPassword,
      });
    assert.equal(unmatchedReset.status, 400);
    assert.match(unmatchedReset.text, /no matching ministry leader/i);

    const rejectNoComment = await adminAgent
      .post(`/branch/leader-password-reset-requests/${unmatched.id}/reject`)
      .type("form")
      .send({ review_comment: "ab" });
    assert.equal(rejectNoComment.status, 400);

    const rejectOk = await adminAgent
      .post(`/branch/leader-password-reset-requests/${unmatched.id}/reject`)
      .type("form")
      .send({ review_comment: "Could not verify identity" });
    assert.equal(rejectOk.status, 303);

    const crossBranch = await adminAgent.get(
      `/branch/leader-password-reset-requests/${unmatched.id}?branch=${branchB.id}`
    );
    assert.equal(crossBranch.status, 200);

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Branch Admin B",
      email: `ldr_admin_b_${suffix}@example.com`,
      phone: "0977222999",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const adminB = request.agent(appB);
    await adminB.post("/branch/login").type("form").send({
      identifier: `ldr_admin_b_${suffix}@example.com`,
      password: oldPassword,
    });
    const crossAccess = await adminB.get(`/branch/leader-password-reset-requests/${requestId}`);
    assert.equal(crossAccess.status, 404);

    const auditActions = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE branch_id = $1 AND action LIKE 'ministry_leader_password_reset%'
       ORDER BY id ASC`,
      [branchA.id]
    );
    const actions = auditActions.rows.map((r) => r.action);
    assert.ok(actions.includes("ministry_leader_password_reset_requested"));
    assert.ok(actions.includes("ministry_leader_password_reset_request_reviewed"));
    assert.ok(actions.includes("ministry_leader_password_reset_completed_by_branch_admin"));
    assert.ok(actions.includes("ministry_leader_password_reset_request_rejected"));

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
