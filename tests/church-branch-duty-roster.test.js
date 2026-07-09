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
const dutyRosterRepo = require("../src/db/pg/church/dutyRosterRepo");
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
      secret: "test-church-duty-roster",
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
    await pool.query(`DELETE FROM public.church_duty_roster WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /branch/duty-roster", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/duty-roster");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /branch/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/duty-roster");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch duty roster management and member visibility",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("duty");
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `duty_a_${suffix}`,
      name: `Duty Church A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `duty_b_${suffix}`,
      name: `Duty Church B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Duty Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: `Duty Branch B ${suffix}`,
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
    const memberA = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_a_${suffix}@example.com`,
      phone: "0977222002",
      full_name: "Member A",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, memberA.id, branchA.id, "verified");

    const memberB = await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_b_${suffix}@example.com`,
      phone: "0977222003",
      full_name: "Member B",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
    });
    await membersRepo.updateMemberStatusForBranch(pool, memberB.id, branchA.id, "verified");

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

    const future = new Date();
    future.setDate(future.getDate() + 14);
    const dutyDate = future.toISOString().slice(0, 10);

    const draftDuty = await adminAgent.post("/branch/duty-roster").type("form").send({
      duty_date: dutyDate,
      service_name: "Sunday Service",
      role_name: "Ushering",
      assigned_member_name: "Guest usher",
      _intent: "draft",
    });
    assert.equal(draftDuty.status, 303);
    const draftDutyId = Number(String(draftDuty.headers.location).match(/\/branch\/duty-roster\/(\d+)/)[1]);

    const confirmDuty = await adminAgent.post("/branch/duty-roster").type("form").send({
      duty_date: dutyDate,
      service_name: "Sunday Service",
      role_name: "Worship team",
      assigned_member_id: String(memberA.id),
      notes: "Arrive 30 minutes early",
      _intent: "confirm",
    });
    assert.equal(confirmDuty.status, 303);
    const confirmedDutyId = Number(String(confirmDuty.headers.location).match(/\/branch\/duty-roster\/(\d+)/)[1]);

    const rosterList = await adminAgent.get("/branch/duty-roster");
    assert.equal(rosterList.status, 200);
    assert.match(rosterList.text, /Worship team/);
    assert.match(rosterList.text, /Ushering/);

    const cancelDuty = await adminAgent
      .post(`/branch/duty-roster/${draftDutyId}/cancel`)
      .type("form")
      .send({});
    assert.equal(cancelDuty.status, 303);

    const otherBranchDuty = await dutyRosterRepo.createDutyForBranch(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      duty_date: dutyDate,
      service_name: "Other service",
      role_name: "Security",
      assigned_member_id: null,
      assigned_member_name: "Other volunteer",
      status: "confirmed",
      created_by_admin_id: null,
    });

    const crossBranch = await adminAgent.get(`/branch/duty-roster/${otherBranchDuty.id}`);
    assert.equal(crossBranch.status, 404);

    const memberAgentA = request.agent(app);
    await memberAgentA.post("/login").type("form").send({
      identifier: `member_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const myDutiesA = await memberAgentA.get("/member/my-duties");
    assert.equal(myDutiesA.status, 200);
    assert.match(myDutiesA.text, /Worship team/);
    assert.doesNotMatch(myDutiesA.text, /Ushering/);

    const memberAgentB = request.agent(app);
    await memberAgentB.post("/login").type("form").send({
      identifier: `member_b_${suffix}@example.com`,
      password: "testpass123",
    });

    const myDutiesB = await memberAgentB.get("/member/my-duties");
    assert.equal(myDutiesB.status, 200);
    assert.doesNotMatch(myDutiesB.text, /Worship team/);

    const memberDashboard = await memberAgentA.get("/member/dashboard");
    assert.equal(memberDashboard.status, 200);
    assert.match(memberDashboard.text, /My duties/i);
    assert.match(memberDashboard.text, /\/member\/my-duties/);

    const confirmDraft = await adminAgent
      .post(`/branch/duty-roster/${confirmedDutyId}/confirm`)
      .type("form")
      .send({});
    assert.equal(confirmDraft.status, 303);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
