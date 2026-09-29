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
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const monthlyReportsRepo = require("../src/db/pg/church/monthlyReportsRepo");
const monthlyReportsService = require("../src/services/church/monthlyReportsService");
const {
  CROSS_BRANCH_KPI_DEFINITIONS,
} = require("../src/church/crossBranchKpiDefinitions");
const crossBranchComparisonService = require("../src/services/church/crossBranchComparisonService");
const growthAdvancedReportingService = require("../src/services/church/growthAdvancedReportingService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const foundationBasicReportService = require("../src/services/church/foundationBasicReportService");
const { getOrganisationPlan, hasEntitlement } = require("../src/services/church/churchEntitlementService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("each Growth advanced report KPI has one documented definition", () => {
  const required = [
    "active_members",
    "monthly_attendance",
    "group_attendance",
    "visitors",
    "visitor_retention",
    "absence_follow_ups",
    "event_registrations",
    "event_attendance",
    "open_pastoral_follow_ups",
    "pastoral_workload",
    "overdue_pastoral_cases",
    "survey_completions",
    "survey_completion_rate",
    "giving_totals",
  ];
  for (const id of required) {
    assert.ok(CROSS_BRANCH_KPI_DEFINITIONS[id], id);
    assert.ok(CROSS_BRANCH_KPI_DEFINITIONS[id].definition);
    assert.ok(CROSS_BRANCH_KPI_DEFINITIONS[id].source);
  }
});

