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
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const givingSummariesRepo = require("../src/db/pg/church/givingSummariesRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const churchRoutes = require("../src/routes/church");
const {
  parseGivingSummaryQuery,
  resolveGivingListState,
  formatGivingMoney,
  buildGivingOverviewFromSummaries,
  computeSameMonthYoYChange,
} = require("../src/church/givingValidation");

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
      secret: "test-phase6-giving",
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
    await pool.query(`DELETE FROM public.church_giving_summaries WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branch_admins WHERE branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM public.church_branches WHERE id = $1`, [branchId]);
  }
  for (const orgId of orgIds) {
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = $1`, [orgId]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [orgId]);
  }
}

test("parseGivingSummaryQuery allowlists range, status, branch_id", () => {
  assert.deepEqual(parseGivingSummaryQuery({ range: "ytd", status: "draft", month: "2026-07", branch_id: "9" }), {
    status: "draft",
    range: "ytd",
    month: "2026-07",
    q: "",
    branchId: 9,
    showForm: false,
  });
  assert.equal(parseGivingSummaryQuery({ range: "last_30_days" }).range, "all");
  assert.equal(parseGivingSummaryQuery({ status: "refunded" }).status, "all");
  assert.equal(parseGivingSummaryQuery({ branch_id: "-2" }).branchId, null);
});

test("resolveGivingListState distinguishes empty and no_results", () => {
  assert.equal(resolveGivingListState({ q: "" }, [], { hasSummariesInScope: false }), "empty");
  assert.equal(resolveGivingListState({ q: "x" }, []), "no_results");
  assert.equal(resolveGivingListState({ status: "draft" }, []), "no_results");
  assert.equal(resolveGivingListState({ q: "" }, [{ id: 1 }]), "results");
});

test("formatGivingMoney uses currency code without inventing conversion", () => {
  assert.match(formatGivingMoney(1234.5, "ZMW"), /1[,.]?234\.50|ZMW/);
  assert.match(formatGivingMoney(10, "USD"), /10\.00|USD|\$/);
});

test("buildGivingOverviewFromSummaries does not mix currencies", () => {
  const overview = buildGivingOverviewFromSummaries([
    {
      currency_code: "ZMW",
      tithes_total: 100,
      offerings_total: 50,
      building_fund_total: 0,
      missions_fund_total: 0,
      special_offerings_total: 0,
      other_giving_total: 0,
    },
    {
      currency_code: "USD",
      tithes_total: 999,
      offerings_total: 0,
      building_fund_total: 0,
      missions_fund_total: 0,
      special_offerings_total: 0,
      other_giving_total: 0,
    },
  ]);
  assert.equal(overview.mixedCurrency, true);
  assert.equal(overview.currencyCode, "ZMW");
  assert.equal(overview.grandTotal, 150);
  assert.equal(overview.summaryCount, 1);
});

test("computeSameMonthYoYChange only when historical same-currency data exists", () => {
  assert.equal(computeSameMonthYoYChange([], 2026, 7), null);
  const yoy = computeSameMonthYoYChange(
    [
      {
        period_year: 2026,
        period_month: 7,
        currency_code: "ZMW",
        tithes_total: 200,
        offerings_total: 0,
        building_fund_total: 0,
        missions_fund_total: 0,
        special_offerings_total: 0,
        other_giving_total: 0,
      },
      {
        period_year: 2025,
        period_month: 7,
        currency_code: "ZMW",
        tithes_total: 100,
        offerings_total: 0,
        building_fund_total: 0,
        missions_fund_total: 0,
        special_offerings_total: 0,
        other_giving_total: 0,
      },
    ],
    2026,
    7
  );
  assert.equal(yoy.percentChange, 100);
});

test("Giving navigation destination stays on giving-summary, not attendance", () => {
  const nav = fs.readFileSync(path.join(__dirname, "../src/church/http/classicAdminNav.js"), "utf8");
  const shell = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/branch_admin_shell_start.ejs"),
    "utf8"
  );
  assert.match(nav, /testId: "nav-giving"/);
  assert.match(nav, /href: "\/branch\/giving-summary"/);
  assert.doesNotMatch(nav, /testId: "nav-giving"[^]*href: "\/branch\/attendance/);
  assert.doesNotMatch(nav, /href: "\/branch-admin\/attendance/);
  assert.match(shell, /href="\/branch\/giving-summary"/);
  assert.match(shell, /data-testid="nav-more-giving"/);
});

test("unauthorized and non-church hosts cannot open giving summary", async () => {
  const blocked = makeApp(null, false);
  assert.equal((await request(blocked).get("/branch/giving-summary")).status, 404);
  assert.equal((await request(blocked).get("/hq/giving-summary")).status, 404);

  const app = makeApp({
    kind: "branch",
    orgSlug: "demo",
    organization: { id: 1, name: "Demo", status: "active", plan_code: "foundation" },
    branch: { id: 1, name: "Demo Branch", status: "active" },
  });
  assert.equal((await request(app).get("/branch/giving-summary")).headers.location, "/branch/login");
  assert.equal((await request(app).get("/hq/giving-summary")).headers.location, "/hq/login");
});

test(
  "Phase 6 branch giving summary: filters, isolation, empty hooks, currency, no donor ledger",
  async (t) => {
    if (!isPgConfigured()) return t.skip("PostgreSQL not configured");
    const pool = getPgPool();
    try {
      await ensureCanonicalTenantsForTests(pool);
      await ensureChurchSchema(pool);
    } catch (err) {
      return t.skip(`Church PG schema unavailable: ${err.message}`);
    }

    const suffix = makeSuffix("p6giv");
    const passwordHash = await bcrypt.hash("testpass123", 12);
    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6ga_${suffix}`.slice(0, 40),
      name: `Phase6 Giv A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6gb_${suffix}`.slice(0, 40),
      name: `Phase6 Giv B ${suffix}`,
    });
    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgA.id,
      slug: "main",
      host_slug: `hs_branchA_${suffix}`.slice(0, 40),
      name: `Branch A ${suffix}`,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: "main",
      host_slug: `hs_branchB_${suffix}`.slice(0, 40),
      name: `Branch B ${suffix}`,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgA.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `admin_a_${suffix}@example.com`,
      phone: "0977111001",
      password_hash: passwordHash,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgB.id,
      branch_id: branchB.id,
      full_name: "Admin B",
      email: `admin_b_${suffix}@example.com`,
      phone: "0977111002",
      password_hash: passwordHash,
    });

    const appA = makeApp({
      kind: "branch",
      orgSlug: orgA.slug,
      organization: orgA,
      branch: branchA,
    });
    const agent = request.agent(appA);
    await agent.post("/branch/login").type("form").send({
      identifier: `admin_a_${suffix}@example.com`,
      password: "testpass123",
    });

    const empty = await agent.get("/branch/giving-summary");
    assert.equal(empty.status, 200);
    assert.match(empty.text, /data-p6-screen="giving-summary"/);
    assert.match(empty.text, /data-list-state="empty"/);
    assert.match(empty.text, /data-testid="giving-empty"/);
    assert.match(empty.text, /data-responsive="desktop-mobile"/);
    assert.match(empty.text, /href="\/branch\/giving-summary"/);
    assert.match(empty.text, /data-testid="nav-giving"/);
    assert.doesNotMatch(empty.text, /Benjamin Miller|New Donors|Stripe Connect|Average Gift/);
    assert.match(empty.text, /data-testid="giving-transactions-gap"/);

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

    const list = await agent.get("/branch/giving-summary");
    assert.equal(list.status, 200);
    assert.match(list.text, /data-list-state="results"/);
    assert.match(list.text, /data-testid="giving-table"/);
    assert.match(list.text, /data-testid="giving-cards"/);
    assert.match(list.text, /data-testid="giving-fund-breakdown"/);
    assert.match(list.text, /July totals|2026-07/);

    const monthFilter = await agent.get("/branch/giving-summary?month=2026-07&status=draft");
    assert.equal(monthFilter.status, 200);
    assert.match(monthFilter.text, /2026-07/);
    const miss = await agent.get("/branch/giving-summary?month=2020-01");
    assert.equal(miss.status, 200);
    assert.match(miss.text, /data-testid="giving-no-results"/);
    const badQuery = await agent.get("/branch/giving-summary?status=refunded&range=hack&branch_id=-1");
    assert.equal(badQuery.status, 200);
    assert.doesNotMatch(badQuery.text, /refunded/);

    const appB = makeApp({
      kind: "branch",
      orgSlug: orgB.slug,
      organization: orgB,
      branch: branchB,
    });
    const agentB = request.agent(appB);
    await agentB.post("/branch/login").type("form").send({
      identifier: `admin_b_${suffix}@example.com`,
      password: "testpass123",
    });
    const isolation = await agentB.get("/branch/giving-summary");
    assert.equal(isolation.status, 200);
    assert.doesNotMatch(isolation.text, /July totals/);

    const saved = await givingSummariesRepo.getGivingSummaryForBranchPeriod(pool, branchA.id, 2026, 7);
    assert.ok(saved);
    assert.equal((await agentB.get(`/branch/giving-summary/${saved.id}`)).status, 404);

    await cleanup(pool, [branchA.id, branchB.id], [orgA.id, orgB.id]);
  }
);

