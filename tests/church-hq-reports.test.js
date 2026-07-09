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
      secret: "test-church-hq",
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

async function seedOrgWithHqAndBranch(pool, suffix) {
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `hq_${suffix}`,
    name: `HQ Church ${suffix}`,
  });
  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: "main",
    name: `HQ Branch ${suffix}`,
  });
  const passwordHash = await bcrypt.hash("testpass123", 12);
  const branchAdmin = await branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    full_name: "Branch Admin",
    email: `branch_${suffix}@example.com`,
    phone: "0977111333",
    password_hash: passwordHash,
  });
  const hqAdmin = await hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: "HQ Admin",
    email: `hq_${suffix}@example.com`,
    phone: "0977111444",
    password_hash: passwordHash,
  });
  return { org, branch, branchAdmin, hqAdmin };
}

async function createSubmittedReport(pool, org, branch, adminId) {
  const draft = await monthlyReportsService.saveDraftReport(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    period_year: 2026,
    period_month: 6,
    starting_members: 50,
    new_members: 3,
    transferred_members: 0,
    inactive_members: 1,
    ending_members: 52,
    services_held: 4,
    ministry_meetings_held: 2,
    department_meetings_held: 1,
    outreach_activities: 1,
    special_events: 0,
    ministry_activity_notes: "Camp",
    main_challenges: "Volunteers",
    support_needed_from_hq: "Training",
  });
  return monthlyReportsRepo.submitReportForBranch(pool, draft.id, branch.id, adminId, {
    sunday_average: 55,
    midweek_average: 20,
    children_average: 5,
    youth_average: 10,
    visitors_total: 4,
    giving_summary_id: null,
    giving_snapshot_json: { total_giving: 100 },
    attendance_snapshot_json: { submitted_record_count: 1 },
  });
}

async function cleanup(pool, branchId, orgId) {
  await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_monthly_reports WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
  await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
  await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
}

test("non-church host cannot access HQ reports", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/hq/reports");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to HQ login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo Org" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/hq/dashboard");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/hq/login");
});

test(
  "HQ report review workflow",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("hq");
    const { org, branch, branchAdmin, hqAdmin } = await seedOrgWithHqAndBranch(pool, suffix);
    const report = await createSubmittedReport(pool, org, branch, branchAdmin.id);

    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hq_b_${suffix}`,
      name: "Other Org",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      name: "Other Branch",
    });
    const otherReport = await createSubmittedReport(pool, orgB, branchB, branchAdmin.id);

    const app = makeApp({ kind: "branch", orgSlug: org.slug, organization: org, branch });
    const hqAgent = request.agent(app);
    const login = await hqAgent.post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: "testpass123",
    });
    assert.equal(login.status, 303);
    assert.equal(login.headers.location, "/hq/dashboard");

    const dashboard = await hqAgent.get("/hq/dashboard");
    assert.equal(dashboard.status, 200);
    assert.match(dashboard.text, /HQ Dashboard/);

    const list = await hqAgent.get("/hq/reports");
    assert.equal(list.status, 200);
    assert.match(list.text, /Awaiting review/);

    const detail = await hqAgent.get(`/hq/reports/${report.id}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Volunteers/);

    const crossOrg = await hqAgent.get(`/hq/reports/${otherReport.id}`);
    assert.equal(crossOrg.status, 404);

    const approve = await hqAgent
      .post(`/hq/reports/${report.id}/approve`)
      .type("form")
      .send({ hq_review_comment: "Well done." });
    assert.equal(approve.status, 303);

    const approved = await monthlyReportsRepo.findReportByIdForOrganization(pool, report.id, org.id);
    assert.equal(approved.status, "approved");
    assert.equal(approved.hq_review_comment, "Well done.");

    await monthlyReportsRepo.createOrUpdateDraftReportForBranchPeriod(pool, {
      organization_id: org.id,
      branch_id: branch.id,
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
      main_challenges: "Test",
      support_needed_from_hq: "Help",
      giving_snapshot_json: {},
      attendance_snapshot_json: {},
    });
    const mayDraft = await monthlyReportsRepo.findReportByPeriodForBranch(pool, branch.id, 2026, 5);
    const maySubmitted = await monthlyReportsRepo.submitReportForBranch(
      pool,
      mayDraft.id,
      branch.id,
      branchAdmin.id,
      {
        sunday_average: 10,
        midweek_average: 5,
        children_average: 2,
        youth_average: 3,
        visitors_total: 1,
        giving_summary_id: null,
        giving_snapshot_json: {},
        attendance_snapshot_json: {},
      }
    );

    const changes = await hqAgent
      .post(`/hq/reports/${maySubmitted.id}/request-changes`)
      .type("form")
      .send({ hq_review_comment: "Please clarify outreach numbers." });
    assert.equal(changes.status, 303);

    const changed = await monthlyReportsRepo.findReportByIdForBranch(pool, maySubmitted.id, branch.id);
    assert.equal(changed.status, "changes_requested");

    const branchAgent = request.agent(app);
    await branchAgent.post("/branch/login").type("form").send({
      identifier: `branch_${suffix}@example.com`,
      password: "testpass123",
    });
    const branchDetail = await branchAgent.get(`/branch/reports/${maySubmitted.id}`);
    assert.equal(branchDetail.status, 200);
    assert.match(branchDetail.text, /HQ requested changes/);
    assert.match(branchDetail.text, /Please clarify outreach numbers/);
    assert.match(branchDetail.text, /Resubmit to HQ/);

    await cleanup(pool, branch.id, org.id);
    await cleanup(pool, branchB.id, orgB.id);
  }
);
