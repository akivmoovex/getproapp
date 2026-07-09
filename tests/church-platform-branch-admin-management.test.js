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
const churchRoutes = require("../src/routes/church");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const {
  validateCreateBranchAdminBody,
  validateResetBranchAdminPasswordBody,
} = require("../src/church/platformBranchAdminValidation");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-platform-branch-admin-mgmt-test",
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

function makeBranchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "branch-admin-login-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = ctx;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

async function adminLoginAgent(app, username, password) {
  const agent = request.agent(app);
  await agent.post("/admin/login").type("form").send({ username, password }).expect(302);
  return agent;
}

async function cleanupBranch(pool, orgId, branchId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("password reset validation requires matching confirm", () => {
  const result = validateResetBranchAdminPasswordBody({
    new_password: "newpass123",
    confirm_password: "different123",
  });
  assert.equal(result.ok, false);
});

test("create branch admin validation requires password", () => {
  const result = validateCreateBranchAdminBody({
    full_name: "Admin User",
    email: "admin@example.com",
    temporary_password: "short",
  });
  assert.equal(result.ok, false);
});

test("tenant manager cannot list branch admins", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("bamgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `ba_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `bamgr_${suffix}`,
    name: `BA Mgr Org ${suffix}`,
  });
  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: `main${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20),
    host_slug: `main${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 20),
    name: "Main Branch",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get(`/admin/church/branches/${branch.id}/admins`);
  assert.equal(res.status, 403);
  await cleanupBranch(pool, org.id, branch.id);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform branch admin management integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bam");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `bam_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bamorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `BA Mgmt Org ${suffix}`,
    });
    const hostSlug = `bamhost${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: hostSlug,
      host_slug: hostSlug,
      name: "Main Branch",
    });

    const initialPassword = "initialpass123";
    const initialHash = await bcrypt.hash(initialPassword, 12);
    const primaryAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Primary Admin",
      email: `primary_${suffix}@example.com`,
      phone: "0977111000",
      password_hash: initialHash,
    });

    const adminApp = createAdminApp();
    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");

    const listPage = await superAgent.get(`/admin/church/branches/${branch.id}/admins`);
    assert.equal(listPage.status, 200);
    assert.match(listPage.text, /Branch admins/);
    assert.match(listPage.text, /Primary Admin/);

    const secondEmail = `second_${suffix}@example.com`;
    const secondPassword = "secondpass12345";
    const created = await superAgent.post(`/admin/church/branches/${branch.id}/admins`).type("form").send({
      full_name: "Second Admin",
      email: secondEmail,
      phone: "0977222000",
      role: "branch_admin",
      temporary_password: secondPassword,
      notes: "Added by platform admin",
    });
    assert.equal(created.status, 302);

    const secondAdminRow = await pool.query(
      `SELECT * FROM public.church_branch_admins WHERE branch_id = $1 AND lower(trim(email)) = $2 LIMIT 1`,
      [branch.id, secondEmail]
    );
    assert.equal(secondAdminRow.rows.length, 1);
    const secondAdmin = secondAdminRow.rows[0];
    assert.ok(secondAdmin.password_hash.startsWith("$2"));
    assert.notEqual(secondAdmin.password_hash, secondPassword);

    const dup = await superAgent.post(`/admin/church/branches/${branch.id}/admins`).type("form").send({
      full_name: "Duplicate Admin",
      email: secondEmail,
      temporary_password: "anotherpass123",
    });
    assert.equal(dup.status, 400);

    const branchApp = makeBranchApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const branchAgent = request.agent(branchApp);
    const loginSecond = await branchAgent.post("/branch/login").type("form").send({
      identifier: secondEmail,
      password: secondPassword,
    });
    assert.equal(loginSecond.status, 303);
    assert.equal(loginSecond.headers.location, "/branch/dashboard");

    const edited = await superAgent.post(`/admin/church/branches/${branch.id}/admins/${secondAdmin.id}`).type("form").send({
      full_name: "Second Admin Updated",
      email: secondEmail,
      phone: "0977333000",
      role: "branch_admin",
      notes: "Updated notes",
    });
    assert.equal(edited.status, 302);

    const updatedAdmin = await branchAdminsRepo.findBranchAdminById(pool, secondAdmin.id);
    assert.equal(updatedAdmin.full_name, "Second Admin Updated");
    assert.equal(updatedAdmin.phone, "0977333000");

    const deactivated = await superAgent.post(
      `/admin/church/branches/${branch.id}/admins/${secondAdmin.id}/deactivate`
    );
    assert.equal(deactivated.status, 302);
    const inactiveAdmin = await branchAdminsRepo.findBranchAdminById(pool, secondAdmin.id);
    assert.equal(inactiveAdmin.status, "inactive");

    const blockedDash = await branchAgent.get("/branch/dashboard");
    assert.equal(blockedDash.status, 302);
    assert.equal(blockedDash.headers.location, "/branch/login");

    const blockedLogin = await request(branchApp).post("/branch/login").type("form").send({
      identifier: secondEmail,
      password: secondPassword,
    });
    assert.equal(blockedLogin.status, 400);

    const reactivated = await superAgent.post(
      `/admin/church/branches/${branch.id}/admins/${secondAdmin.id}/activate`
    );
    assert.equal(reactivated.status, 302);

    const relogin = await request(branchApp).post("/branch/login").type("form").send({
      identifier: secondEmail,
      password: secondPassword,
    });
    assert.equal(relogin.status, 303);

    const newPassword = "resetpass12345";
    const reset = await superAgent
      .post(`/admin/church/branches/${branch.id}/admins/${secondAdmin.id}/reset-password`)
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });
    assert.equal(reset.status, 302);

    const oldLogin = await request(branchApp).post("/branch/login").type("form").send({
      identifier: secondEmail,
      password: secondPassword,
    });
    assert.equal(oldLogin.status, 400);

    const newLogin = await request(branchApp).post("/branch/login").type("form").send({
      identifier: secondEmail,
      password: newPassword,
    });
    assert.equal(newLogin.status, 303);

    const auditCreate = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE branch_id = $1 AND action = 'platform_church_branch_admin_created'
       ORDER BY id DESC LIMIT 1`,
      [branch.id]
    );
    assert.equal(auditCreate.rows.length, 1);

    const auditReset = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE branch_id = $1 AND action = 'platform_church_branch_admin_password_reset'
       ORDER BY id DESC LIMIT 1`,
      [branch.id]
    );
    assert.equal(auditReset.rows.length, 1);

    await branchesRepo.suspendBranch(pool, branch.id, {
      reason: "Test suspend",
      platformAdminId: superId,
    });
    const manageWhileSuspended = await superAgent.get(`/admin/church/branches/${branch.id}/admins`);
    assert.equal(manageWhileSuspended.status, 200);

    const suspendedBranch = await branchesRepo.findBranchByIdForPlatform(pool, branch.id);
    const suspendedBranchApp = makeBranchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch: suspendedBranch,
    });
    const blockedByBranchStatus = await request(suspendedBranchApp).post("/branch/login").type("form").send({
      identifier: `primary_${suffix}@example.com`,
      password: initialPassword,
    });
    assert.equal(blockedByBranchStatus.status, 503);

    await cleanupBranch(pool, org.id, branch.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
