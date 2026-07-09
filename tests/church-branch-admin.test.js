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
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const { requireChurchBranchHost } = require("../src/routes/church/branchAdmin");

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
      secret: "test-church-branch-admin",
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

test("branch admin routes require branch church host", () => {
  const req = { churchContext: { kind: "vertical-apex" } };
  let statusCode = null;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    type() {
      return this;
    },
    send(body) {
      assert.equal(body, "Not found");
    },
  };
  requireChurchBranchHost(req, res, () => assert.fail("next should not run"));
  assert.equal(statusCode, 404);
});

test("non-church host cannot access branch verification queue", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/member-verification");
  assert.equal(res.status, 404);
});

test(
  "branch admin login works on branch church host",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("ba");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ba_${suffix}`,
      name: `BA Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `BA Church ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Test Admin",
      email: `admin_${suffix}@example.com`,
      phone: "0977111222",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });

    const app = makeApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const agent = request.agent(app);
    const login = await agent
      .post("/branch/login")
      .type("form")
      .send({ identifier: `admin_${suffix}@example.com`, password: "testpass123" });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, "/branch/dashboard");

    const dash = await agent.get("/branch/dashboard");
    assert.equal(dash.status, 200);
    assert.match(dash.text, /Dashboard/);

    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);

test(
  "pending members appear in verification queue and approve flow works",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("verify");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `verify_${suffix}`,
      name: `Verify Church ${suffix}`,
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `Verify Church ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Verify Admin",
      email: `verify_admin_${suffix}@example.com`,
      phone: "0977333000",
      password_hash: passwordHash,
    });
    const memberPasswordHash = await bcrypt.hash("memberpass123", 12);
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977444555",
      full_name: "Queue Member",
      password_hash: memberPasswordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });

    const app = makeApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const adminAgent = request.agent(app);
    await adminAgent.post("/branch/login").type("form").send({
      identifier: `verify_admin_${suffix}@example.com`,
      password: "testpass123",
    });

    const queue = await adminAgent.get("/branch/member-verification");
    assert.equal(queue.status, 200);
    assert.match(queue.text, /Queue Member/);

    const approve = await adminAgent
      .post(`/branch/members/${member.id}/approve`)
      .type("form")
      .send({ review_comment: "Welcome!", redirect_to: "queue" });
    assert.equal(approve.status, 303);

    const updated = await membersRepo.findMemberByIdForBranch(pool, member.id, branch.id);
    assert.equal(updated.status, "verified");

    const memberAgent = request.agent(app);
    const login = await memberAgent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password: "memberpass123",
    });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, "/member/dashboard");

    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);

test(
  "branch admin cannot access member from another branch",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("scope");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `scope_a_${suffix}`,
      name: "Scope A",
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `scope_b_${suffix}`,
      name: "Scope B",
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: "Scope A Branch",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: "Scope B Branch",
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977666111",
      password_hash: passwordHash,
    });
    const memberB = await membersRepo.createPendingMember(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_b_${suffix}@example.com`,
      phone: "0977888999",
      full_name: "Member B",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Youth (13-19)",
      address_area: "Other",
      attendance_duration: "First time visitor",
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const agent = request.agent(app);
    await agent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const res = await agent.get(`/branch/members/${memberB.id}`);
    assert.equal(res.status, 404);

    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchB.id]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchA.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id IN ($1, $2)`, [orgA.id, orgB.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id IN ($1, $2)`, [orgA.id, orgB.id]);
  }
);
