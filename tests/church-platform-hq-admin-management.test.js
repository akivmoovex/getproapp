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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const {
  validateCreateHqAdminBody,
  validateResetHqAdminPasswordBody,
} = require("../src/church/platformHqAdminValidation");
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
      secret: "church-platform-hq-admin-mgmt-test",
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

function makeHqApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "hq-admin-login-test",
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

async function cleanupOrg(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("password reset validation requires matching confirm", () => {
  const result = validateResetHqAdminPasswordBody({
    new_password: "newpass123",
    confirm_password: "different123",
  });
  assert.equal(result.ok, false);
});

test("create HQ admin validation requires password", () => {
  const result = validateCreateHqAdminBody({
    full_name: "HQ User",
    email: "hq@example.com",
    temporary_password: "short",
    confirm_password: "short",
  });
  assert.equal(result.ok, false);
});

test("create HQ admin validation requires matching passwords", () => {
  const result = validateCreateHqAdminBody({
    full_name: "HQ User",
    email: "hq@example.com",
    temporary_password: "longenough1",
    confirm_password: "differentpass",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Passwords do not match/i);
});

test("tenant manager cannot list HQ admins", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("hqmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `hq_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `hqmgr_${suffix}`,
    name: `HQ Mgr Org ${suffix}`,
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.get(`/admin/church/organizations/${org.id}/hq-admins`);
  assert.equal(res.status, 403);
  await cleanupOrg(pool, org.id);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform HQ admin management integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("hqam");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `hqam_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqamorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `HQ Admin Org ${suffix}`,
    });
    const hostSlug = `hqamhost${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: hostSlug,
      host_slug: hostSlug,
      name: "Main Branch",
    });

    const initialPassword = "initialpass123";
    const initialHash = await bcrypt.hash(initialPassword, 12);
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "Primary HQ Admin",
      email: `primary_hq_${suffix}@example.com`,
      phone: "0977111000",
      password_hash: initialHash,
    });

    const adminApp = createAdminApp();
    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");

    const listPage = await superAgent.get(`/admin/church/organizations/${org.id}/hq-admins`);
    assert.equal(listPage.status, 200);
    assert.match(listPage.text, /HQ admins/);
    assert.match(listPage.text, /Primary HQ Admin/);

    const secondEmail = `second_hq_${suffix}@example.com`;
    const secondPassword = "secondpass12345";
    const created = await superAgent.post(`/admin/church/organizations/${org.id}/hq-admins`).type("form").send({
      full_name: "Second HQ Admin",
      email: secondEmail,
      phone: "0977222000",
      role: "hq_admin",
      temporary_password: secondPassword,
      confirm_password: secondPassword,
      notes: "Added by platform admin",
    });
    assert.equal(created.status, 302);
    assert.match(String(created.headers.location || ""), new RegExp(`/admin/church/organizations/${org.id}`));
    assert.match(String(created.headers.location || ""), /notice=hq_admin_created/);

    const secondAdminRow = await pool.query(
      `SELECT * FROM public.church_hq_admins WHERE organization_id = $1 AND lower(trim(email)) = $2 LIMIT 1`,
      [org.id, secondEmail]
    );
    assert.equal(secondAdminRow.rows.length, 1);
    const secondAdmin = secondAdminRow.rows[0];
    assert.ok(secondAdmin.password_hash.startsWith("$2"));
    assert.notEqual(secondAdmin.password_hash, secondPassword);

    const dup = await superAgent.post(`/admin/church/organizations/${org.id}/hq-admins`).type("form").send({
      full_name: "Duplicate HQ Admin",
      email: secondEmail,
      temporary_password: "anotherpass123",
      confirm_password: "anotherpass123",
    });
    assert.equal(dup.status, 400);

    const hqApp = makeHqApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const hqAgent = request.agent(hqApp);
    const loginSecond = await hqAgent.post("/hq/login").type("form").send({
      identifier: secondEmail,
      password: secondPassword,
    });
    assert.equal(loginSecond.status, 303);
    assert.equal(loginSecond.headers.location, "/hq/dashboard");

    const edited = await superAgent.post(`/admin/church/organizations/${org.id}/hq-admins/${secondAdmin.id}`).type("form").send({
      full_name: "Second HQ Admin Updated",
      email: secondEmail,
      phone: "0977333000",
      role: "hq_admin",
      notes: "Updated notes",
    });
    assert.equal(edited.status, 302);

    const updatedAdmin = await hqAdminsRepo.findHqAdminById(pool, secondAdmin.id);
    assert.equal(updatedAdmin.full_name, "Second HQ Admin Updated");
    assert.equal(updatedAdmin.phone, "0977333000");

    const deactivated = await superAgent
      .post(`/admin/church/organizations/${org.id}/hq-admins/${secondAdmin.id}/deactivate`)
      .type("form")
      .send({ status_reason: "No longer needs HQ access" });
    assert.equal(deactivated.status, 302);
    const inactiveAdmin = await hqAdminsRepo.findHqAdminById(pool, secondAdmin.id);
    assert.equal(inactiveAdmin.status, "inactive");

    const blockedDash = await hqAgent.get("/hq/dashboard");
    assert.equal(blockedDash.status, 302);
    assert.equal(blockedDash.headers.location, "/hq/login");

    const blockedLogin = await request(hqApp).post("/hq/login").type("form").send({
      identifier: secondEmail,
      password: secondPassword,
    });
    assert.equal(blockedLogin.status, 400);

    const reactivated = await superAgent.post(
      `/admin/church/organizations/${org.id}/hq-admins/${secondAdmin.id}/activate`
    );
    assert.equal(reactivated.status, 302);

    const relogin = await request(hqApp).post("/hq/login").type("form").send({
      identifier: secondEmail,
      password: secondPassword,
    });
    assert.equal(relogin.status, 303);

    const newPassword = "resetpass12345";
    const reset = await superAgent
      .post(`/admin/church/organizations/${org.id}/hq-admins/${secondAdmin.id}/reset-password`)
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });
    assert.equal(reset.status, 302);

    const oldLogin = await request(hqApp).post("/hq/login").type("form").send({
      identifier: secondEmail,
      password: secondPassword,
    });
    assert.equal(oldLogin.status, 400);

    const newLogin = await request(hqApp).post("/hq/login").type("form").send({
      identifier: secondEmail,
      password: newPassword,
    });
    assert.equal(newLogin.status, 303);

    const auditCreate = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_hq_admin_created'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(auditCreate.rows.length, 1);

    const auditReset = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_hq_admin_password_reset'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(auditReset.rows.length, 1);

    await organizationsRepo.suspendOrganization(pool, org.id, {
      reason: "Test suspend",
      platformAdminId: superId,
    });
    const suspendedOrg = await organizationsRepo.findOrganizationById(pool, org.id);
    const manageWhileSuspended = await superAgent.get(`/admin/church/organizations/${org.id}/hq-admins`);
    assert.equal(manageWhileSuspended.status, 200);

    const suspendedHqApp = makeHqApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: suspendedOrg,
      branch,
    });
    const hqLoginSuspendedOrg = await request(suspendedHqApp).post("/hq/login").type("form").send({
      identifier: secondEmail,
      password: newPassword,
    });
    assert.equal(hqLoginSuspendedOrg.status, 503);

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
