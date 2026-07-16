"use strict";

const path = require("path");
const fs = require("fs");
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
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const attendanceRepo = require("../src/db/pg/church/attendanceRepo");
const givingSummariesRepo = require("../src/db/pg/church/givingSummariesRepo");
const eventsRepo = require("../src/db/pg/church/eventsRepo");
const prayerRequestsRepo = require("../src/db/pg/church/prayerRequestsRepo");
const churchRoutes = require("../src/routes/church");
const {
  FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS,
  FOUNDATION_BASIC_REPORT_KPI_ORDER,
} = require("../src/church/foundationBasicReportKpiDefinitions");
const {
  FOUNDATION_REPORT_EXPORT_MAX_ROWS,
} = require("../src/church/blessBoardPackageCatalogue");
const foundationBasicReportService = require("../src/services/church/foundationBasicReportService");
const { getOrganisationPlan } = require("../src/services/church/churchEntitlementService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeApp(ctx) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "church-foundation-basic-reports",
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
  return app;
}

async function loginBranchAdmin(agent, email) {
  await agent.post("/branch/login").type("form").send({
    identifier: email,
    password: "testpass123",
  });
}

test("Foundation basic report KPI catalogue covers required metrics", () => {
  for (const id of [
    "total_members",
    "active_members",
    "inactive_members",
    "visitors",
    "monthly_attendance",
    "event_registrations",
    "event_attendance",
    "open_prayer_requests",
    "open_pastoral_follow_ups",
    "giving_totals",
    "ministry_participation",
  ]) {
    assert.ok(FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS[id], `missing KPI ${id}`);
    assert.ok(FOUNDATION_BASIC_REPORT_KPI_ORDER.includes(id));
  }
  assert.ok(FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS.giving_totals.requires_finance_permission);
});

test("Foundation export row limit is defined centrally in catalogue", () => {
  assert.equal(FOUNDATION_REPORT_EXPORT_MAX_ROWS, 500);
});

