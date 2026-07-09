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
const membersRepo = require("../src/db/pg/church/membersRepo");
const memberPasswordResetRequestsRepo = require("../src/db/pg/church/memberPasswordResetRequestsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { verifyMemberPassword } = require("../src/church/memberAuth");
const {
  validatePublicForgotPasswordBody,
  validateBranchAdminResetPasswordBody,
  validateRejectPasswordResetBody,
  PUBLIC_SUCCESS_MESSAGE,
} = require("../src/church/memberPasswordResetRequestValidation");
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
      secret: "test-church-member-password-reset",
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
      `DELETE FROM public.church_member_password_reset_requests WHERE branch_id = $1`,
      [branchId]
    );
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("validation helpers enforce public and branch admin rules", () => {
  assert.equal(validatePublicForgotPasswordBody({}).ok, false);
  assert.equal(validatePublicForgotPasswordBody({ identifier: "user@example.com" }).ok, true);
  assert.equal(
    validatePublicForgotPasswordBody({ identifier: "x", email: "bad" }).ok,
    false
  );

  assert.equal(validateBranchAdminResetPasswordBody({}).ok, false);
  assert.equal(
    validateBranchAdminResetPasswordBody({
      new_password: "12345678",
      confirm_password: "12345678",
    }).ok,
    true
  );
  assert.equal(
    validateBranchAdminResetPasswordBody({
      new_password: "12345678",
      confirm_password: "87654321",
    }).ok,
    false
  );

  assert.equal(validateRejectPasswordResetBody({}).ok, false);
  assert.equal(validateRejectPasswordResetBody({ review_comment: "no" }).ok, false);
  assert.equal(validateRejectPasswordResetBody({ review_comment: "not valid" }).ok, true);
});

test("non-church host cannot access /forgot-password", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/forgot-password");
  assert.equal(res.status, 404);
});

test("public forgot-password page loads on active branch host", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/forgot-password");
  assert.equal(res.status, 200);
  assert.match(res.text, /Forgot password/i);
  assert.match(res.text, /Submit request/i);
});

