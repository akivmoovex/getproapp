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
const branchAdminPasswordResetRequestsRepo = require("../src/db/pg/church/branchAdminPasswordResetRequestsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { verifyBranchAdminPassword } = require("../src/church/branchAdminAuth");
const {
  validatePublicBranchAdminForgotPasswordBody,
  validatePlatformResetPasswordBody,
  validateRejectPasswordResetBody,
  PUBLIC_SUCCESS_MESSAGE,
} = require("../src/church/branchAdminPasswordResetRequestValidation");
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
      secret: "test-church-branch-admin-password-reset",
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
      secret: "church-branch-admin-password-reset-admin-test",
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

async function cleanup(pool, branchId, orgId, adminUserIds = []) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
  await pool.query(
    `DELETE FROM public.church_branch_admin_password_reset_requests WHERE branch_id = $1`,
    [branchId]
  );
  await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  for (const id of adminUserIds) {
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [id]);
  }
}

test("validation helpers enforce public and platform admin rules", () => {
  assert.equal(validatePublicBranchAdminForgotPasswordBody({}).ok, false);
  assert.equal(validatePublicBranchAdminForgotPasswordBody({ identifier: "admin@example.com" }).ok, true);
  assert.equal(
    validatePlatformResetPasswordBody({ new_password: "12345678", confirm_password: "12345678" }).ok,
    true
  );
  assert.equal(validateRejectPasswordResetBody({}).ok, false);
  assert.equal(validateRejectPasswordResetBody({ review_comment: "not valid" }).ok, true);
});

test("non-church host cannot access /branch/forgot-password", async () => {
  const app = makeChurchApp(null, false);
  const res = await request(app).get("/branch/forgot-password");
  assert.equal(res.status, 404);
});

test("public branch admin forgot-password page loads on active branch host", async () => {
  const app = makeChurchApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/forgot-password");
  assert.equal(res.status, 200);
  assert.match(res.text, /Forgot password/i);
});

