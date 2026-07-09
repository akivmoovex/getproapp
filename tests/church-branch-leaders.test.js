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
      secret: "test-church-branch-leaders",
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
    await pool.query(`DELETE FROM public.church_ministry_activity_notes WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministry_leaders WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/leaders", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/leaders");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/leaders");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch admin ministry leader management",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ldradm");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ldr_a_${suffix}`,
      name: `Leader Admin A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ldr_b_${suffix}`,
      name: `Leader Admin B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977111001",
      password_hash: passwordHash,
    });
    const youthA = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Youth Ministry",
      slug: "youth",
      description: "Youth",
      leader_name: "Legacy Name",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const choirA = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Choir Ministry",
      slug: "choir",
      description: "Choir",
      leader_name: "Choir Lead",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });
    const ministryB = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      name: "Other Branch Ministry",
      slug: "other",
      description: "Other",
      leader_name: "Other",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const adminAgent = request.agent(app);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const leaderEmail = `new.leader_${suffix}@example.com`;
    const create = await adminAgent.post("/branch/leaders").type("form").send({
      full_name: "New Leader",
      email: leaderEmail,
      phone: "0977111222",
      ministry_id: youthA.id,
      role: "ministry_leader",
      status: "active",
      temporary_password: "testpass123",
      notes: "Created in test",
    });
    assert.equal(create.status, 303);
    const profileUrl = create.headers.location;
    assert.match(profileUrl, /\/branch\/leaders\/\d+/);

    const leaderId = Number(profileUrl.split("/").pop().split("?")[0]);
    const profile = await adminAgent.get(profileUrl);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /New Leader/);
    assert.match(profile.text, /Youth Ministry/);

    const leaderAgent = request.agent(app);
    const login = await leaderAgent.post("/leader/login").type("form").send({
      identifier: leaderEmail,
      password: "testpass123",
    });
    assert.equal(login.status, 302);
    assert.equal(login.headers.location, "/leader/dashboard");

    const dashboard = await leaderAgent.get("/leader/dashboard");
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /Youth Ministry/);

    const edit = await adminAgent.post(`/branch/leaders/${leaderId}`).type("form").send({
      full_name: "Updated Leader",
      email: leaderEmail,
      phone: "0977111333",
      ministry_id: choirA.id,
      role: "ministry_leader",
      status: "active",
      notes: "Moved to choir",
    });
    assert.equal(edit.status, 303);

    const crossBranch = await adminAgent.post(`/branch/leaders/${leaderId}`).type("form").send({
      full_name: "Updated Leader",
      email: leaderEmail,
      phone: "0977111333",
      ministry_id: ministryB.id,
      role: "ministry_leader",
      status: "active",
    });
    assert.equal(crossBranch.status, 400);
    assert.match(crossBranch.text, /does not belong to this branch/i);

    const deactivate = await adminAgent.post(`/branch/leaders/${leaderId}/deactivate`);
    assert.equal(deactivate.status, 302);

    const blockedLogin = await request(app).post("/leader/login").type("form").send({
      identifier: leaderEmail,
      password: "testpass123",
    });
    assert.equal(blockedLogin.status, 400);

    const blockedDashboard = await leaderAgent.get("/leader/dashboard");
    assert.equal(blockedDashboard.status, 302);
    assert.equal(blockedDashboard.headers.location, "/leader/login");

    const activate = await adminAgent.post(`/branch/leaders/${leaderId}/activate`);
    assert.equal(activate.status, 302);

    const relogin = await leaderAgent.post("/leader/login").type("form").send({
      identifier: leaderEmail,
      password: "testpass123",
    });
    assert.equal(relogin.status, 302);

    const reset = await adminAgent.post(`/branch/leaders/${leaderId}/reset-password`).type("form").send({
      new_password: "newpass456",
      confirm_password: "newpass456",
    });
    assert.equal(reset.status, 303);
    assert.match(reset.headers.location, /notice=leader_password_reset/);

    const oldLogin = await request(app).post("/leader/login").type("form").send({
      identifier: leaderEmail,
      password: "testpass123",
    });
    assert.equal(oldLogin.status, 400);

    const newLoginAgent = request.agent(app);
    const newLogin = await newLoginAgent.post("/leader/login").type("form").send({
      identifier: leaderEmail,
      password: "newpass456",
    });
    assert.equal(newLogin.status, 302);
    assert.equal(newLogin.headers.location, "/leader/dashboard");

    const row = await ministryLeadersRepo.findLeaderByIdForBranch(pool, leaderId, branchA.id);
    assert.ok(row.last_password_reset_at);

    const audit = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE branch_id = $1 AND entity_type = 'ministry_leader' AND entity_id = $2
       ORDER BY id`,
      [branchA.id, leaderId]
    );
    const actions = audit.rows.map((r) => r.action);
    assert.ok(actions.includes("ministry_leader_created"));
    assert.ok(actions.includes("ministry_leader_updated"));
    assert.ok(actions.includes("ministry_leader_deactivated"));
    assert.ok(actions.includes("ministry_leader_activated"));
    assert.ok(actions.includes("ministry_leader_password_reset"));

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