test(
  "member password reset request flow",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pwreset");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pwreset_a_${suffix}`,
      name: `PW Reset Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pwreset_b_${suffix}`,
      name: `PW Reset Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `PW Reset Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `PW Reset Branch B ${suffix}`,
    });
    const oldPassword = "oldpass123456";
    const newPassword = "newpass123456";
    const passwordHash = await bcrypt.hash(oldPassword, 12);

    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Branch Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977111001",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const memberA = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_a_${suffix}@example.com`,
      phone: "0977111002",
      full_name: "Member A",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, memberA.id, branchA.id, "verified");

    const app = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });

    const knownSubmit = await request(app).post("/forgot-password").type("form").send({
      identifier: `member_a_${suffix}@example.com`,
      full_name: "Member A",
    });
    assert.equal(knownSubmit.status, 303);
    assert.equal(knownSubmit.headers.location, "/forgot-password-submitted");

    const submittedPage = await request(app).get("/forgot-password-submitted");
    assert.equal(submittedPage.status, 200);
    assert.match(submittedPage.text, new RegExp(PUBLIC_SUCCESS_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(submittedPage.text, /member_a_/i);
    assert.doesNotMatch(submittedPage.text, /not found/i);
    assert.doesNotMatch(submittedPage.text, /no account/i);

    const unknownSubmit = await request(app).post("/forgot-password").type("form").send({
      identifier: `unknown_${suffix}@example.com`,
    });
    assert.equal(unknownSubmit.status, 303);
    assert.equal(unknownSubmit.headers.location, "/forgot-password-submitted");

    const knownRequests = await pool.query(
      `SELECT * FROM public.church_member_password_reset_requests
       WHERE branch_id = $1 AND identifier_submitted ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [branchA.id, `%member_a_${suffix}%`]
    );
    assert.ok(knownRequests.rows[0]);
    assert.equal(knownRequests.rows[0].member_id, memberA.id);

    const unknownRequests = await pool.query(
      `SELECT * FROM public.church_member_password_reset_requests
       WHERE branch_id = $1 AND identifier_submitted ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [branchA.id, `%unknown_${suffix}%`]
    );
    assert.ok(unknownRequests.rows[0]);
    assert.equal(unknownRequests.rows[0].member_id, null);

    const auditRequested = await pool.query(
      `SELECT * FROM public.church_audit_logs
       WHERE branch_id = $1 AND action = 'member_password_reset_requested'
       ORDER BY id DESC LIMIT 2`,
      [branchA.id]
    );
    assert.ok(auditRequested.rows.length >= 2);
    for (const row of auditRequested.rows) {
      assert.equal(row.actor_type, "public");
      assert.equal(row.actor_id, null);
      const meta =
        typeof row.metadata_json === "string" ? JSON.parse(row.metadata_json) : row.metadata_json;
      assert.equal(meta.action_source, "member_forgot_password_request");
      assert.ok(meta.identifier_masked);
      assert.equal(meta.identifier_masked.includes(oldPassword), false);
    }

    const adminAgent = request.agent(app);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const queue = await adminAgent.get("/branch/password-reset-requests");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Password reset requests/i);

    const requestId = knownRequests.rows[0].id;
    const detail = await adminAgent.get(`/branch/password-reset-requests/${requestId}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Member A/);

    const markReviewed = await adminAgent
      .post(`/branch/password-reset-requests/${requestId}/mark-reviewed`)
      .type("form")
      .send({});
    assert.equal(markReviewed.status, 303);

    const reset = await adminAgent
      .post(`/branch/password-reset-requests/${requestId}/reset-password`)
      .type("form")
      .send({
        new_password: newPassword,
        confirm_password: newPassword,
      });
    assert.equal(reset.status, 303);
    assert.match(reset.headers.location, /notice=reset_completed/);

    const completed = await memberPasswordResetRequestsRepo.findPasswordResetRequestByIdForBranch(
      pool,
      branchA.id,
      requestId
    );
    assert.equal(completed.status, "reset_completed");
    assert.ok(completed.resolved_at);
    assert.ok(completed.resolved_by_branch_admin_id);

    const memberRow = await membersRepo.findMemberByIdForPasswordChange(pool, memberA.id, branchA.id);
    assert.equal(memberRow.password_changed_by, "branch_admin_password_reset");
    assert.equal(await verifyMemberPassword(oldPassword, memberRow.password_hash), false);
    assert.equal(await verifyMemberPassword(newPassword, memberRow.password_hash), true);

    const loginOld = await request(app).post("/login").type("form").send({
      identifier: `member_a_${suffix}@example.com`,
      password: oldPassword,
    });
    assert.equal(loginOld.status, 400);

    const loginNew = await request(app).post("/login").type("form").send({
      identifier: `member_a_${suffix}@example.com`,
      password: newPassword,
    });
    assert.equal(loginNew.status, 303);

    const unmatched = unknownRequests.rows[0];
    const unmatchedDetail = await adminAgent.get(
      `/branch/password-reset-requests/${unmatched.id}`
    );
    assert.equal(unmatchedDetail.status, 200);
    assert.match(unmatchedDetail.text, /No matching member account was found/i);

    const unmatchedReset = await adminAgent
      .post(`/branch/password-reset-requests/${unmatched.id}/reset-password`)
      .type("form")
      .send({
        new_password: newPassword,
        confirm_password: newPassword,
      });
    assert.equal(unmatchedReset.status, 400);
    assert.match(unmatchedReset.text, /no matching member/i);

    const rejectNoComment = await adminAgent
      .post(`/branch/password-reset-requests/${unmatched.id}/reject`)
      .type("form")
      .send({});
    assert.equal(rejectNoComment.status, 400);

    const rejectOk = await adminAgent
      .post(`/branch/password-reset-requests/${unmatched.id}/reject`)
      .type("form")
      .send({ review_comment: "Could not verify identity." });
    assert.equal(rejectOk.status, 303);

    const rejected = await memberPasswordResetRequestsRepo.findPasswordResetRequestByIdForBranch(
      pool,
      branchB.id,
      unmatched.id
    );
    assert.equal(rejected, null);

    const rejectedA = await memberPasswordResetRequestsRepo.findPasswordResetRequestByIdForBranch(
      pool,
      branchA.id,
      unmatched.id
    );
    assert.equal(rejectedA.status, "rejected");

    const crossBranch = await adminAgent.get(
      `/branch/password-reset-requests/${unmatched.id + 99999}`
    );
    assert.equal(crossBranch.status, 404);

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const adminB = request.agent(appB);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Branch Admin B",
      email: `admin_b_${suffix}@example.com`,
      phone: "0977111003",
      password_hash: passwordHash,
      role: "branch_admin",
    });
    await adminB.post("/branch/login").type("form").send({
      identifier: `admin_b_${suffix}@example.com`,
      password: "testpass123",
    });
    const crossAccess = await adminB.get(`/branch/password-reset-requests/${requestId}`);
    assert.equal(crossAccess.status, 404);

    const auditActions = await auditLogsRepo.listRecentAuditLogsForBranch(pool, branchA.id, {
      limit: 20,
    });
    const actions = auditActions.map((r) => r.action);
    assert.ok(actions.includes("member_password_reset_requested"));
    assert.ok(actions.includes("member_password_reset_request_reviewed"));
    assert.ok(actions.includes("member_password_reset_completed_by_branch_admin"));
    assert.ok(actions.includes("member_password_reset_request_rejected"));

    const auditJson = JSON.stringify(auditActions);
    assert.equal(auditJson.includes(newPassword), false);
    assert.equal(auditJson.includes(oldPassword), false);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
