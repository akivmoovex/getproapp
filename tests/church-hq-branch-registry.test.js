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
const membersRepo = require("../src/db/pg/church/membersRepo");
const monthlyReportsRepo = require("../src/db/pg/church/monthlyReportsRepo");
const monthlyReportsService = require("../src/services/church/monthlyReportsService");
const hqBranchesRepo = require("../src/db/pg/church/hqBranchesRepo");
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
      secret: "test-church-hq-branches",
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
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("non-church host cannot access /hq/branches", async () => {
  const app = makeApp(null, false);
  const res = await request(app).get("/hq/branches");
  assert.equal(res.status, 404);
});

test("unauthenticated visitor redirects to /hq/login", async () => {
  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  const res = await request(app).get("/hq/branches");
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, "/hq/login");
});

test(
  "HQ branch registry and performance detail",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("hqbr");
    const passwordHash = await bcrypt.hash("testpass123", 12);

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqbr_a_${suffix}`,
      name: `HQ Branch Org A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `hqbr_b_${suffix}`,
      name: `HQ Branch Org B ${suffix}`,
    });

    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      name: `Branch A ${suffix}`,
      location_text: "Kafue",
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
      phone: "0977555001",
      password_hash: passwordHash,
    });

    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgA.id,
      full_name: "HQ Admin A",
      email: `hq_a_${suffix}@example.com`,
      phone: "0977555002",
      password_hash: passwordHash,
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgB.id,
      full_name: "HQ Admin B",
      email: `hq_b_${suffix}@example.com`,
      phone: "0977555003",
      password_hash: passwordHash,
    });

    await membersRepo.createPendingMember(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      email: `member_${suffix}@example.com`,
      phone: "0977555004",
      full_name: "Verified Member",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Kafue",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    await membersRepo.updateMemberStatusForBranch(pool, (await membersRepo.findMemberByEmailOrPhoneForBranch(pool, branchA.id, `member_${suffix}@example.com`)).id, branchA.id, "verified");

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
      giving_snapshot_json: { total_giving: 5000 },
      attendance_snapshot_json: { submitted_record_count: 2 },
    });

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

    const registry = await hqAgent.get("/hq/branches");
    assert.equal(registry.status, 200);
    assert.match(registry.text, new RegExp(`Branch A ${suffix}`));
    assert.doesNotMatch(registry.text, new RegExp(`Branch B ${suffix}`));

    const performance = await hqAgent.get(`/hq/branches/${branchA.id}`);
    assert.equal(performance.status, 200);
    assert.match(performance.text, /Active members/i);
    assert.match(performance.text, /Reports summary/i);
    assert.match(performance.text, /Attention items|Missing current month report/i);

    const summary = await hqBranchesRepo.getBranchPerformanceSummary(pool, orgA.id, branchA.id, {
      year: 2026,
      month: 6,
    });
    assert.ok(summary);
    assert.equal(summary.memberSummary.active, 1);
    assert.equal(summary.reportSummary.currentReport.status, "submitted");
    assert.ok(summary.attentionItems.length >= 0);

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
    const cross = await hqB.get(`/hq/branches/${branchA.id}`);
    assert.equal(cross.status, 404);

    await cleanup(pool, [orgA.id, orgB.id]);
  }
);
