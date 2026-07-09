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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const hqAdminPasswordResetRequestsRepo = require("../src/db/pg/church/hqAdminPasswordResetRequestsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { verifyHqAdminPassword } = require("../src/church/hqAuth");
const {
  validatePublicHqAdminForgotPasswordBody,
  PUBLIC_SUCCESS_MESSAGE,
} = require("../src/church/hqAdminPasswordResetRequestValidation");
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
      secret: "test-church-hq-admin-password-reset",
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
      secret: "church-hq-admin-password-reset-admin-test",
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

async function cleanup(pool, orgId, adminUserIds = []) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(
    `DELETE FROM public.church_hq_admin_password_reset_requests WHERE organization_id = $1`,
    [orgId]
  );
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  for (const id of adminUserIds) {
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [id]);
  }
}

test("validation helper requires identifier", () => {
  assert.equal(validatePublicHqAdminForgotPasswordBody({}).ok, false);
  assert.equal(validatePublicHqAdminForgotPasswordBody({ identifier: "hq@example.com" }).ok, true);
});

test("non-church host cannot access /hq/forgot-password", async () => {
  const app = makeChurchApp(null, false);
  const res = await request(app).get("/hq/forgot-password");
  assert.equal(res.status, 404);
});

test("public HQ forgot-password page loads on branch church host", async () => {
  const app = makeChurchApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo Org", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/hq/forgot-password");
  assert.equal(res.status, 200);
  assert.match(res.text, /Forgot password/i);
});

test(
  "HQ admin password reset request flow",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("hqpwreset");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqpwreset_${suffix}`,
      name: `HQ Reset Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `HQ Reset Branch ${suffix}`,
    });
    const oldPassword = "oldpass123456";
    const newPassword = "newpass123456";
    const passwordHash = await bcrypt.hash(oldPassword, 12);

    const hqAdmin = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "HQ Admin One",
      email: `hq_${suffix}@example.com`,
      phone: "0977111301",
      password_hash: passwordHash,
      role: "hq_admin",
    });

    const superHash = await bcrypt.hash("superpw123456", 12);
    const superName = `hq_reset_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: superHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });
    const mgrName = `hq_reset_mgr_${suffix}`;
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

    const knownSubmit = await request(churchApp).post("/hq/forgot-password").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      full_name: "HQ Admin One",
    });
    assert.equal(knownSubmit.status, 303);
    assert.equal(knownSubmit.headers.location, "/hq/forgot-password-submitted");

    const submittedPage = await request(churchApp).get("/hq/forgot-password-submitted");
    assert.match(submittedPage.text, new RegExp(PUBLIC_SUCCESS_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(submittedPage.text, /hq_/i);

    await request(churchApp).post("/hq/forgot-password").type("form").send({
      identifier: `unknown_${suffix}@example.com`,
    });

    const knownRow = await pool.query(
      `SELECT * FROM public.church_hq_admin_password_reset_requests
       WHERE organization_id = $1 AND identifier_submitted ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [org.id, `%hq_${suffix}%`]
    );
    assert.equal(knownRow.rows[0].hq_admin_id, hqAdmin.id);
    assert.equal(knownRow.rows[0].branch_id, branch.id);

    const unknownRow = await pool.query(
      `SELECT * FROM public.church_hq_admin_password_reset_requests
       WHERE organization_id = $1 AND identifier_submitted ILIKE $2
       ORDER BY id DESC LIMIT 1`,
      [org.id, `%unknown_${suffix}%`]
    );
    assert.equal(unknownRow.rows[0].hq_admin_id, null);

    await organizationsRepo.suspendOrganization(pool, org.id, {
      reason: "Test suspension",
      platformAdminId: null,
    });
    const suspendedOrg = await organizationsRepo.findOrganizationById(pool, org.id);
    const suspendedApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: suspendedOrg,
      branch,
    });
    const suspendedForgot = await request(suspendedApp).get("/hq/forgot-password");
    assert.equal(suspendedForgot.status, 200);

    const adminApp = createAdminApp();
    const mgrAgent = await adminLoginAgent(adminApp, mgrName, "superpw123456");
    assert.equal((await mgrAgent.get("/admin/church/hq-admin-password-reset-requests")).status, 403);

    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");
    const queue = await superAgent.get("/admin/church/hq-admin-password-reset-requests");
    assert.equal(queue.status, 200);

    const requestId = knownRow.rows[0].id;
    await superAgent
      .post(`/admin/church/hq-admin-password-reset-requests/${requestId}/mark-reviewed`)
      .type("form")
      .send({});
    await superAgent
      .post(`/admin/church/hq-admin-password-reset-requests/${requestId}/reset-password`)
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });

    const completed = await hqAdminPasswordResetRequestsRepo.findHqAdminPasswordResetRequestByIdForPlatform(
      pool,
      requestId
    );
    assert.equal(completed.status, "reset_completed");

    const adminRow = await hqAdminsRepo.findHqAdminByIdForPasswordChange(pool, hqAdmin.id, org.id);
    assert.equal(adminRow.password_changed_by, "platform_hq_admin_reset_request");
    assert.equal(await verifyHqAdminPassword(oldPassword, adminRow.password_hash), false);
    assert.equal(await verifyHqAdminPassword(newPassword, adminRow.password_hash), true);

    const loginOld = await request(suspendedApp).post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: oldPassword,
    });
    assert.equal(loginOld.status, 400);

    const loginNew = await request(suspendedApp).post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: newPassword,
    });
    assert.equal(loginNew.status, 303);

    const unmatchedId = unknownRow.rows[0].id;
    const unmatchedReset = await superAgent
      .post(`/admin/church/hq-admin-password-reset-requests/${unmatchedId}/reset-password`)
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });
    assert.equal(unmatchedReset.status, 400);
    assert.match(unmatchedReset.text, /no matching HQ administrator/i);

    const rejectNoComment = await superAgent
      .post(`/admin/church/hq-admin-password-reset-requests/${unmatchedId}/reject`)
      .type("form")
      .send({});
    assert.equal(rejectNoComment.status, 400);

    await superAgent
      .post(`/admin/church/hq-admin-password-reset-requests/${unmatchedId}/reject`)
      .type("form")
      .send({ review_comment: "Could not verify identity." });

    const auditActions = await auditLogsRepo.listRecentAuditLogsForBranch(pool, branch.id, {
      limit: 20,
    });
    const actions = auditActions.map((r) => r.action);
    assert.ok(actions.includes("hq_admin_password_reset_requested"));
    assert.ok(actions.includes("hq_admin_password_reset_request_reviewed"));
    assert.ok(actions.includes("hq_admin_password_reset_completed_by_platform_admin"));
    assert.ok(actions.includes("hq_admin_password_reset_request_rejected"));

    const auditJson = JSON.stringify(auditActions);
    assert.equal(auditJson.includes(newPassword), false);
    assert.equal(auditJson.includes(oldPassword), false);

    await cleanup(pool, org.id, [superId, mgrId]);
  }
);