test(
  "branch admin password reset request flow",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bapwreset");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bapwreset_${suffix}`,
      name: `BA Reset Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `BA Reset Branch ${suffix}`,
    });
    const oldPassword = "oldpass123456";
    const newPassword = "newpass123456";
    const passwordHash = await bcrypt.hash(oldPassword, 12);

    const branchAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Branch Admin One",
      email: `ba_${suffix}@example.com`,
      phone: "0977111201",
      password_hash: passwordHash,
      role: "branch_admin",
    });

    const superHash = await bcrypt.hash("superpw123456", 12);
    const superName = `ba_reset_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: superHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const mgrName = `ba_reset_mgr_${suffix}`;
    const mgrId = await adminUsersRepo.insertUser(pool, {
      username: mgrName,
      passwordHash: superHash,
      role: ROLES.TENANT_MANAGER,
      tenantId: TENANT_ZM,
      displayName: "",
    });

    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });

    const knownSubmit = await request(churchApp).post("/branch/forgot-password").type("form").send({
      identifier: `ba_${suffix}@example.com`,
      full_name: "Branch Admin One",
    });
    assert.equal(knownSubmit.status, 303);
    assert.equal(knownSubmit.headers.location, "/branch/forgot-password-submitted");

    const submittedPage = await request(churchApp).get("/branch/forgot-password-submitted");
    assert.equal(submittedPage.status, 200);
    assert.match(submittedPage.text, new RegExp(PUBLIC_SUCCESS_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(submittedPage.text, /ba_/i);

    const unknownSubmit = await request(churchApp).post("/branch/forgot-password").type("form").send({
      identifier: `unknown_${suffix}@example.com`,
    });
    assert.equal(unknownSubmit.status, 303);

    const knownRow = await pool.query(
      `SELECT * FROM public.church_branch_admin_password_reset_requests
       WHERE branch_id = $1 AND identifier_submitted ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [branch.id, `%ba_${suffix}%`]
    );
    assert.equal(knownRow.rows[0].branch_admin_id, branchAdmin.id);

    const unknownRow = await pool.query(
      `SELECT * FROM public.church_branch_admin_password_reset_requests
       WHERE branch_id = $1 AND identifier_submitted ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [branch.id, `%unknown_${suffix}%`]
    );
    assert.equal(unknownRow.rows[0].branch_admin_id, null);

    const adminApp = createAdminApp();
    const mgrAgent = await adminLoginAgent(adminApp, mgrName, "superpw123456");
    const forbidden = await mgrAgent.get("/admin/church/branch-admin-password-reset-requests");
    assert.equal(forbidden.status, 403);

    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");
    const queue = await superAgent.get("/admin/church/branch-admin-password-reset-requests");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Branch admin password reset requests/i);

    const requestId = knownRow.rows[0].id;
    const detail = await superAgent.get(
      `/admin/church/branch-admin-password-reset-requests/${requestId}`
    );
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Branch Admin One/);

    await superAgent
      .post(`/admin/church/branch-admin-password-reset-requests/${requestId}/mark-reviewed`)
      .type("form")
      .send({});
    await superAgent
      .post(`/admin/church/branch-admin-password-reset-requests/${requestId}/reset-password`)
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });

    const completed =
      await branchAdminPasswordResetRequestsRepo.findBranchAdminPasswordResetRequestByIdForPlatform(
        pool,
        requestId
      );
    assert.equal(completed.status, "reset_completed");

    const adminRow = await branchAdminsRepo.findBranchAdminByIdForPasswordChange(
      pool,
      branchAdmin.id,
      branch.id
    );
    assert.equal(adminRow.password_changed_by, "platform_branch_admin_reset_request");
    assert.equal(await verifyBranchAdminPassword(oldPassword, adminRow.password_hash), false);
    assert.equal(await verifyBranchAdminPassword(newPassword, adminRow.password_hash), true);

    const loginOld = await request(churchApp).post("/branch/login").type("form").send({
      identifier: `ba_${suffix}@example.com`,
      password: oldPassword,
    });
    assert.equal(loginOld.status, 400);

    const loginNew = await request(churchApp).post("/branch/login").type("form").send({
      identifier: `ba_${suffix}@example.com`,
      password: newPassword,
    });
    assert.equal(loginNew.status, 303);

    const unmatchedId = unknownRow.rows[0].id;
    const unmatchedReset = await superAgent
      .post(`/admin/church/branch-admin-password-reset-requests/${unmatchedId}/reset-password`)
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });
    assert.equal(unmatchedReset.status, 400);
    assert.match(unmatchedReset.text, /no matching branch administrator/i);

    const rejectNoComment = await superAgent
      .post(`/admin/church/branch-admin-password-reset-requests/${unmatchedId}/reject`)
      .type("form")
      .send({});
    assert.equal(rejectNoComment.status, 400);

    await superAgent
      .post(`/admin/church/branch-admin-password-reset-requests/${unmatchedId}/reject`)
      .type("form")
      .send({ review_comment: "Could not verify identity." });

    const auditActions = await auditLogsRepo.listRecentAuditLogsForBranch(pool, branch.id, {
      limit: 20,
    });
    const actions = auditActions.map((r) => r.action);
    assert.ok(actions.includes("branch_admin_password_reset_requested"));
    assert.ok(actions.includes("branch_admin_password_reset_request_reviewed"));
    assert.ok(actions.includes("branch_admin_password_reset_completed_by_platform_admin"));
    assert.ok(actions.includes("branch_admin_password_reset_request_rejected"));

    const auditJson = JSON.stringify(auditActions);
    assert.equal(auditJson.includes(newPassword), false);
    assert.equal(auditJson.includes(oldPassword), false);

    await cleanup(pool, branch.id, org.id, [superId, mgrId]);
  }
);