test(
  "Foundation basic reports: metrics, filters, permissions, export, isolation, reconciliation, mobile",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("fbr");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `fbr_${suffix}`,
      name: `FBR Church ${suffix}`,
      plan_code: "foundation",
    });
    const branch = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: "main",
      name: `FBR Branch ${suffix}`,
    });
    const otherOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `fbr_o_${suffix}`,
      name: `Other ${suffix}`,
      plan_code: "foundation",
    });
    const otherBranch = await branchesRepo.createBranch(pool, {
      organization_id: otherOrg.id,
      slug: "main",
      name: "Other Branch",
    });

    const admin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      full_name: "Report Admin",
      email: `fbr_admin_${suffix}@example.com`,
      phone: "0977888001",
      password_hash: passwordHash,
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_view_finance = false, can_export_reports = true WHERE id = $1`,
      [admin.id]
    );

    const verified = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `v1_${suffix}@example.com`,
      phone: "0977888002",
      full_name: "Verified One",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "1 year",
    });
    await membersRepo.updateMemberStatusForBranch(pool, verified.id, branch.id, "verified");

    const suspended = await membersRepo.createPendingMember(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      platform_tenant_id: TENANT_ZM,
      email: `s1_${suffix}@example.com`,
      phone: "0977888003",
      full_name: "Suspended One",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "1 year",
    });
    await membersRepo.updateMemberStatusForBranch(pool, suspended.id, branch.id, "suspended");

    await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      attendance_date: "2026-06-15",
      attendance_type: "Sunday service",
      service_name: "Morning Worship",
      adults_count: 40,
      youth_count: 10,
      children_count: 5,
      first_time_visitors_count: 3,
      new_members_count: 0,
      volunteers_count: 6,
      status: "submitted",
      created_by_admin_id: admin.id,
    });

    await eventsRepo.createEventForBranch(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      title: "Youth Night",
      event_date: "2026-06-20",
      status: "published",
      visibility: "public",
    });

    await prayerRequestsRepo.createPrayerRequest(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      member_id: verified.id,
      prayer_topic: "Healing",
      details: "Please pray",
      urgency: "normal",
      privacy_level: "pastoral_team",
    });

    await givingSummariesRepo.upsertGivingSummaryForBranchPeriod(pool, {
      organization_id: org.id,
      branch_id: branch.id,
      period_year: 2026,
      period_month: 6,
      tithes_total: 1000,
      offerings_total: 200,
      status: "submitted",
    });

    const plan = await getOrganisationPlan(pool, org.id);
    const exportMax = foundationBasicReportService.getReportExportMaxRows(plan);
    assert.equal(exportMax, FOUNDATION_REPORT_EXPORT_MAX_ROWS);

    const emptyReport = await foundationBasicReportService.loadFoundationBasicReport(pool, {
      organizationId: org.id,
      branchId: branch.id,
      query: { date_from: "2020-01-01", date_to: "2020-01-31" },
      canViewFinance: false,
    });
    assert.equal(emptyReport.kpis.monthly_attendance, 0);
    assert.equal(emptyReport.kpis.visitors, 0);
    assert.equal(emptyReport.attendanceTrend.length, 0);

    const report = await foundationBasicReportService.loadFoundationBasicReport(pool, {
      organizationId: org.id,
      branchId: branch.id,
      query: { date_from: "2026-06-01", date_to: "2026-06-30" },
      canViewFinance: false,
    });
    assert.equal(report.kpis.active_members, 1);
    assert.equal(report.kpis.inactive_members, 1);
    assert.ok(report.kpis.total_members >= 2);
    assert.equal(report.kpis.monthly_attendance, 55);
    assert.equal(report.kpis.visitors, 3);
    assert.equal(report.kpis.event_registrations, 1);
    assert.equal(report.kpis.open_prayer_requests, 1);
    assert.equal(report.kpis.giving_totals, undefined);

    const drillAttendance = await foundationBasicReportService.loadKpiDrillDown(pool, {
      organizationId: org.id,
      branchId: branch.id,
      kpiId: "monthly_attendance",
      filters: report.filters,
      canViewFinance: false,
      exportMaxRows: exportMax,
    });
    assert.equal(drillAttendance.totalCount, 1);
    const headcountSum = drillAttendance.rows.reduce(
      (sum, row) => sum + Number(row.headcount || 0),
      0
    );
    assert.equal(headcountSum, report.kpis.monthly_attendance);

    const drillMembers = await foundationBasicReportService.loadKpiDrillDown(pool, {
      organizationId: org.id,
      branchId: branch.id,
      kpiId: "active_members",
      filters: report.filters,
      exportMaxRows: exportMax,
    });
    assert.equal(drillMembers.totalCount, report.kpis.active_members);

    await assert.rejects(
      () =>
        foundationBasicReportService.loadKpiDrillDown(pool, {
          organizationId: org.id,
          branchId: branch.id,
          kpiId: "giving_totals",
          filters: report.filters,
          canViewFinance: false,
          exportMaxRows: exportMax,
        }),
      (err) => err && err.code === "FINANCE_FORBIDDEN"
    );

    await pool.query(
      `UPDATE public.church_branch_admins SET can_view_finance = true WHERE id = $1`,
      [admin.id]
    );
    const reportFinance = await foundationBasicReportService.loadFoundationBasicReport(pool, {
      organizationId: org.id,
      branchId: branch.id,
      query: { date_from: "2026-06-01", date_to: "2026-06-30" },
      canViewFinance: true,
    });
    assert.ok(reportFinance.kpis.giving_totals > 0);

    const app = makeApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const agent = request.agent(app);
    await loginBranchAdmin(agent, `fbr_admin_${suffix}@example.com`);

    const page = await agent.get("/branch/reports/basic?date_from=2026-06-01&date_to=2026-06-30");
    assert.equal(page.status, 200);
    assert.match(page.text, /Basic reports|Summary metrics/);
    assert.match(page.text, /Monthly attendance trend/);
    assert.match(page.text, /church-show-mobile-only/);
    assert.match(page.text, /Requires finance permission/);

    await pool.query(
      `UPDATE public.church_branch_admins SET can_view_finance = true WHERE id = $1`,
      [admin.id]
    );
    const pageFinance = await agent.get(
      "/branch/reports/basic?date_from=2026-06-01&date_to=2026-06-30"
    );
    assert.match(pageFinance.text, /1,200\.00|1200/);

    const csv = await agent.get(
      "/branch/reports/basic/export.csv?date_from=2026-06-01&date_to=2026-06-30"
    );
    assert.equal(csv.status, 200);
    assert.match(csv.headers["content-type"], /csv/);
    assert.match(csv.text, /Attendance total|monthly_attendance/i);

    const audit = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE branch_id = $1 AND action = 'foundation_basic_report_exported'
       ORDER BY id DESC LIMIT 1`,
      [branch.id]
    );
    assert.equal(audit.rows[0]?.action, "foundation_basic_report_exported");

    await pool.query(
      `UPDATE public.church_branch_admins SET can_export_reports = false WHERE id = $1`,
      [admin.id]
    );
    const blockedExport = await agent.get(
      "/branch/reports/basic/export.csv?date_from=2026-06-01&date_to=2026-06-30"
    );
    assert.equal(blockedExport.status, 403);

    const otherReport = await foundationBasicReportService.loadFoundationBasicReport(pool, {
      organizationId: otherOrg.id,
      branchId: otherBranch.id,
      query: { date_from: "2026-06-01", date_to: "2026-06-30" },
      canViewFinance: false,
    });
    assert.equal(otherReport.kpis.active_members, 0);
    assert.notEqual(otherReport.kpis.monthly_attendance, report.kpis.monthly_attendance);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_prayer_requests WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_events WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_attendance_records WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_giving_summaries WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_members WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branch.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [otherBranch.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [otherOrg.id]);
  }
);

test("basic reports view includes mobile rendering markers", () => {
  const view = fs.readFileSync(
    path.join(__dirname, "../views/church/branch-admin/basic_reports.ejs"),
    "utf8"
  );
  assert.match(view, /church-show-mobile-only/);
  assert.match(view, /church-show-desktop-only/);
  assert.match(view, /visually-hidden/);
});
