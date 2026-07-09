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
const attendanceRepo = require("../src/db/pg/church/attendanceRepo");
const givingSummariesRepo = require("../src/db/pg/church/givingSummariesRepo");
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
      secret: "test-church-attendance-giving",
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

async function seedBranchPair(pool, suffix) {
  const orgA = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `att_a_${suffix}`,
    name: `Attendance A ${suffix}`,
  });
  const orgB = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `att_b_${suffix}`,
    name: `Attendance B ${suffix}`,
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
  const adminA = await branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: orgA.id,
    branch_id: branchA.id,
    full_name: "Admin A",
    email: `admin_a_${suffix}@example.com`,
    phone: "0977111001",
    password_hash: passwordHash,
  });
  const adminB = await branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: orgB.id,
    branch_id: branchB.id,
    full_name: "Admin B",
    email: `admin_b_${suffix}@example.com`,
    phone: "0977111002",
    password_hash: passwordHash,
  });
  return { orgA, orgB, branchA, branchB, adminA, adminB };
}

async function cleanupBranchData(pool, branchIds, orgIds) {
  for (const branchId of branchIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_giving_summaries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access branch attendance or giving routes", async () => {
  const app = makeApp(null, false);
  const attendance = await request(app).get("/branch/attendance");
  assert.equal(attendance.status, 404);
  const giving = await request(app).get("/branch/giving-summary");
  assert.equal(giving.status, 404);
});

test("unauthenticated visitor is redirected to branch login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const attendance = await request(app).get("/branch/attendance");
  assert.equal(attendance.status, 302);
  assert.equal(attendance.headers.location, "/branch/login");
  const giving = await request(app).get("/branch/giving-summary");
  assert.equal(giving.status, 302);
  assert.equal(giving.headers.location, "/branch/login");
});

test(
  "branch admin can create attendance record and submit draft",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("att");
    const { orgA, orgB, branchA, branchB } = await seedBranchPair(pool, suffix);

    const app = makeApp({ kind: "branch", orgSlug: orgA.slug, organization: orgA, branch: branchA });
    const agent = request.agent(app);
    await agent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const create = await agent.post("/branch/attendance").type("form").send({
      attendance_type: "Sunday service",
      service_name: "Morning Worship",
      attendance_date: "2026-07-06",
      adults_count: 40,
      youth_count: 10,
      children_count: 5,
      first_time_visitors_count: 2,
      new_members_count: 1,
      volunteers_count: 8,
      notes: "Good turnout",
      submit_action: "save_draft",
    });
    assert.equal(create.status, 303);
    const recordId = Number(String(create.headers.location).match(/\/branch\/attendance\/(\d+)/)[1]);
    assert.ok(recordId > 0);

    const record = await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branchA.id);
    assert.equal(record.status, "draft");
    assert.equal(record.adults_count, 40);
    assert.equal(record.service_name, "Morning Worship");

    const otherBranchRecord = await attendanceRepo.findAttendanceRecordByIdForBranch(
      pool,
      recordId,
      branchB.id
    );
    assert.equal(otherBranchRecord, null);

    const submit = await agent
      .post(`/branch/attendance/${recordId}/update-status`)
      .type("form")
      .send({ status: "submitted" });
    assert.equal(submit.status, 303);
    const updated = await attendanceRepo.findAttendanceRecordByIdForBranch(pool, recordId, branchA.id);
    assert.equal(updated.status, "submitted");

    await cleanupBranchData(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);

test(
  "branch admin can create or update giving summary for a month",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("give");
    const { orgA, orgB, branchA, branchB } = await seedBranchPair(pool, suffix);

    const app = makeApp({ kind: "branch", orgSlug: orgA.slug, organization: orgA, branch: branchA });
    const agent = request.agent(app);
    await agent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const create = await agent.post("/branch/giving-summary").type("form").send({
      period_month: "2026-07",
      tithes_total: "1000.50",
      offerings_total: "250",
      building_fund_total: "100",
      missions_fund_total: "75",
      special_offerings_total: "25",
      other_giving_total: "10",
      notes: "July totals",
      submit_action: "save_draft",
    });
    assert.equal(create.status, 303);
    const summaryId = Number(String(create.headers.location).match(/\/branch\/giving-summary\/(\d+)/)[1]);
    assert.ok(summaryId > 0);

    const summary = await givingSummariesRepo.findGivingSummaryByIdForBranch(pool, summaryId, branchA.id);
    assert.equal(summary.status, "draft");
    assert.equal(Number(summary.tithes_total), 1000.5);

    const wrongBranch = await givingSummariesRepo.findGivingSummaryByIdForBranch(pool, summaryId, branchB.id);
    assert.equal(wrongBranch, null);

    const update = await agent.post("/branch/giving-summary").type("form").send({
      period_month: "2026-07",
      tithes_total: "1100",
      offerings_total: "250",
      building_fund_total: "100",
      missions_fund_total: "75",
      special_offerings_total: "25",
      other_giving_total: "10",
      submit_action: "submit",
    });
    assert.equal(update.status, 303);

    const submitted = await givingSummariesRepo.getGivingSummaryForBranchPeriod(pool, branchA.id, 2026, 7);
    assert.equal(submitted.status, "submitted");
    assert.equal(Number(submitted.tithes_total), 1100);

    await cleanupBranchData(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);
