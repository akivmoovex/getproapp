"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const {
  CROSS_BRANCH_KPI_DEFINITIONS,
} = require("../src/church/crossBranchKpiDefinitions");
const crossBranchComparisonService = require("../src/services/church/crossBranchComparisonService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("cross-branch KPI definitions document required metrics", () => {
  assert.ok(CROSS_BRANCH_KPI_DEFINITIONS.active_members);
  assert.ok(CROSS_BRANCH_KPI_DEFINITIONS.giving_totals.requires_finance_permission);
  assert.ok(CROSS_BRANCH_KPI_DEFINITIONS.event_registrations);
  assert.ok(CROSS_BRANCH_KPI_DEFINITIONS.pastoral_workload);
  assert.ok(CROSS_BRANCH_KPI_DEFINITIONS.survey_completions);
  assert.match(CROSS_BRANCH_KPI_DEFINITIONS.event_registrations.definition, /church_event_registrations/i);
});

test(
  "Growth cross-branch comparison: access, finance, filters, isolation, reconciliation, query count",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("xbr");
    const passwordHash = await bcrypt.hash("xbr_pw_123456", 12);

    const orgG = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `xg_${suffix}`.slice(0, 40),
      name: `XBranch Growth ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgG.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const orgF = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `xf_${suffix}`.slice(0, 40),
      name: `XBranch Found ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgF.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `xb_${suffix}`.slice(0, 40),
      name: `XBranch Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgB.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const branchMain = await branchesRepo.createBranch(pool, {
      organization_id: orgG.id,
      slug: `main_${suffix}`.slice(0, 30),
      host_slug: `main_${suffix}`.slice(0, 30),
      name: "Main Campus",
      status: "active",
    });
    const branchZero = await branchesRepo.createBranch(pool, {
      organization_id: orgG.id,
      slug: `zero_${suffix}`.slice(0, 30),
      host_slug: `zero_${suffix}`.slice(0, 30),
      name: "Zero Campus",
      status: "active",
    });
    const branchInactive = await branchesRepo.createBranch(pool, {
      organization_id: orgG.id,
      slug: `ina_${suffix}`.slice(0, 30),
      host_slug: `ina_${suffix}`.slice(0, 30),
      name: "Inactive Campus",
      status: "archived",
    });
    const branchDemo = await branchesRepo.createBranch(pool, {
      organization_id: orgG.id,
      slug: `demo-${suffix}`.slice(0, 30),
      host_slug: `demo-${suffix}`.slice(0, 30),
      name: "Demo Campus",
      status: "active",
    });
    const branchOtherOrg = await branchesRepo.createBranch(pool, {
      organization_id: orgB.id,
      slug: `ob_${suffix}`.slice(0, 30),
      host_slug: `ob_${suffix}`.slice(0, 30),
      name: "Other Org Campus",
      status: "active",
    });

    const hqNoFinance = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgG.id,
      full_name: "HQ No Finance",
      email: `hqnf_${suffix}@example.com`,
      phone: "0977333001",
      password_hash: passwordHash,
      status: "active",
    });
    const hqFinance = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgG.id,
      full_name: "HQ Finance",
      email: `hqf_${suffix}@example.com`,
      phone: "0977333002",
      password_hash: passwordHash,
      status: "active",
    });
    await pool.query(
      `UPDATE public.church_hq_admins SET can_view_finance = true WHERE id = $1`,
      [hqFinance.id]
    );

    await membersRepo.createPendingMember(pool, {
      organization_id: orgG.id,
      branch_id: branchMain.id,
      platform_tenant_id: TENANT_ZM,
      full_name: "Member Main",
      email: `mm_${suffix}@example.com`,
      phone: "0977333010",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    const member = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchMain.id,
      `mm_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, member.id, branchMain.id, "verified");

    await pool.query(
      `INSERT INTO public.church_attendance_records (
         organization_id, branch_id, service_date, attendance_type,
         adults_count, youth_count, children_count, first_time_visitors_count, status
       ) VALUES
       ($1, $2, '2026-07-05', 'Sunday service', 40, 10, 5, 3, 'submitted'),
       ($1, $2, '2026-07-12', 'Sunday service', 42, 8, 6, 2, 'submitted'),
       ($1, $2, '2026-06-07', 'Sunday service', 100, 0, 0, 9, 'submitted')`,
      [orgG.id, branchMain.id]
    );

    const eventIns = await pool.query(
      `INSERT INTO public.church_events (
         organization_id, branch_id, title, description, event_date, start_time, location_text, status
       ) VALUES ($1, $2, 'Youth Night', '', '2026-07-05', '18:00', 'Hall', 'published')
       RETURNING id`,
      [orgG.id, branchMain.id]
    );
    const eventId = eventIns.rows[0].id;
    const regIns = await pool.query(
      `INSERT INTO public.church_event_registrations (
         organization_id, branch_id, event_id, member_id, status, party_size
       ) VALUES ($1, $2, $3, $4, 'registered', 1)
       RETURNING id`,
      [orgG.id, branchMain.id, eventId, member.id]
    );
    await pool.query(
      `INSERT INTO public.church_event_check_ins (
         organization_id, branch_id, event_id, registration_id, member_id, method
       ) VALUES ($1, $2, $3, $4, $5, 'registration')`,
      [orgG.id, branchMain.id, eventId, regIns.rows[0].id, member.id]
    );

    await pool.query(
      `INSERT INTO public.church_giving_summaries (
         organization_id, branch_id, period_year, period_month,
         tithes_total, offerings_total, status
       ) VALUES ($1, $2, 2026, 7, 1000, 250, 'submitted')`,
      [orgG.id, branchMain.id]
    );

    // Other org noise
    await pool.query(
      `INSERT INTO public.church_attendance_records (
         organization_id, branch_id, service_date, attendance_type,
         adults_count, youth_count, children_count, first_time_visitors_count, status
       ) VALUES ($1, $2, '2026-07-05', 'Sunday service', 999, 0, 0, 50, 'submitted')`,
      [orgB.id, branchOtherOrg.id]
    );

    // --- Foundation restriction ---
    await assert.rejects(
      () =>
        crossBranchComparisonService.loadCrossBranchComparison(pool, {
          organizationId: orgF.id,
          canViewFinance: false,
          filters: crossBranchComparisonService.parseFilters({
            date_from: "2026-07-01",
            date_to: "2026-07-31",
          }),
        }),
      (err) => err && err.code === "FOUNDATION_CROSS_BRANCH_FORBIDDEN"
    );

    // --- Growth access + finance permission ---
    const noFin = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
      organizationId: orgG.id,
      canViewFinance: await crossBranchComparisonService.hqAdminCanViewFinance(
        pool,
        hqNoFinance.id,
        orgG.id
      ),
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-07-01",
        date_to: "2026-07-31",
      }),
    });
    assert.equal(noFin.canViewFinance, false);
    assert.ok(noFin.rows.every((r) => r.giving_total === undefined));
    assert.equal(noFin.queryCount, 1);

    const withFin = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
      organizationId: orgG.id,
      canViewFinance: true,
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-07-01",
        date_to: "2026-07-31",
      }),
    });
    assert.equal(withFin.queryCount, 1);
    assert.ok(withFin.queryCount <= 3);

    const mainRow = withFin.rows.find((r) => r.branch_id === branchMain.id);
    const zeroRow = withFin.rows.find((r) => r.branch_id === branchZero.id);
    assert.ok(mainRow);
    assert.ok(zeroRow);
    assert.equal(mainRow.active_members, 1);
    assert.equal(mainRow.monthly_attendance, 40 + 10 + 5 + 42 + 8 + 6);
    assert.equal(mainRow.visitors, 5);
    assert.equal(mainRow.event_registrations, 1);
    assert.equal(mainRow.event_attendance, 1);
    assert.equal(mainRow.giving_total, 1250);
    assert.ok(mainRow.giving_by_fund);
    assert.equal(mainRow.giving_by_fund.tithes_total, 1000);
    assert.ok(withFin.rankings && withFin.rankings.monthly_attendance);
    assert.equal(withFin.rankings.monthly_attendance[0].branch_id, branchMain.id);
    assert.equal(zeroRow.active_members, 0);
    assert.equal(zeroRow.monthly_attendance, 0);

    // Inactive + demo excluded
    assert.ok(!withFin.rows.some((r) => r.branch_id === branchInactive.id));
    assert.ok(!withFin.rows.some((r) => r.branch_id === branchDemo.id));

    // --- Tenant isolation ---
    assert.ok(!withFin.rows.some((r) => r.branch_id === branchOtherOrg.id));
    assert.ok(!withFin.rows.some((r) => /Other Org/.test(r.branch_name)));

    // --- Date filters (June only — July attendance excluded) ---
    const june = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
      organizationId: orgG.id,
      canViewFinance: true,
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      }),
    });
    const juneMain = june.rows.find((r) => r.branch_id === branchMain.id);
    assert.equal(juneMain.monthly_attendance, 100);
    assert.equal(juneMain.visitors, 9);

    // --- Service filter ---
    const midweek = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
      organizationId: orgG.id,
      canViewFinance: false,
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-07-01",
        date_to: "2026-07-31",
        service: "Midweek",
      }),
    });
    const midMain = midweek.rows.find((r) => r.branch_id === branchMain.id);
    assert.equal(midMain.monthly_attendance, 0);

    // --- Branch filter ---
    const oneBranch = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
      organizationId: orgG.id,
      canViewFinance: false,
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-07-01",
        date_to: "2026-07-31",
        branch_id: String(branchZero.id),
      }),
    });
    assert.equal(oneBranch.rows.length, 1);
    assert.equal(oneBranch.rows[0].branch_id, branchZero.id);

    // --- Total vs drill-down reconciliation ---
    const drill = await crossBranchComparisonService.loadBranchDrillDown(pool, {
      organizationId: orgG.id,
      branchId: branchMain.id,
      canViewFinance: true,
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-07-01",
        date_to: "2026-07-31",
      }),
    });
    assert.equal(drill.reconciliation.attendance_matches, true);
    assert.equal(drill.reconciliation.visitors_matches, true);
    assert.ok(drill.givingSummaries.length >= 1);
    assert.equal(Number(drill.summary.giving_total), 1250);

    // Drill-down without finance cannot see giving rows
    const drillNoFin = await crossBranchComparisonService.loadBranchDrillDown(pool, {
      organizationId: orgG.id,
      branchId: branchMain.id,
      canViewFinance: false,
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-07-01",
        date_to: "2026-07-31",
      }),
    });
    assert.equal(drillNoFin.givingSummaries.length, 0);
    assert.ok(drillNoFin.summary.giving_total === undefined);

    // Cross-tenant drill-down denied
    await assert.rejects(
      () =>
        crossBranchComparisonService.loadBranchDrillDown(pool, {
          organizationId: orgG.id,
          branchId: branchOtherOrg.id,
          canViewFinance: true,
          filters: crossBranchComparisonService.parseFilters({
            date_from: "2026-07-01",
            date_to: "2026-07-31",
          }),
        }),
      (err) => err && err.code === "NOT_FOUND"
    );
  }
);
