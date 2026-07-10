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
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const { ROLES } = require("../src/auth/roles");
const { db } = require("../src/db");
const adminRoutes = require("../src/routes/admin");
const blessboardAdminRoutes = require("../src/routes/blessboardAdmin");
const churchRoutes = require("../src/routes/church");
const adminUsersRepo = require("../src/db/pg/adminUsersRepo");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const auditLogsRepo = require("../src/db/pg/church/auditLogsRepo");
const { hashHqAdminPassword } = require("../src/church/hqAuth");
const {
  validateSuspendBody,
  validateAdminDeactivateBody,
  assertCanSuspendOrganization,
  assertCanReactivateOrganization,
} = require("../src/church/platformStatusValidation");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeBlessBoardApp(role) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "org-overview-suspend-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isBlessBoardApexHost = true;
    if (role) {
      req.session.adminUser = {
        id: 9101,
        username: "super",
        display_name: "Super",
        role,
      };
    }
    next();
  });
  app.use("/admin", blessboardAdminRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

function makeAdminApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "org-overview-admin-test",
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
      secret: "org-overview-church-test",
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
  await pool.query(`DELETE FROM public.church_hq_broadcast_targets WHERE organization_id = $1`, [orgId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_hq_broadcasts WHERE organization_id = $1`, [orgId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_member_password_reset_requests WHERE organization_id = $1`, [orgId]).catch(() => {});
  await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("validateSuspendBody and admin deactivate require reason", () => {
  assert.equal(validateSuspendBody({ status_reason: "ab" }).ok, false);
  assert.equal(validateSuspendBody({ status_reason: "valid reason" }).ok, true);
  assert.equal(validateAdminDeactivateBody({ status_reason: "no" }).ok, false);
  assert.equal(validateAdminDeactivateBody({ status_reason: "enough chars" }).ok, true);
});

test("invalid organization transitions are rejected", () => {
  assert.equal(assertCanSuspendOrganization({ status: "suspended" }).ok, false);
  assert.equal(assertCanSuspendOrganization({ status: "active" }).ok, true);
  assert.equal(assertCanReactivateOrganization({ status: "active" }).ok, false);
  assert.equal(assertCanReactivateOrganization({ status: "archived" }).ok, false);
});

test("anonymous and non-super-admin blocked from suspend confirm", async () => {
  const anon = makeBlessBoardApp(null);
  const anonRes = await request(anon).get("/admin/churches/1/suspend").set("Host", "blessboard.com");
  assert.ok([302, 303].includes(anonRes.status));

  const mgr = makeBlessBoardApp(ROLES.TENANT_MANAGER);
  const mgrRes = await request(mgr).get("/admin/churches/1/suspend").set("Host", "blessboard.com");
  assert.equal(mgrRes.status, 403);
});

test(
  "organization overview suspension admin deactivate integration",
  { skip: !isPgConfigured() },
  async (t) => {
    const pool = getPgPool();
    try {
      await pool.query("SELECT 1");
    } catch (e) {
      t.skip(`PostgreSQL unreachable (${e.code || e.message})`);
      return;
    }
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);

    const suffix = makeSuffix("orgov");
    const hash = await bcrypt.hash("superpw123456", 12);
    const superName = `orgov_sup_${suffix}`;
    const superId = await adminUsersRepo.insertUser(pool, {
      username: superName,
      passwordHash: hash,
      role: ROLES.SUPER_ADMIN,
      tenantId: null,
      displayName: "",
    });

    const orgSlug = `orgov${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: orgSlug,
      name: `Overview Org ${suffix}`,
    });
    const hostSlug = `ovh${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28);
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: hostSlug,
      host_slug: hostSlug,
      name: `Overview Branch ${suffix}`,
    });
    const memberHash = await bcrypt.hash("MemberPass123!", 12);
    await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      full_name: `Member ${suffix}`,
      email: `m_${suffix}@example.com`,
      phone: "0972000001",
      password_hash: memberHash,
    });
    await pool.query(`UPDATE public.church_members SET status = 'verified' WHERE email = $1`, [
      `m_${suffix}@example.com`,
    ]);

    const hqHash = await hashHqAdminPassword("HqPass12345!");
    const primaryHq = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: `Primary HQ ${suffix}`,
      email: `phq_${suffix}@example.com`,
      phone: "0972000002",
      password_hash: hqHash,
    });
    const secondHq = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: org.id,
      full_name: `Second HQ ${suffix}`,
      email: `shq_${suffix}@example.com`,
      phone: "0972000003",
      password_hash: hqHash,
    });

    await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
      title: `Scoped Broadcast ${suffix}`,
      body: "Body should not appear on overview",
      status: "draft",
      created_by_hq_admin_id: primaryHq.id,
    });

    const otherOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `other${suffix}`.replace(/[^a-z0-9]/g, "").slice(0, 28),
      name: `Other Org ${suffix}`,
    });
    await pool.query(
      `INSERT INTO public.church_audit_logs (organization_id, actor_type, action, entity_type, entity_id, target_label)
       VALUES ($1, 'platform_admin', 'platform_church_organization_updated', 'church_organization', $1, $2)`,
      [org.id, org.name]
    );
    await pool.query(
      `INSERT INTO public.church_audit_logs (organization_id, actor_type, action, entity_type, entity_id, target_label)
       VALUES ($1, 'platform_admin', 'platform_church_organization_updated', 'church_organization', $1, $2)`,
      [otherOrg.id, otherOrg.name]
    );

    const app = makeAdminApp();
    const agent = await adminLoginAgent(app, superName, "superpw123456");

    const missing = await agent.get("/admin/church/organizations/999999999");
    assert.equal(missing.status, 404);

    const detail = await agent.get(`/admin/church/organizations/${org.id}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Overview/);
    assert.match(detail.text, /Members \(verified \/ total\)/);
    assert.match(detail.text, />\s*1\s*\/\s*1\s*</);
    assert.match(detail.text, /Recent audit events/);
    assert.match(detail.text, /Recent HQ broadcasts/);
    assert.match(detail.text, new RegExp(`Scoped Broadcast ${suffix}`));
    assert.doesNotMatch(detail.text, /Body should not appear on overview/);
    assert.doesNotMatch(detail.text, new RegExp(otherOrg.name));
    assert.doesNotMatch(detail.text, /password_hash/i);
    assert.doesNotMatch(detail.text, /Storage/);
    assert.match(detail.text, /church-show-mobile-only|admin-dl|card--mb-xl/);

    const confirm = await agent.get(`/admin/church/organizations/${org.id}/suspend`);
    assert.equal(confirm.status, 200);
    assert.match(confirm.text, /Confirm organization suspension/);
    assert.match(confirm.text, /HQ login remains available/);
    assert.match(confirm.text, /HQ write actions are not blocked/);

    const noReason = await agent.post(`/admin/church/organizations/${org.id}/suspend`).type("form").send({
      status_reason: "no",
    });
    assert.equal(noReason.status, 400);

    const suspend = await agent.post(`/admin/church/organizations/${org.id}/suspend`).type("form").send({
      status_reason: "Compliance review required",
    });
    assert.equal(suspend.status, 302);

    const suspendedOrg = await organizationsRepo.findOrganizationById(pool, org.id);
    assert.equal(suspendedOrg.status, "suspended");

    const suspendAudits = await pool.query(
      `SELECT action, metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_organization_suspended'
       ORDER BY id DESC LIMIT 1`,
      [org.id]
    );
    assert.equal(suspendAudits.rows.length, 1);
    const suspendMeta =
      typeof suspendAudits.rows[0].metadata_json === "string"
        ? JSON.parse(suspendAudits.rows[0].metadata_json)
        : suspendAudits.rows[0].metadata_json;
    assert.equal(suspendMeta.previous_status, "active");
    assert.equal(suspendMeta.new_status, "suspended");
    assert.match(String(suspendMeta.reason || ""), /Compliance/);

    const invalidTransition = await agent
      .post(`/admin/church/organizations/${org.id}/suspend`)
      .type("form")
      .send({ status_reason: "again" });
    assert.equal(invalidTransition.status, 400);

    const churchApp = makeChurchApp({
      kind: "branch",
      organization: suspendedOrg,
      branch: { ...branch, status: "active" },
      hostSlug,
    });
    const publicRes = await request(churchApp).get("/");
    assert.equal(publicRes.status, 503);

    const memberLogin = await request(churchApp).get("/login");
    assert.equal(memberLogin.status, 503);

    const branchLogin = await request(churchApp).get("/branch/login");
    assert.equal(branchLogin.status, 503);

    const hqLogin = await request(churchApp).get("/hq/login");
    assert.equal(hqLogin.status, 200);

    const reactivate = await agent.post(`/admin/church/organizations/${org.id}/reactivate`).type("form").send({
      status_reason: "Review complete",
    });
    assert.equal(reactivate.status, 302);
    const reactivated = await organizationsRepo.findOrganizationById(pool, org.id);
    assert.equal(reactivated.status, "active");
    const reactivateAudits = await pool.query(
      `SELECT id FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_organization_reactivated'`,
      [org.id]
    );
    assert.ok(reactivateAudits.rows.length >= 1);

    const crossDeactivate = await agent
      .post(`/admin/church/organizations/${otherOrg.id}/hq-admins/${secondHq.id}/deactivate`)
      .type("form")
      .send({ status_reason: "cross org attempt" });
    assert.equal(crossDeactivate.status, 404);

    const lastGuard = await agent.get(
      `/admin/church/organizations/${org.id}/hq-admins/${primaryHq.id}/deactivate`
    );
    assert.equal(lastGuard.status, 200);

    const deactivateSecondConfirm = await agent.get(
      `/admin/church/organizations/${org.id}/hq-admins/${secondHq.id}/deactivate`
    );
    assert.equal(deactivateSecondConfirm.status, 200);
    assert.match(deactivateSecondConfirm.text, /Confirm HQ admin deactivation/);

    const deactivateNoReason = await agent
      .post(`/admin/church/organizations/${org.id}/hq-admins/${secondHq.id}/deactivate`)
      .type("form")
      .send({ status_reason: "x" });
    assert.equal(deactivateNoReason.status, 400);

    const deactivateSecond = await agent
      .post(`/admin/church/organizations/${org.id}/hq-admins/${secondHq.id}/deactivate`)
      .type("form")
      .send({ status_reason: "Left the organization" });
    assert.equal(deactivateSecond.status, 302);
    const inactiveSecond = await hqAdminsRepo.findHqAdminById(pool, secondHq.id);
    assert.equal(inactiveSecond.status, "inactive");

    const deactivateAudit = await pool.query(
      `SELECT metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_hq_admin_deactivated'
         AND entity_id = $2
       ORDER BY id DESC LIMIT 1`,
      [org.id, secondHq.id]
    );
    assert.equal(deactivateAudit.rows.length, 1);

    const lastBlocked = await agent
      .post(`/admin/church/organizations/${org.id}/hq-admins/${primaryHq.id}/deactivate`)
      .type("form")
      .send({ status_reason: "Would lock out HQ" });
    assert.equal(lastBlocked.status, 400);

    const hqApp = makeChurchApp({
      kind: "branch",
      organization: reactivated,
      branch: { ...branch, status: "active" },
      hostSlug,
    });
    const hqAgent = request.agent(hqApp);
    await hqAgent.post("/hq/login").type("form").send({
      identifier: `shq_${suffix}@example.com`,
      password: "HqPass12345!",
    });
    const blockedDash = await hqAgent.get("/hq/dashboard");
    assert.ok([302, 303, 400].includes(blockedDash.status));
    assert.notEqual(blockedDash.status, 200);

    const reactivateAdmin = await agent
      .post(`/admin/church/organizations/${org.id}/hq-admins/${secondHq.id}/activate`)
      .type("form")
      .send({});
    assert.equal(reactivateAdmin.status, 302);
    const activeAgain = await hqAdminsRepo.findHqAdminById(pool, secondHq.id);
    assert.equal(activeAgain.status, "active");

    const activateAudit = await pool.query(
      `SELECT id FROM public.church_audit_logs
       WHERE organization_id = $1 AND action = 'platform_church_hq_admin_activated'
         AND entity_id = $2`,
      [org.id, secondHq.id]
    );
    assert.ok(activateAudit.rows.length >= 1);

    const branchesStillOk = await agent.get("/admin/church/branches");
    assert.ok([200, 302].includes(branchesStillOk.status));

    await cleanupOrg(pool, org.id);
    await cleanupOrg(pool, otherOrg.id);
    await pool.query(`DELETE FROM public.admin_users WHERE id = $1`, [superId]);
  }
);
