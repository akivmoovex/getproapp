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
const monthlyReportsRepo = require("../src/db/pg/church/monthlyReportsRepo");
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
      secret: "test-church-monthly-reports",
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

async function seedBranchAdmin(pool, suffix) {
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `mr_${suffix}`,
    name: `Report Church ${suffix}`,
  });
  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: "main",
    name: `Report Branch ${suffix}`,
  });
  const passwordHash = await bcrypt.hash("testpass123", 12);
  const admin = await branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    full_name: "Report Admin",
    email: `mr_admin_${suffix}@example.com`,
    phone: "0977999000",
    password_hash: passwordHash,
  });
  return { org, branch, admin };
}

async function cleanup(pool, branchId, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_monthly_reports WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_giving_summaries WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

const draftPayload = {
  period_month: "2026-06",
  starting_members: 100,
  new_members: 5,
  transferred_members: 1,
  inactive_members: 2,
  ending_members: 102,
  services_held: 4,
  ministry_meetings_held: 2,
  department_meetings_held: 1,
  outreach_activities: 1,
  special_events: 0,
  ministry_activity_notes: "Youth camp",
  main_challenges: "Volunteer shortage",
  support_needed_from_hq: "Training materials",
};

test("non-church host cannot access branch reports", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/branch/reports");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor is redirected to branch login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/branch/reports");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/branch/login");
});

test(
  "branch admin monthly report flow",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("mr");
    const { org, branch, admin } = await seedBranchAdmin(pool, suffix);

    await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      attendance_date: "2026-06-08",
      attendance_type: "Sunday service",
      service_name: "Morning Worship",
      adults_count: 40,
      youth_count: 10,
      children_count: 5,
      first_time_visitors_count: 3,
      new_members_count: 1,
      volunteers_count: 6,
      status: "submitted",
      created_by_admin_id: admin.id,
    });
    await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      attendance_date: "2026-06-15",
      attendance_type: "Sunday service",
      service_name: "Morning Worship",
      adults_count: 42,
      youth_count: 12,
      children_count: 6,
      first_time_visitors_count: 2,
      new_members_count: 0,
      volunteers_count: 7,
      status: "draft",
      created_by_admin_id: admin.id,
    });
    await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      attendance_date: "2026-06-11",
      attendance_type: "Midweek service",
      service_name: "Prayer",
      adults_count: 20,
      youth_count: 4,
      children_count: 0,
      first_time_visitors_count: 1,
      new_members_count: 0,
      volunteers_count: 3,
      status: "submitted",
      created_by_admin_id: admin.id,
    });

    const giving = await givingSummariesRepo.upsertGivingSummaryForBranchPeriod(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      period_year: 2026,
      period_month: 6,
      tithes_total: 500,
      offerings_total: 100,
      building_fund_total: 50,
      missions_fund_total: 25,
      special_offerings_total: 10,
      other_giving_total: 5,
      notes: "June giving",
      status: "submitted",
      created_by_admin_id: admin.id,
    });

    const app = makeApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const agent = request.agent(app);
    await agent.post("/branch/login").type("form").send({
      identifier: `mr_admin_${suffix}@example.com`,
      password: "testpass123",
    });

    const dashboard = await agent.get("/branch/reports");
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /Monthly reports/);

    const save = await agent.post("/branch/reports").type("form").send(draftPayload);
    assert.equal(save.status, 303);
    const reportId = Number(String(save.headers.location).match(/\/branch\/reports\/(\d+)/)[1]);
    assert.ok(reportId > 0);

    const report = await monthlyReportsRepo.findReportByIdForBranch(pool, reportId, branch.id);
    assert.equal(report.status, "draft");
    assert.equal(Number(report.sunday_average), 55);
    assert.equal(Number(report.visitors_total), 4);

    const duplicate = await monthlyReportsRepo.findReportByPeriodForBranch(pool, branch.id, 2026, 6);
    assert.equal(duplicate.id, reportId);

    const submit = await agent.post(`/branch/reports/${reportId}/submit`).type("form").send({});
    assert.equal(submit.status, 303);

    const submitted = await monthlyReportsRepo.findReportByIdForBranch(pool, reportId, branch.id);
    assert.equal(submitted.status, "submitted");
    assert.ok(submitted.submitted_at);

    const resync = await agent.post("/branch/reports").type("form").send(draftPayload);
    assert.equal(resync.status, 403);

    const detail = await agent.get(`/branch/reports/${reportId}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Submitted to HQ/);

    const submittedAttendance = await pool.query(
      `SELECT status FROM public.church_attendance_records
       WHERE branch_id = $1 AND attendance_type = 'Sunday service' AND EXTRACT(MONTH FROM service_date) = 6
       ORDER BY service_date`,
      [branch.id]
    );
    assert.equal(submittedAttendance.rows[0].status, "synced_to_monthly_report");
    assert.equal(submittedAttendance.rows[1].status, "draft");

    const updatedGiving = await givingSummariesRepo.findGivingSummaryByIdForBranch(pool, giving.id, branch.id);
    assert.equal(updatedGiving.status, "included_in_monthly_report");

    await cleanup(pool, branch.id, org.id);
  }
);

test(
  "report is scoped to branch_id",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("scope_mr");
    const a = await seedBranchAdmin(pool, `${suffix}_a`);
    const b = await seedBranchAdmin(pool, `${suffix}_b`);

    const report = await monthlyReportsRepo.createOrUpdateDraftReportForBranchPeriod(pool, {
      organization_id: a.org.id,
      branch_id: a.branch.id,
      period_year: 2026,
      period_month: 5,
      starting_members: 10,
      new_members: 1,
      transferred_members: 0,
      inactive_members: 0,
      ending_members: 11,
      services_held: 4,
      ministry_meetings_held: 1,
      department_meetings_held: 0,
      outreach_activities: 0,
      special_events: 0,
      ministry_activity_notes: "",
      main_challenges: "None",
      support_needed_from_hq: "None",
      giving_snapshot_json: {},
      attendance_snapshot_json: {},
    });

    const app = makeApp({ kind: "branch", orgSlug: b.org.slug, organization: b.org, branch: b.branch });
    const agent = request.agent(app);
    await agent.post("/branch/login").type("form").send({
      identifier: `mr_admin_${suffix}_b@example.com`,
      password: "testpass123",
    });

    const res = await agent.get(`/branch/reports/${report.id}`);
    assert.equal(res.status, 404);

    await cleanup(pool, a.branch.id, a.org.id);
    await cleanup(pool, b.branch.id, b.org.id);
  }
);
