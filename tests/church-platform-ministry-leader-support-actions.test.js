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
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const ministryLeadersRepo = require("../src/db/pg/church/ministryLeadersRepo");
const {
  validateResetMinistryLeaderPasswordBody,
  validateDeactivateMinistryLeaderBody,
  validateActivateMinistryLeaderBody,
} = require("../src/church/platformMinistryLeaderSupportActionsValidation");
const { verifyLeaderPassword } = require("../src/church/leaderAuth");
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
      secret: "church-ministry-leader-support-actions-test",
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

function makeChurchApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-ministry-leader-login-actions-test",
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

async function cleanup(pool, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_login_attempts WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_ministry_leaders WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_ministries WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("validateDeactivateMinistryLeaderBody requires reason", () => {
  assert.equal(validateDeactivateMinistryLeaderBody({ reason: "ab" }).ok, false);
  assert.equal(validateDeactivateMinistryLeaderBody({ reason: "valid reason" }).ok, true);
});

test("validateResetMinistryLeaderPasswordBody requires matching passwords", () => {
  assert.equal(
    validateResetMinistryLeaderPasswordBody({ new_password: "12345678", confirm_password: "87654321" }).ok,
    false
  );
  assert.equal(
    validateResetMinistryLeaderPasswordBody({ new_password: "12345678", confirm_password: "12345678" }).ok,
    true
  );
});

test("validateActivateMinistryLeaderBody allows optional reason", () => {
  assert.equal(validateActivateMinistryLeaderBody({}).ok, true);
  assert.equal(validateActivateMinistryLeaderBody({ reason: "restored" }).reason, "restored");
});

test("tenant manager cannot perform ministry leader support actions", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("mlactmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `mlact_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent
    .post("/admin/church/ministry-leaders/1/deactivate")
    .type("form")
    .send({ reason: "test reason" });
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform ministry leader support actions integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pmlact");
    const superHash = await bcrypt.hash("superpw123456", 12);
    const superName = `pmlact_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: superHash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `mlactorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Leader Actions Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Leader Actions Branch ${suffix}`,
    });
    const ministry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      name: "Youth Ministry",
      slug: "youth",
      description: "Youth",
      leader_name: "Leader",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const email = `mlact_${suffix}@example.com`;
    const oldPassword = "oldpass123456";
    const newPassword = "newpass123456";
    const leader = await ministryLeadersRepo.createMinistryLeader(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      ministry_id: ministry.id,
      full_name: `Actions Leader ${suffix}`,
      email,
      phone: "0977666555",
      password_hash: await bcrypt.hash(oldPassword, 12),
      role: "ministry_leader",
      status: "active",
    });

    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });

    const adminApp = createAdminApp();
    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");

    const notFound = await superAgent
      .post("/admin/church/ministry-leaders/999999999/reset-password")
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });
    assert.equal(notFound.status, 404);

    await pool.query(
      `UPDATE public.church_ministry_leaders
       SET login_locked_until = now() + interval '15 minutes',
           failed_login_attempts = 5,
           last_failed_login_at = now() - interval '1 hour'
       WHERE id = $1`,
      [leader.id]
    );

    const loginOldAgent = request.agent(churchApp);
    const loginOld = await loginOldAgent.post("/leader/login").type("form").send({
      identifier: email,
      password: oldPassword,
    });
    assert.notEqual(loginOld.status, 303);

    const resetRes = await superAgent
      .post(`/admin/church/ministry-leaders/${leader.id}/reset-password`)
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });
    assert.equal(resetRes.status, 302);
    assert.match(resetRes.headers.location, /notice=password_reset/);

    const resetPage = await superAgent.get(`/admin/church/ministry-leaders/${leader.id}?notice=password_reset`);
    assert.equal(resetPage.status, 200);
    assert.equal(resetPage.text.includes(newPassword), false);
    assert.equal(resetPage.text.includes("password_hash"), false);

    let row = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leader.id, branch.id);
    assert.equal(await verifyLeaderPassword(oldPassword, row.password_hash), false);
    assert.equal(await verifyLeaderPassword(newPassword, row.password_hash), true);
    assert.notEqual(row.password_hash, oldPassword);
    assert.ok(!row.login_locked_until);
    assert.equal(Number(row.failed_login_attempts), 0);
    assert.ok(row.platform_last_password_reset_at);

    const loginNewAgent = request.agent(churchApp);
    const loginNew = await loginNewAgent.post("/leader/login").type("form").send({
      identifier: email,
      password: newPassword,
    });
    assert.equal(loginNew.status, 302);
    assert.equal(loginNew.headers.location, "/leader/dashboard");
    const dashboard = await loginNewAgent.get("/leader/dashboard");
    assert.equal(dashboard.status, 200);

    const deactivateNoReason = await superAgent
      .post(`/admin/church/ministry-leaders/${leader.id}/deactivate`)
      .type("form")
      .send({ reason: "ab" });
    assert.equal(deactivateNoReason.status, 400);

    const deactivateRes = await superAgent
      .post(`/admin/church/ministry-leaders/${leader.id}/deactivate`)
      .type("form")
      .send({ reason: "Support deactivation test" });
    assert.equal(deactivateRes.status, 302);
    assert.match(deactivateRes.headers.location, /notice=deactivated/);

    row = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leader.id, branch.id);
    assert.equal(row.status, "inactive");

    const inactiveAgent = request.agent(churchApp);
    await inactiveAgent.post("/leader/login").type("form").send({
      identifier: email,
      password: newPassword,
    });
    const blockedDashboard = await inactiveAgent.get("/leader/dashboard");
    assert.equal(blockedDashboard.status, 302);
    assert.equal(blockedDashboard.headers.location, "/leader/login");

    const activateRes = await superAgent
      .post(`/admin/church/ministry-leaders/${leader.id}/activate`)
      .type("form")
      .send({ reason: "Support reactivation" });
    assert.equal(activateRes.status, 302);
    assert.match(activateRes.headers.location, /notice=activated/);

    row = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leader.id, branch.id);
    assert.equal(row.status, "active");

    const reactivatedAgent = request.agent(churchApp);
    const reactivatedLogin = await reactivatedAgent.post("/leader/login").type("form").send({
      identifier: email,
      password: newPassword,
    });
    assert.equal(reactivatedLogin.status, 302);
    assert.equal(reactivatedLogin.headers.location, "/leader/dashboard");

    await pool.query(
      `UPDATE public.church_ministry_leaders
       SET login_locked_until = now() + interval '15 minutes',
           failed_login_attempts = 4,
           last_failed_login_at = now() - interval '30 minutes',
           status = 'inactive'
       WHERE id = $1`,
      [leader.id]
    );
    const lastFailedBefore = (
      await ministryLeadersRepo.findLeaderByIdForBranch(pool, leader.id, branch.id)
    ).last_failed_login_at;

    const unlockRes = await superAgent
      .post(`/admin/church/ministry-leaders/${leader.id}/unlock-login`)
      .type("form")
      .send({ reason: "Manual unlock" });
    assert.equal(unlockRes.status, 302);
    assert.match(unlockRes.headers.location, /notice=login_unlocked/);

    row = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leader.id, branch.id);
    assert.ok(!row.login_locked_until);
    assert.equal(Number(row.failed_login_attempts), 0);
    assert.equal(row.status, "inactive");
    assert.ok(row.last_failed_login_at);
    assert.equal(new Date(row.last_failed_login_at).getTime(), new Date(lastFailedBefore).getTime());

    const unlockLoginAttempt = await request(churchApp).post("/leader/login").type("form").send({
      identifier: email,
      password: newPassword,
    });
    assert.notEqual(unlockLoginAttempt.status, 303);

    const auditRows = await pool.query(
      `SELECT action, metadata_json
       FROM public.church_audit_logs
       WHERE organization_id = $1 AND entity_id = $2
       ORDER BY id ASC`,
      [org.id, leader.id]
    );
    const actions = auditRows.rows.map((r) => r.action);
    assert.ok(actions.includes("platform_ministry_leader_password_reset"));
    assert.ok(actions.includes("platform_ministry_leader_deactivated"));
    assert.ok(actions.includes("platform_ministry_leader_activated"));
    assert.ok(actions.includes("platform_ministry_leader_login_unlocked"));
    for (const rowAudit of auditRows.rows) {
      const meta =
        typeof rowAudit.metadata_json === "string"
          ? JSON.parse(rowAudit.metadata_json)
          : rowAudit.metadata_json;
      assert.equal(meta.action_source, "platform_ministry_leader_support");
      assert.equal(JSON.stringify(meta).includes(newPassword), false);
      assert.equal(JSON.stringify(meta).includes(oldPassword), false);
    }

    const branchScoped = await superAgent
      .post(`/admin/church/branches/${branch.id}/ministry-leaders/${leader.id}/activate`)
      .type("form")
      .send({});
    assert.equal(branchScoped.status, 302);
    assert.match(branchScoped.headers.location, /notice=activated/);

    const branchScopedAgain = await superAgent
      .post(`/admin/church/branches/${branch.id}/ministry-leaders/${leader.id}/activate`)
      .type("form")
      .send({});
    assert.equal(branchScopedAgain.status, 302);
    assert.match(branchScopedAgain.headers.location, /notice=already_active/);

    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
    await cleanup(pool, org.id);
  }
);
