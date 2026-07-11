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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { validateChangePasswordBody } = require("../src/church/hqAdminAccountValidation");

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
      secret: "test-church-hq-admin-account-security",
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

async function cleanup(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("validateChangePasswordBody enforces required fields and match", () => {
  assert.equal(validateChangePasswordBody({}).ok, false);
  assert.match(validateChangePasswordBody({}).error, /Current password/i);

  assert.equal(
    validateChangePasswordBody({
      current_password: "oldpass123",
      new_password: "short",
      confirm_password: "short",
    }).ok,
    false
  );

  assert.equal(
    validateChangePasswordBody({
      current_password: "oldpass123",
      new_password: "newpass123456",
      confirm_password: "different123456",
    }).ok,
    false
  );

  assert.equal(
    validateChangePasswordBody({
      current_password: "oldpass123",
      new_password: "newpass123456",
      confirm_password: "newpass123456",
    }).ok,
    true
  );
});

test("non-church host cannot access HQ account page", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/hq/account");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to HQ login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/hq/account");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/hq/login");
});

test(
  "HQ admin account security integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("hqacct");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqacct_${suffix}`,
      name: `HQ Account Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `HQ Account Branch ${suffix}`,
    });
    const oldPassword = "oldpass123456";
    const newPassword = "newpass123456";
    const passwordHash = await bcrypt.hash(oldPassword, 12);

    const admin = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: "Active HQ Admin",
      email: `hqacct_${suffix}@example.com`,
      phone: "0977333001",
      password_hash: passwordHash,
      role: "hq_admin",
      status: "active",
    });

    const ctx = {
      kind: "branch",
      orgSlug: org.slug,
      organization: { ...org, status: "active" },
      branch: { ...branch, status: "active" },
    };
    const app = makeApp(ctx);
    const agent = request.agent(app);

    await agent.post("/hq/login").type("form").send({
      identifier: `hqacct_${suffix}@example.com`,
      password: oldPassword,
    });

    const accountPage = await agent.get("/hq/account");
    assert.equal(accountPage.status, 200);
    assert.match(accountPage.text, /Account &amp; security|Account & security/);
    assert.match(accountPage.text, /Active HQ Admin/);
    assert.doesNotMatch(accountPage.text, /\$2[aby]\$/);
    assert.doesNotMatch(accountPage.text, /password_hash/i);

    await hqAdminsRepo.deactivateHqAdminForPlatform(pool, admin.id, org.id, null);
    const deactivatedAccess = await agent.get("/hq/account");
    assert.equal(deactivatedAccess.status, 302);
    assert.equal(deactivatedAccess.headers.location, "/hq/login");

    await hqAdminsRepo.activateHqAdminForPlatform(pool, admin.id, org.id, null);
    await agent.post("/hq/login").type("form").send({
      identifier: `hqacct_${suffix}@example.com`,
      password: oldPassword,
    });

    const samePassword = await agent.post("/hq/account/change-password").type("form").send({
      current_password: oldPassword,
      new_password: oldPassword,
      confirm_password: oldPassword,
    });
    assert.equal(samePassword.status, 400);
    assert.match(samePassword.text, /different from your current password/i);

    const mismatch = await agent.post("/hq/account/change-password").type("form").send({
      current_password: oldPassword,
      new_password: newPassword,
      confirm_password: "mismatch123456",
    });
    assert.equal(mismatch.status, 400);
    assert.match(mismatch.text, /do not match/i);

    const wrongCurrent = await agent.post("/hq/account/change-password").type("form").send({
      current_password: "wrongpass123456",
      new_password: newPassword,
      confirm_password: newPassword,
    });
    assert.equal(wrongCurrent.status, 400);
    assert.match(wrongCurrent.text, /Current password is incorrect/i);

    const change = await agent.post("/hq/account/change-password").type("form").send({
      current_password: oldPassword,
      new_password: newPassword,
      confirm_password: newPassword,
    });
    assert.equal(change.status, 303);
    assert.equal(change.headers.location, "/hq/account?notice=password_changed");

    const afterChange = await agent.get("/hq/account?notice=password_changed");
    assert.equal(afterChange.status, 200);
    assert.match(afterChange.text, /Password updated/i);

    const sessionStillValid = await agent.get("/hq/dashboard");
    assert.equal(sessionStillValid.status, 200);

    const oldLogin = await request(app).post("/hq/login").type("form").send({
      identifier: `hqacct_${suffix}@example.com`,
      password: oldPassword,
    });
    assert.notEqual(oldLogin.status, 303);

    const newLoginAgent = request.agent(app);
    const newLogin = await newLoginAgent.post("/hq/login").type("form").send({
      identifier: `hqacct_${suffix}@example.com`,
      password: newPassword,
    });
    assert.equal(newLogin.status, 303);
    assert.equal(newLogin.headers.location, "/hq/dashboard");

    const logs = await auditLogsRepo.listAuditLogsForOrganization(pool, org.id, {
      action: "hq_admin_password_changed_self_service",
      limit: 10,
    });
    assert.ok(logs.some((row) => Number(row.entity_id) === admin.id));
    assert.ok(
      logs.some(
        (row) =>
          row.metadata_json &&
          row.metadata_json.action_source === "hq_admin_account_security" &&
          Number(row.metadata_json.hq_admin_id) === admin.id
      )
    );

    await organizationsRepo.suspendOrganization(pool, org.id, { reason: "test suspension", platformAdminId: null });
    const suspendedOrg = await organizationsRepo.findOrganizationById(pool, org.id);
    const suspendedCtx = {
      kind: "branch",
      orgSlug: org.slug,
      organization: suspendedOrg,
      branch: { ...branch, status: "active" },
    };
    const suspendedApp = makeApp(suspendedCtx);
    const suspendedAgent = request.agent(suspendedApp);

    const hqLoginOnSuspendedOrg = await suspendedAgent.post("/hq/login").type("form").send({
      identifier: `hqacct_${suffix}@example.com`,
      password: newPassword,
    });
    assert.equal(hqLoginOnSuspendedOrg.status, 503);

    const memberLoginBlocked = await request(suspendedApp).get("/login");
    assert.equal(memberLoginBlocked.status, 503);

    await cleanup(pool, org.id);
  }
);
