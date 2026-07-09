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
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const monthlyReportsRepo = require("../src/db/pg/church/monthlyReportsRepo");
const monthlyReportsService = require("../src/services/church/monthlyReportsService");
const givingSummariesRepo = require("../src/db/pg/church/givingSummariesRepo");
const hqAnalyticsRepo = require("../src/db/pg/church/hqAnalyticsRepo");
const { parseAnalyticsPeriods } = require("../src/church/hqAnalyticsValidation");
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
      secret: "test-church-hq-analytics",
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

async function cleanup(pool, orgIds) {
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_monthly_reports WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_giving_summaries WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /hq/analytics", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/hq/analytics");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /hq/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/hq/analytics");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/hq/login");
});

test(
  "HQ consolidated analytics",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("hqan");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqan_a_${suffix}`,
      name: `HQ Analytics Org A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqan_b_${suffix}`,
      name: `HQ Analytics Org B ${suffix}`,
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

    const branchAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Branch Admin",
      email: `branch_${suffix}@example.com`,
      phone: "0977555201",
      password_hash: passwordHash,
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgA.id,
      full_name: "HQ Admin A",
      email: `hq_a_${suffix}@example.com`,
      phone: "0977555202",
      password_hash: passwordHash,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgB.id,
      full_name: "HQ Admin B",
      email: `hq_b_${suffix}@example.com`,
      phone: "0977555203",
      password_hash: passwordHash,
    });

    const draft = await monthlyReportsService.saveDraftReport(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      period_year: 2026,
      period_month: 6,
      starting_members: 20,
      new_members: 2,
      transferred_members: 0,
      inactive_members: 0,
      ending_members: 22,
      services_held: 4,
      ministry_meetings_held: 1,
      department_meetings_held: 1,
      outreach_activities: 0,
      special_events: 0,
      ministry_activity_notes: "Good month",
      main_challenges: "None",
      support_needed_from_hq: "None",
    });
    await monthlyReportsRepo.submitReportForBranch(pool, draft.id, branchA.id, branchAdmin.id, {
      sunday_average: 45,
      midweek_average: 15,
      children_average: 8,
      youth_average: 10,
      visitors_total: 3,
      giving_summary_id: null,
      giving_snapshot_json: { total_giving: 7500 },
      attendance_snapshot_json: { submitted_record_count: 2 },
    });

    await givingSummariesRepo.upsertGivingSummaryForBranchPeriod(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      period_year: 2026,
      period_month: 6,
      tithes_total: 5000,
      offerings_total: 1500,
      building_fund_total: 500,
      missions_fund_total: 300,
      special_offerings_total: 200,
      other_giving_total: 0,
      currency_code: "ZMW",
      status: "submitted",
      created_by_admin_id: branchAdmin.id,
    });

    const { period } = parseAnalyticsPeriods({ period_month: "2026-06" });
    const analyticsA = await hqAnalyticsRepo.getConsolidatedAnalytics(pool, orgA.id, period, null);
    assert.equal(analyticsA.summary.totalBranches, 1);
    assert.equal(analyticsA.reports.totals.submitted, 1);
    assert.ok(analyticsA.giving.totals.grandTotal >= 7500);
    assert.ok(analyticsA.branchHealth.some((row) => row.branch_id === branchA.id));

    const analyticsB = await hqAnalyticsRepo.getConsolidatedAnalytics(pool, orgB.id, period, null);
    assert.equal(analyticsB.summary.totalBranches, 1);
    assert.equal(analyticsB.reports.totals.missing, 1);
    const missingBranch = analyticsB.branchHealth.find((row) => row.branch_id === branchB.id);
    assert.ok(missingBranch);
    assert.equal(missingBranch.missingReport, true);
    assert.ok(["Watch", "Needs Attention"].includes(missingBranch.healthLabel));

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const hqAgent = request.agent(appA);
    await hqAgent.post("/hq/login").type("form").send({
      identifier: `hq_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const page = await hqAgent.get("/hq/analytics?period_month=2026-06");
    assert.equal(page.status, 200);
    assert.match(page.text, /Consolidated Analytics/);
    assert.match(page.text, /Branch health/);
    assert.match(page.text, new RegExp(`Branch A ${suffix}`));
    assert.doesNotMatch(page.text, new RegExp(`Branch B ${suffix}`));
    assert.doesNotMatch(page.text, /prayer request details/i);
    assert.match(page.text, /reporting only/i);

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const hqB = request.agent(appB);
    await hqB.post("/hq/login").type("form").send({
      identifier: `hq_b_${suffix}@example.com`,
      password: "testpass123",
    });
    const crossPage = await hqB.get("/hq/analytics?period_month=2026-06");
    assert.equal(crossPage.status, 200);
    assert.doesNotMatch(crossPage.text, new RegExp(`Branch A ${suffix}`));

    await cleanup(pool, [orgA.id, orgB.id]);
  }
);
