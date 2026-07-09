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
const ministriesRepo = require("../src/db/pg/church/ministriesRepo");
const departmentsRepo = require("../src/db/pg/church/departmentsRepo");
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
      secret: "test-church-ministries",
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
    await pool.query(`DELETE FROM public.church_member_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_ministries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_departments WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/ministries", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/ministries");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/ministries");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch ministries and departments management",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("min");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `min_a_${suffix}`,
      name: `Min Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `min_b_${suffix}`,
      name: `Min Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Min Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Min Branch B ${suffix}`,
    });
    const passwordHash = await bcrypt.hash("testpass123", 12);
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
    });
    const member = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977222002",
      full_name: "Verified Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branchA.id, "verified");

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

    const draftMinistry = await adminAgent.post("/branch/ministries").type("form").send({
      name: "Draft Ministry",
      description: "Not ready yet",
      leader_name: "Leader One",
      visibility: "public",
      _intent: "draft",
    });
    assert.equal(draftMinistry.status, 303);
    const draftMinistryId = Number(String(draftMinistry.headers.location).match(/\/branch\/ministries\/(\d+)/)[1]);

    const publishMinistry = await adminAgent.post("/branch/ministries").type("form").send({
      name: "Public Worship Team",
      description: "Open to all visitors",
      leader_name: "Pastor Smith",
      meeting_day: "Sunday",
      meeting_time: "9:00 AM",
      location: "Sanctuary",
      visibility: "public",
      _intent: "publish",
    });
    assert.equal(publishMinistry.status, 303);

    const membersMinistry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      name: "Members Bible Study",
      slug: "members-bible-study",
      description: "For verified members only",
      leader_name: "Elder Jane",
      visibility: "members",
      status: "published",
      created_by_admin_id: null,
    });

    const otherBranchMinistry = await ministriesRepo.createMinistryForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      name: "Other Branch Choir",
      slug: "other-choir",
      description: "Not your branch",
      leader_name: "Other Leader",
      visibility: "public",
      status: "published",
      created_by_admin_id: null,
    });

    const crossBranch = await adminAgent.get(`/branch/ministries/${otherBranchMinistry.id}`);
    assert.equal(crossBranch.status, 404);

    const publicMinistries = await request(app).get("/ministries");
    assert.equal(publicMinistries.status, 200);
    assert.match(publicMinistries.text, /Public Worship Team/);
    assert.doesNotMatch(publicMinistries.text, /Members Bible Study/);
    assert.doesNotMatch(publicMinistries.text, /Draft Ministry/);

    const publicHome = await request(app).get("/");
    assert.match(publicHome.text, /Public Worship Team/);
    assert.doesNotMatch(publicHome.text, /Members Bible Study/);

    const memberAgent = request.agent(app);
    await memberAgent.post("/login").type("form").send({
      identifier: `member_${suffix}@example.com`,
      password: "testpass123",
    });

    const memberMinistries = await memberAgent.get("/member/ministries");
    assert.equal(memberMinistries.status, 200);
    assert.match(memberMinistries.text, /Public Worship Team/);
    assert.match(memberMinistries.text, /Members Bible Study/);

    const memberDashboard = await memberAgent.get("/member/dashboard");
    assert.equal(memberDashboard.status, 200);
    assert.match(memberDashboard.text, /My ministries/i);
    assert.match(memberDashboard.text, /\/member\/my-ministries/);

    const publishDraft = await adminAgent
      .post(`/branch/ministries/${draftMinistryId}/publish`)
      .type("form")
      .send({});
    assert.equal(publishDraft.status, 303);

    const createDepartment = await adminAgent.post("/branch/departments").type("form").send({
      name: "Finance Department",
      purpose: "Stewardship and budgeting",
      leader_name: "Treasurer Bob",
      leader_phone: "0977000001",
    });
    assert.equal(createDepartment.status, 303);
    const departmentId = Number(String(createDepartment.headers.location).match(/\/branch\/departments\/(\d+)/)[1]);

    const otherBranchDepartment = await departmentsRepo.createDepartmentForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      name: "Other HR",
      slug: "other-hr",
      purpose: "Other branch HR",
      leader_name: "Other HR Lead",
      status: "active",
      created_by_admin_id: null,
    });

    const crossDepartment = await adminAgent.get(`/branch/departments/${otherBranchDepartment.id}`);
    assert.equal(crossDepartment.status, 404);

    const archiveDepartment = await adminAgent
      .post(`/branch/departments/${departmentId}/archive`)
      .type("form")
      .send({});
    assert.equal(archiveDepartment.status, 303);

    const archived = await departmentsRepo.findDepartmentByIdForBranch(pool, departmentId, branchA.id);
    assert.equal(archived.status, "archived");

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