test(
  "Phase 6 HQ Growth giving summary: access, branch filter, tenant isolation; Foundation blocked",
  async (t) => {
    if (!isPgConfigured()) return t.skip("PostgreSQL not configured");
    const pool = getPgPool();
    try {
      await ensureCanonicalTenantsForTests(pool);
      await ensureChurchSchema(pool);
    } catch (err) {
      return t.skip(`Church PG schema unavailable: ${err.message}`);
    }

    const suffix = makeSuffix("p6hqgiv");
    const passwordHash = await bcrypt.hash("hq_pass_123456", 12);
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6hg_${suffix}`.slice(0, 40),
      name: `Phase6 HQ Giv ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      org.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgFresh = await organizationsRepo.findOrganizationById(pool, org.id);
    const branch1 = await branchesRepo.createBranch(pool, {
      organization_id: orgFresh.id,
      slug: "main",
      host_slug: `hs_branch1_${suffix}`.slice(0, 40),
      name: "Main Campus",
      status: "active",
    });
    const branch2 = await branchesRepo.createBranch(pool, {
      organization_id: orgFresh.id,
      slug: "east",
      host_slug: `hs_branch2_${suffix}`.slice(0, 40),
      name: "East Campus",
      status: "active",
    });
    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6hgo_${suffix}`.slice(0, 40),
      name: `Phase6 HQ Giv Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    const orgOtherFresh = await organizationsRepo.findOrganizationById(pool, orgOther.id);
    const branchOther = await branchesRepo.createBranch(pool, {
      organization_id: orgOtherFresh.id,
      slug: "main",
      host_slug: `hs_branchOther_${suffix}`.slice(0, 40),
      name: "Other Main",
      status: "active",
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgFresh.id,
      full_name: "HQ Admin",
      email: `hq_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
    });

    await givingSummariesRepo.upsertGivingSummaryForBranchPeriod(pool, {
      organization_id: orgFresh.id,
      branch_id: branch1.id,
      period_year: 2026,
      period_month: 6,
      tithes_total: 500,
      offerings_total: 50,
      building_fund_total: 0,
      missions_fund_total: 0,
      special_offerings_total: 0,
      other_giving_total: 0,
      notes: "HQ Visible Main",
      status: "submitted",
      created_by_admin_id: null,
    });
    await givingSummariesRepo.upsertGivingSummaryForBranchPeriod(pool, {
      organization_id: orgFresh.id,
      branch_id: branch2.id,
      period_year: 2026,
      period_month: 6,
      tithes_total: 200,
      offerings_total: 20,
      building_fund_total: 0,
      missions_fund_total: 0,
      special_offerings_total: 0,
      other_giving_total: 0,
      notes: "HQ Visible East",
      status: "draft",
      created_by_admin_id: null,
    });
    await givingSummariesRepo.upsertGivingSummaryForBranchPeriod(pool, {
      organization_id: orgOtherFresh.id,
      branch_id: branchOther.id,
      period_year: 2026,
      period_month: 6,
      tithes_total: 9999,
      offerings_total: 0,
      building_fund_total: 0,
      missions_fund_total: 0,
      special_offerings_total: 0,
      other_giving_total: 0,
      notes: "Foreign Giving",
      status: "submitted",
      created_by_admin_id: null,
    });

    const app = makeApp({
      kind: "branch",
      orgSlug: orgFresh.slug,
      organization: orgFresh,
      branch: branch1,
    });
    const agent = request.agent(app);
    await agent.post("/hq/login").type("form").send({
      identifier: `hq_${suffix}@example.com`,
      password: "hq_pass_123456",
    });

    const page = await agent.get("/hq/giving-summary");
    assert.equal(page.status, 200);
    assert.match(page.text, /data-p6-screen="giving-summary"/);
    assert.match(page.text, /name="branch_id"/);
    assert.match(page.text, /Main Campus/);
    assert.match(page.text, /East Campus/);
    assert.match(page.text, /giving-kpi-total">K[\s\u00a0]*770\.00/);
    assert.doesNotMatch(page.text, /Other Main/);
    assert.doesNotMatch(page.text, /9999/);
    assert.doesNotMatch(page.text, /data-testid="giving-compose"/);

    const branchFiltered = await agent.get(`/hq/giving-summary?branch_id=${branch1.id}`);
    assert.equal(branchFiltered.status, 200);
    assert.match(branchFiltered.text, /Main Campus/);
    // Branch names remain in the filter <select>; assert scoped results + KPI only.
    assert.match(branchFiltered.text, /<td>Main Campus<\/td>/);
    assert.doesNotMatch(branchFiltered.text, /<td>East Campus<\/td>/);
    assert.doesNotMatch(branchFiltered.text, /church-p6-person-card__contact">East Campus/);
    assert.match(branchFiltered.text, /giving-kpi-total">K[\s\u00a0]*550\.00/);

    const badBranch = await agent.get(`/hq/giving-summary?branch_id=${branchOther.id}`);
    assert.equal(badBranch.status, 200);
    assert.doesNotMatch(badBranch.text, /Other Main/);
    assert.doesNotMatch(badBranch.text, /9999/);

    const foundationOrg = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `p6hgf_${suffix}`.slice(0, 40),
      name: `Phase6 HQ Giv Found ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      foundationOrg.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );
    const foundationFresh = await organizationsRepo.findOrganizationById(pool, foundationOrg.id);
    const foundationBranch = await branchesRepo.createBranch(pool, {
      organization_id: foundationFresh.id,
      slug: "main",
      host_slug: `hs_foundationBranch_${suffix}`.slice(0, 40),
      name: "Found Main",
      status: "active",
    });
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: foundationFresh.id,
      full_name: "HQ Found",
      email: `hqf_${suffix}@example.com`,
      phone: "0977333001",
      password_hash: passwordHash,
    });
    const foundationApp = makeApp({
      kind: "branch",
      orgSlug: foundationFresh.slug,
      organization: foundationFresh,
      branch: foundationBranch,
    });
    const foundationAgent = request.agent(foundationApp);
    await foundationAgent.post("/hq/login").type("form").send({
      identifier: `hqf_${suffix}@example.com`,
      password: "hq_pass_123456",
    });
    assert.equal((await foundationAgent.get("/hq/giving-summary")).status, 403);

    await cleanup(
      pool,
      [branch1.id, branch2.id, branchOther.id, foundationBranch.id],
      [orgFresh.id, orgOtherFresh.id, foundationFresh.id]
    );
  }
);