test(
  "Growth advanced reporting: aggregates, filters, saved filters, schedule finance, lock, foundation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("advrpt");
    const passwordHash = await bcrypt.hash("advrpt_pw_123456", 12);

    const orgG = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ag_${suffix}`.slice(0, 40),
      name: `AdvRpt Growth ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgG.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const orgF = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `af_${suffix}`.slice(0, 40),
      name: `AdvRpt Found ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgF.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `ao_${suffix}`.slice(0, 40),
      name: `AdvRpt Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: orgG.id,
      slug: `ba_${suffix}`.slice(0, 30),
      host_slug: `ba_${suffix}`.slice(0, 30),
      name: "Campus A",
      status: "active",
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: orgG.id,
      slug: `bb_${suffix}`.slice(0, 30),
      host_slug: `bb_${suffix}`.slice(0, 30),
      name: "Campus B",
      status: "active",
    });
    const branchOther = await branchesRepo.createBranch(pool, {
      organization_id: orgOther.id,
      slug: `bo_${suffix}`.slice(0, 30),
      host_slug: `bo_${suffix}`.slice(0, 30),
      name: "Other Org",
      status: "active",
    });
    const branchF = await branchesRepo.createBranch(pool, {
      organization_id: orgF.id,
      slug: `bf_${suffix}`.slice(0, 30),
      host_slug: `bf_${suffix}`.slice(0, 30),
      name: "Foundation Campus",
      status: "active",
    });

    const adminA = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgG.id,
      branch_id: branchA.id,
      full_name: "Admin A",
      email: `aa_${suffix}@example.com`,
      phone: "0977444001",
      password_hash: passwordHash,
      status: "active",
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_view_finance = true WHERE id = $1`,
      [adminA.id]
    );
    const adminNoFin = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgG.id,
      branch_id: branchA.id,
      full_name: "Admin No Fin",
      email: `anf_${suffix}@example.com`,
      phone: "0977444002",
      password_hash: passwordHash,
      status: "active",
    });
    const adminF = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgF.id,
      branch_id: branchF.id,
      full_name: "Admin Found",
      email: `af_${suffix}@example.com`,
      phone: "0977444003",
      password_hash: passwordHash,
      status: "active",
    });
    const hqG = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgG.id,
      full_name: "HQ Adv",
      email: `hq_${suffix}@example.com`,
      phone: "0977444004",
      password_hash: passwordHash,
      status: "active",
    });
    await pool.query(`UPDATE public.church_hq_admins SET can_view_finance = true WHERE id = $1`, [
      hqG.id,
    ]);

    await membersRepo.createPendingMember(pool, {
      organization_id: orgG.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      full_name: "Member A",
      email: `ma_${suffix}@example.com`,
      phone: "0977444010",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    const memberA = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchA.id,
      `ma_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, memberA.id, branchA.id, "verified");

    await membersRepo.createPendingMember(pool, {
      organization_id: orgG.id,
      branch_id: branchB.id,
      platform_tenant_id: TENANT_ZM,
      full_name: "Member B",
      email: `mb_${suffix}@example.com`,
      phone: "0977444011",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "usher",
    });
    const memberB = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchB.id,
      `mb_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, memberB.id, branchB.id, "verified");

    await pool.query(
      `INSERT INTO public.church_attendance_records (
         organization_id, branch_id, service_date, attendance_type,
         adults_count, youth_count, children_count, first_time_visitors_count, status
       ) VALUES
       ($1, $2, '2026-07-05', 'Sunday service', 30, 5, 5, 4, 'submitted'),
       ($1, $3, '2026-07-05', 'Sunday service', 10, 2, 1, 1, 'submitted')`,
      [orgG.id, branchA.id, branchB.id]
    );

    const groupA = await pool.query(
      `INSERT INTO public.church_groups (
         organization_id, branch_id, name, status
       ) VALUES ($1, $2, 'Cell A', 'active') RETURNING id`,
      [orgG.id, branchA.id]
    );
    const meeting = await pool.query(
      `INSERT INTO public.church_group_meetings (
         organization_id, branch_id, group_id, starts_at, status
       ) VALUES ($1, $2, $3, '2026-07-06T18:00:00Z', 'completed') RETURNING id`,
      [orgG.id, branchA.id, groupA.rows[0].id]
    );
    await pool.query(
      `INSERT INTO public.church_group_attendance (
         organization_id, branch_id, group_id, meeting_id, member_id, present
       ) VALUES ($1, $2, $3, $4, $5, true)`,
      [orgG.id, branchA.id, groupA.rows[0].id, meeting.rows[0].id, memberA.id]
    );

    const eventA = await pool.query(
      `INSERT INTO public.church_events (
         organization_id, branch_id, title, description, event_date, start_time, location_text, status
       ) VALUES ($1, $2, 'Conference', '', '2026-07-10', '09:00', 'Main', 'published')
       RETURNING id`,
      [orgG.id, branchA.id]
    );
    const regA = await pool.query(
      `INSERT INTO public.church_event_registrations (
         organization_id, branch_id, event_id, member_id, status, party_size
       ) VALUES ($1, $2, $3, $4, 'registered', 1) RETURNING id`,
      [orgG.id, branchA.id, eventA.rows[0].id, memberA.id]
    );
    await pool.query(
      `INSERT INTO public.church_event_check_ins (
         organization_id, branch_id, event_id, registration_id, member_id, method
       ) VALUES ($1, $2, $3, $4, $5, 'registration')`,
      [orgG.id, branchA.id, eventA.rows[0].id, regA.rows[0].id, memberA.id]
    );
    await pool.query(
      `INSERT INTO public.church_event_visitor_follow_ups (
         organization_id, branch_id, event_id, visitor_name, status
       ) VALUES ($1, $2, $3, 'Guest', 'closed')`,
      [orgG.id, branchA.id, eventA.rows[0].id]
    );

    await pool.query(
      `INSERT INTO public.church_pastoral_automation_work_items (
         organization_id, branch_id, member_id, trigger_type, status
       ) VALUES ($1, $2, $3, 'missed_service', 'pending')`,
      [orgG.id, branchA.id, memberA.id]
    );

    const caseA = await pool.query(
      `INSERT INTO public.church_pastoral_cases (
         organization_id, branch_id, member_id, title, status, assigned_admin_id, due_date
       ) VALUES ($1, $2, $3, 'Care case', 'open', $4, '2026-07-01')
       RETURNING id`,
      [orgG.id, branchA.id, memberA.id, adminA.id]
    );
    void caseA;

    const survey = await pool.query(
      `INSERT INTO public.church_surveys (
         organization_id, branch_id, title, status, sensitivity, authorised_audience, route_on_submit
       ) VALUES ($1, $2, 'Pulse', 'active', 'standard', 'branch_admin', 'none')
       RETURNING id`,
      [orgG.id, branchA.id]
    );
    await membersRepo.createPendingMember(pool, {
      organization_id: orgG.id,
      branch_id: branchA.id,
      platform_tenant_id: TENANT_ZM,
      full_name: "Member A2",
      email: `ma2_${suffix}@example.com`,
      phone: "0977444012",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    const memberA2 = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchA.id,
      `ma2_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, memberA2.id, branchA.id, "verified");
    await pool.query(
      `INSERT INTO public.church_survey_response_sessions (
         organization_id, branch_id, survey_id, member_id, status, submitted_at
       ) VALUES
       ($1, $2, $3, $4, 'submitted', '2026-07-08T12:00:00Z'),
       ($1, $2, $3, $5, 'in_progress', NULL)`,
      [orgG.id, branchA.id, survey.rows[0].id, memberA.id, memberA2.id]
    );

    await pool.query(
      `INSERT INTO public.church_giving_summaries (
         organization_id, branch_id, period_year, period_month,
         tithes_total, offerings_total, building_fund_total, status
       ) VALUES ($1, $2, 2026, 7, 500, 100, 50, 'submitted')`,
      [orgG.id, branchA.id]
    );

    // Noise in other tenant
    await pool.query(
      `INSERT INTO public.church_attendance_records (
         organization_id, branch_id, service_date, attendance_type,
         adults_count, youth_count, children_count, first_time_visitors_count, status
       ) VALUES ($1, $2, '2026-07-05', 'Sunday service', 999, 0, 0, 99, 'submitted')`,
      [orgOther.id, branchOther.id]
    );

    const planG = await getOrganisationPlan(pool, orgG.id);
    assert.equal(hasEntitlement(planG, "reports.cross_branch"), true);
    assert.equal(hasEntitlement(planG, "reports.scheduled"), true);

    // --- Cross-branch aggregates ---
    const comparison = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
      organizationId: orgG.id,
      canViewFinance: true,
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-07-01",
        date_to: "2026-07-31",
      }),
    });
    const rowA = comparison.rows.find((r) => r.branch_id === branchA.id);
    const rowB = comparison.rows.find((r) => r.branch_id === branchB.id);
    assert.ok(rowA && rowB);
    assert.equal(rowA.monthly_attendance, 40);
    assert.equal(rowA.group_attendance, 1);
    assert.equal(rowA.visitors, 4);
    assert.equal(rowA.visitor_retention, 1);
    assert.equal(rowA.absence_follow_ups, 1);
    assert.equal(rowA.event_registrations, 1);
    assert.equal(rowA.event_attendance, 1);
    assert.equal(rowA.pastoral_workload, 1);
    assert.equal(rowA.overdue_pastoral_cases, 1);
    assert.equal(rowA.survey_completions, 1);
    assert.ok(rowA.survey_completion_rate > 0);
    assert.equal(rowA.giving_total, 650);
    assert.equal(rowA.giving_by_fund.tithes_total, 500);
    assert.equal(rowA.giving_by_fund.building_fund_total, 50);

    // Totals reconcile to sum of branches
    assert.equal(
      comparison.totals.monthly_attendance,
      comparison.rows.reduce((s, r) => s + r.monthly_attendance, 0)
    );
    assert.equal(
      comparison.totals.event_registrations,
      comparison.rows.reduce((s, r) => s + r.event_registrations, 0)
    );
    assert.ok(!comparison.rows.some((r) => r.branch_id === branchOther.id));

    // Branch ranking
    assert.equal(comparison.rankings.monthly_attendance[0].branch_id, branchA.id);
    assert.equal(comparison.rankings.monthly_attendance[0].rank, 1);

    // Filter combinations: group + service
    const filtered = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
      organizationId: orgG.id,
      canViewFinance: false,
      filters: crossBranchComparisonService.parseFilters({
        date_from: "2026-07-01",
        date_to: "2026-07-31",
        service: "Sunday service",
        group_id: String(groupA.rows[0].id),
      }),
    });
    const fA = filtered.rows.find((r) => r.branch_id === branchA.id);
    assert.equal(fA.group_attendance, 1);
    assert.equal(fA.monthly_attendance, 40);

    // Saved filters
    const saved = await growthAdvancedReportingService.saveFilter(
      pool,
      {
        organization_id: orgG.id,
        actor_type: "hq_admin",
        actor_id: hqG.id,
      },
      {
        name: `July Sunday ${suffix}`,
        surface: "cross_branch",
        date_from: "2026-07-01",
        date_to: "2026-07-31",
        service: "Sunday service",
        group_id: String(groupA.rows[0].id),
      }
    );
    assert.ok(saved.id);
    const applied = await growthAdvancedReportingService.applySavedFilter(
      pool,
      { organization_id: orgG.id },
      saved.id
    );
    assert.equal(applied.filters.serviceType, "Sunday service");
    assert.equal(applied.filters.groupId, groupA.rows[0].id);

    await assert.rejects(
      () =>
        growthAdvancedReportingService.saveFilter(
          pool,
          { organization_id: orgF.id, actor_id: adminF.id },
          { name: "Nope", surface: "cross_branch", date_from: "2026-07-01", date_to: "2026-07-31" }
        ),
      (err) => err && err.code === "PACKAGE_REQUIRED"
    );

    // Foundation restriction on schedule
    await assert.rejects(
      () =>
        scheduledReportService.createSchedule(pool, {
          organizationId: orgF.id,
          branchId: branchF.id,
          actorType: "branch_admin",
          actorId: adminF.id,
          body: {
            report_type: "branch_attendance_summary",
            export_format: "csv",
            frequency: "daily",
            timezone: "UTC",
            delivery_time_local: "09:00",
            recipients: [{ recipient_type: "branch_admin", recipient_id: adminF.id }],
          },
        }),
      (err) => err && err.code === "FOUNDATION_SCHEDULE_FORBIDDEN"
    );

    // Finance permission on schedule create
    await assert.rejects(
      () =>
        scheduledReportService.createSchedule(pool, {
          organizationId: orgG.id,
          branchId: branchA.id,
          actorType: "branch_admin",
          actorId: adminNoFin.id,
          body: {
            report_type: "branch_giving_summary",
            export_format: "csv",
            frequency: "daily",
            timezone: "UTC",
            delivery_time_local: "09:00",
            period_month: "2026-07",
            recipients: [{ recipient_type: "branch_admin", recipient_id: adminNoFin.id }],
          },
        }),
      (err) => err && err.code === "FINANCE_FORBIDDEN"
    );

    const givingSched = await scheduledReportService.createSchedule(pool, {
      organizationId: orgG.id,
      branchId: branchA.id,
      actorType: "branch_admin",
      actorId: adminA.id,
      at: new Date("2026-07-16T05:00:00.000Z"),
      body: {
        report_type: "branch_giving_summary",
        export_format: "csv",
        frequency: "daily",
        timezone: "UTC",
        delivery_time_local: "09:00",
        period_month: "2026-07",
        recipients: [
          { recipient_type: "branch_admin", recipient_id: adminA.id },
          { recipient_type: "branch_admin", recipient_id: adminNoFin.id },
        ],
      },
    });
    await pool.query(
      `UPDATE public.church_scheduled_reports SET next_run_at = $2 WHERE id = $1`,
      [givingSched.id, new Date("2026-07-16T09:00:00.000Z").toISOString()]
    );
    const givingRun = await scheduledReportService.processDueScheduledReports(pool, {
      at: new Date("2026-07-16T09:01:00.000Z"),
    });
    const gHit = givingRun.processed.find((p) => p.scheduleId === givingSched.id);
    assert.ok(gHit);
    assert.equal(gHit.outcome, "delivered");
    assert.equal(gHit.delivered, 1);
    assert.equal(gHit.skipped, 1);

    // Permission removed before execution (finance revoked)
    await pool.query(
      `UPDATE public.church_branch_admins SET can_view_finance = false WHERE id = $1`,
      [adminA.id]
    );
    const givingSched2 = await pool.query(
      `SELECT * FROM public.church_scheduled_reports WHERE id = $1`,
      [givingSched.id]
    );
    // Re-enable next run slot
    await pool.query(
      `UPDATE public.church_scheduled_reports SET next_run_at = $2, status = 'enabled' WHERE id = $1`,
      [givingSched.id, new Date("2026-07-17T09:00:00.000Z").toISOString()]
    );
    const revoked = await scheduledReportService.executeScheduleRun(pool, givingSched2.rows[0], {
      at: new Date("2026-07-17T09:01:00.000Z"),
      scheduledFor: new Date("2026-07-17T09:00:00.000Z"),
    });
    assert.equal(revoked.outcome, "skipped_finance_permission");

    // Duplicate execution
    await pool.query(
      `UPDATE public.church_branch_admins SET can_view_finance = true WHERE id = $1`,
      [adminA.id]
    );
    const attSched = await scheduledReportService.createSchedule(pool, {
      organizationId: orgG.id,
      branchId: branchA.id,
      actorType: "branch_admin",
      actorId: adminA.id,
      at: new Date("2026-07-18T05:00:00.000Z"),
      body: {
        report_type: "branch_attendance_summary",
        export_format: "csv",
        frequency: "daily",
        timezone: "UTC",
        delivery_time_local: "10:00",
        period_month: "2026-07",
        recipients: [{ recipient_type: "branch_admin", recipient_id: adminA.id }],
      },
    });
    await pool.query(
      `UPDATE public.church_scheduled_reports SET next_run_at = $2 WHERE id = $1`,
      [attSched.id, new Date("2026-07-18T10:00:00.000Z").toISOString()]
    );
    const dueAtt = await scheduledReportService.processDueScheduledReports(pool, {
      at: new Date("2026-07-18T10:01:00.000Z"),
    });
    assert.equal(dueAtt.processed.find((p) => p.scheduleId === attSched.id).outcome, "delivered");
    const schedRow = await scheduledReportService.findScheduleForBranch(
      pool,
      attSched.id,
      orgG.id,
      branchA.id
    );
    const dup = await scheduledReportService.executeScheduleRun(pool, schedRow, {
      at: new Date("2026-07-18T10:02:00.000Z"),
      scheduledFor: new Date("2026-07-18T10:00:00.000Z"),
    });
    assert.equal(dup.outcome, "duplicate_job");

    // Monthly report review / approval / lock
    const draft = await monthlyReportsService.saveDraftReport(pool, {
      organization_id: orgG.id,
      branch_id: branchA.id,
      period_year: 2026,
      period_month: 6,
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
      ministry_activity_notes: "ok",
      main_challenges: "none",
      support_needed_from_hq: "",
    });
    const submitted = await monthlyReportsRepo.submitReportForBranch(pool, draft.id, branchA.id, adminA.id, {
      sunday_average: 40,
      midweek_average: 10,
      children_average: 5,
      youth_average: 5,
      visitors_total: 4,
      giving_summary_id: null,
      giving_snapshot_json: { total_giving: 650 },
      attendance_snapshot_json: { submitted_record_count: 1 },
    });
    assert.equal(submitted.status, "submitted");
    const approved = await monthlyReportsRepo.approveReportForOrganization(
      pool,
      submitted.id,
      orgG.id,
      "Looks good",
      hqG.id
    );
    assert.equal(approved.status, "approved");
    assert.ok(approved.locked_at);
    assert.equal(Number(approved.locked_by_hq_admin_id), hqG.id);
    assert.equal(monthlyReportsRepo.isMonthlyReportLocked(approved), true);

    // Foundation basic report still works
    const basic = await foundationBasicReportService.loadFoundationBasicReport(pool, {
      organizationId: orgF.id,
      branchId: branchF.id,
      adminId: adminF.id,
      query: { date_from: "2026-07-01", date_to: "2026-07-31" },
    });
    assert.ok(basic.kpis);
    assert.ok(Object.prototype.hasOwnProperty.call(basic.kpis, "active_members"));
  }
);
