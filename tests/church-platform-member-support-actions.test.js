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
const membersRepo = require("../src/db/pg/church/membersRepo");
const {
  validateResetMemberPasswordBody,
  validateSuspendMemberBody,
  validateVerifyMemberBody,
} = require("../src/church/platformMemberSupportActionsValidation");
const { verifyMemberPassword } = require("../src/church/memberAuth");
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
      secret: "church-member-support-actions-test",
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
      secret: "church-member-login-actions-test",
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
  await pool.query(`DELETE FROM public.church_member_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_prayer_requests WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("validateSuspendMemberBody requires reason", () => {
  assert.equal(validateSuspendMemberBody({ reason: "ab" }).ok, false);
  assert.equal(validateSuspendMemberBody({ reason: "valid reason" }).ok, true);
});

test("validateVerifyMemberBody rejects already verified", () => {
  assert.equal(validateVerifyMemberBody({}, "verified").ok, false);
  assert.equal(validateVerifyMemberBody({}, "pending").ok, true);
});

test("tenant manager cannot perform member support actions", async () => {
  if (!isPgConfigured()) return;
  const pool = getPgPool();
  await ensureCanonicalTenantsForTests(pool);
  const suffix = makeSuffix("msactmgr");
  const hash = await bcrypt.hash("pw12345678", 12);
  const username = `msact_mgr_${suffix}`;
  const userId = await adminUsersRepo.insertUser(pool, {
    username,
    passwordHash: hash,
    role: ROLES.TENANT_MANAGER,
    tenantId: TENANT_ZM,
    displayName: "",
  });
  const app = createAdminApp();
  const agent = await adminLoginAgent(app, username, "pw12345678");
  const res = await agent.post("/admin/church/members/1/suspend").type("form").send({ reason: "test reason" });
  assert.equal(res.status, 403);
  await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [userId]);
});

test(
  "platform member support actions integration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pmsact");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `pmsact_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `msactorg${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Member Actions Org ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Member Actions Branch ${suffix}`,
    });

    const email = `msact_${suffix}@example.com`;
    const oldPassword = "oldpass123456";
    const newPassword = "newpass123456";
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Actions Member ${suffix}`,
      email,
      phone: "0977666555",
      password_hash: await bcrypt.hash(oldPassword, 12),
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "",
    });

    const churchApp = makeChurchApp({
      kind: "branch",
      orgSlug: org.slug,
      organization: org,
      branch,
    });

    const adminApp = createAdminApp();
    const superAgent = await adminLoginAgent(adminApp, superName, "superpw123456");

    const verifyRes = await superAgent
      .post(`/admin/church/members/${member.id}/verify`)
      .type("form")
      .send({ reason: "Platform verification" });
    assert.equal(verifyRes.status, 302);
    assert.match(verifyRes.headers.location, /notice=verified/);

    let row = await membersRepo.findMemberById(pool, member.id);
    assert.equal(row.status, "verified");

    const loginOld = await request(churchApp)
      .post("/login")
      .type("form")
      .send({ identifier: email, password: oldPassword });
    assert.equal(loginOld.status, 303);

    const resetRes = await superAgent
      .post(`/admin/church/members/${member.id}/reset-password`)
      .type("form")
      .send({ new_password: newPassword, confirm_password: newPassword });
    assert.equal(resetRes.status, 302);
    assert.match(resetRes.headers.location, /notice=password_reset/);

    const resetPage = await superAgent.get(`/admin/church/members/${member.id}?notice=password_reset`);
    assert.equal(resetPage.status, 200);
    assert.equal(resetPage.text.includes(newPassword), false);
    assert.equal(resetPage.text.includes("password_hash"), false);

    row = await membersRepo.findMemberById(pool, member.id);
    assert.equal(await verifyMemberPassword(oldPassword, row.password_hash), false);
    assert.equal(await verifyMemberPassword(newPassword, row.password_hash), true);
    assert.notEqual(row.password_hash, oldPassword);

    const loginNewAgent = request.agent(churchApp);
    const loginNew = await loginNewAgent.post("/login").type("form").send({ identifier: email, password: newPassword });
    assert.equal(loginNew.status, 303);
    assert.equal(loginNew.headers.location, "/member/dashboard");
    const dashboard = await loginNewAgent.get("/member/dashboard");
    assert.equal(dashboard.status, 200);

    const suspendNoReason = await superAgent
      .post(`/admin/church/members/${member.id}/suspend`)
      .type("form")
      .send({ reason: "ab" });
    assert.equal(suspendNoReason.status, 400);

    const suspendRes = await superAgent
      .post(`/admin/church/members/${member.id}/suspend`)
      .type("form")
      .send({ reason: "Support suspension test" });
    assert.equal(suspendRes.status, 302);
    assert.match(suspendRes.headers.location, /notice=suspended/);

    row = await membersRepo.findMemberById(pool, member.id);
    assert.equal(row.status, "suspended");

    const suspendedLoginAgent = request.agent(churchApp);
    await suspendedLoginAgent.post("/login").type("form").send({ identifier: email, password: newPassword });
    const blockedDashboard = await suspendedLoginAgent.get("/member/dashboard");
    assert.notEqual(blockedDashboard.status, 200);

    const reactivateRes = await superAgent
      .post(`/admin/church/members/${member.id}/reactivate`)
      .type("form")
      .send({ reason: "Support reactivation" });
    assert.equal(reactivateRes.status, 302);
    assert.match(reactivateRes.headers.location, /notice=reactivated/);

    row = await membersRepo.findMemberById(pool, member.id);
    assert.equal(row.status, "verified");

    const reactivatedAgent = request.agent(churchApp);
    const reactivatedLogin = await reactivatedAgent
      .post("/login")
      .type("form")
      .send({ identifier: email, password: newPassword });
    assert.equal(reactivatedLogin.status, 303);
    assert.equal(reactivatedLogin.headers.location, "/member/dashboard");

    await pool.query(`UPDATE public.church_members SET status = 'rejected' WHERE id = $1`, [member.id]);
    const verifyRejected = await superAgent
      .post(`/admin/church/members/${member.id}/verify`)
      .type("form")
      .send({});
    assert.equal(verifyRejected.status, 302);
    row = await membersRepo.findMemberById(pool, member.id);
    assert.equal(row.status, "verified");

    const audit = await pool.query(
      `SELECT action, metadata_json
       FROM public.church_audit_logs
       WHERE organization_id = $1 AND branch_id = $2
         AND action LIKE 'platform_member_%'
       ORDER BY id ASC`,
      [org.id, branch.id]
    );
    const actions = audit.rows.map((r) => r.action);
    assert.ok(actions.includes("platform_member_verified"));
    assert.ok(actions.includes("platform_member_password_reset"));
    assert.ok(actions.includes("platform_member_suspended"));
    assert.ok(actions.includes("platform_member_reactivated"));
    for (const log of audit.rows) {
      const meta = typeof log.metadata_json === "string" ? JSON.parse(log.metadata_json) : log.metadata_json;
      assert.equal(meta.action_source, "platform_member_support");
      assert.equal(JSON.stringify(meta).includes("password"), false);
    }

    const notFound = await superAgent.post("/admin/church/members/999999999/suspend").type("form").send({ reason: "missing member" });
    assert.equal(notFound.status, 404);

    await cleanupOrg(pool, org.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
