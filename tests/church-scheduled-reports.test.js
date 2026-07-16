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
const {
  computeNextRunAt,
  jobKeyForScheduleRun,
  normalizeTimezone,
} = require("../src/church/scheduledReportTiming");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const churchPackageUsageService = require("../src/services/church/churchPackageUsageService");
const { getOrganisationPlan, hasEntitlement } = require("../src/services/church/churchEntitlementService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("timezone-aware next run for Africa/Lusaka daily 09:00", () => {
  assert.equal(normalizeTimezone("Not/AZone"), "UTC");
  const schedule = {
    frequency: "daily",
    timezone: "Africa/Lusaka",
    delivery_time_local: "09:00",
  };
  // 07:30 Lusaka on 2026-07-16 → next is same day 09:00 Lusaka
  const before = new Date("2026-07-16T05:30:00.000Z"); // UTC+2 → 07:30
  const next = computeNextRunAt(schedule, before);
  assert.equal(next.toISOString(), "2026-07-16T07:00:00.000Z");

  const after = new Date("2026-07-16T07:05:00.000Z");
  const next2 = computeNextRunAt(schedule, after);
  assert.equal(next2.toISOString(), "2026-07-17T07:00:00.000Z");

  const key = jobKeyForScheduleRun(12, next);
  assert.match(key, /^sched_report:12:2026-07-16T07:00:00\.000Z$/);
});

test(
  "Growth schedule workflow: create, foundation block, security, timezone, duplicate, quota, retry",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("schedrpt");
    const passwordHash = await bcrypt.hash("schedrpt_pw_123456", 12);

    const orgGrowth = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `sg_${suffix}`.slice(0, 40),
      name: `Sched Growth ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgGrowth.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    await pool.query(`UPDATE public.church_organizations SET timezone = $2 WHERE id = $1`, [
      orgGrowth.id,
      "Africa/Lusaka",
    ]);

    const orgFoundation = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `sf_${suffix}`.slice(0, 40),
      name: `Sched Found ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgFoundation.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgOther = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `so_${suffix}`.slice(0, 40),
      name: `Sched Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgOther.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const branchG = await branchesRepo.createBranch(pool, {
      organization_id: orgGrowth.id,
      slug: `bg_${suffix}`.slice(0, 30),
      host_slug: `bg_${suffix}`.slice(0, 30),
      name: "Growth Branch",
      status: "active",
    });
    const branchF = await branchesRepo.createBranch(pool, {
      organization_id: orgFoundation.id,
      slug: `bf_${suffix}`.slice(0, 30),
      host_slug: `bf_${suffix}`.slice(0, 30),
      name: "Foundation Branch",
      status: "active",
    });
    const branchO = await branchesRepo.createBranch(pool, {
      organization_id: orgOther.id,
      slug: `bo_${suffix}`.slice(0, 30),
      host_slug: `bo_${suffix}`.slice(0, 30),
      name: "Other Branch",
      status: "active",
    });

    const adminG = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchG.id,
      full_name: "Growth Admin",
      email: `ga_${suffix}@example.com`,
      phone: "0977111001",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET can_view_finance = true WHERE id = $1`,
      [adminG.id]
    );
    const recipientG2 = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchG.id,
      full_name: "Recipient Two",
      email: `gr_${suffix}@example.com`,
      phone: "0977111002",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    const adminF = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgFoundation.id,
      branch_id: branchF.id,
      full_name: "Foundation Admin",
      email: `fa_${suffix}@example.com`,
      phone: "0977111003",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    const adminOther = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgOther.id,
      branch_id: branchO.id,
      full_name: "Other Admin",
      email: `oa_${suffix}@example.com`,
      phone: "0977111004",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    const hqG = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgGrowth.id,
      full_name: "HQ Growth",
      email: `hqg_${suffix}@example.com`,
      phone: "0977111005",
      password_hash: passwordHash,
      role: "hq_admin",
      status: "active",
    });

    const planG = await getOrganisationPlan(pool, orgGrowth.id);
    assert.equal(planG.packageCode, "growth");
    assert.equal(hasEntitlement(planG, "reports.scheduled"), true);

    // --- Growth schedule creation ---
    const created = await scheduledReportService.createSchedule(pool, {
      organizationId: orgGrowth.id,
      branchId: branchG.id,
      actorType: "branch_admin",
      actorId: adminG.id,
      at: new Date("2026-07-16T05:00:00.000Z"),
      body: {
        report_type: "branch_attendance_summary",
        export_format: "csv",
        frequency: "daily",
        timezone: "Africa/Lusaka",
        delivery_time_local: "09:00",
        period_month: "2026-06",
        recipients: [
          { recipient_type: "branch_admin", recipient_id: adminG.id },
          { recipient_type: "hq_admin", recipient_id: hqG.id },
        ],
      },
    });
    assert.ok(created.id);
    assert.equal(created.status, "enabled");
    assert.equal(created.export_format, "csv");
    assert.equal(new Date(created.next_run_at).toISOString(), "2026-07-16T07:00:00.000Z");

    // Pause / enable / cancel paths
    const paused = await scheduledReportService.updateScheduleStatus(pool, {
      scheduleId: created.id,
      organizationId: orgGrowth.id,
      branchId: branchG.id,
      status: "paused",
      actorId: adminG.id,
    });
    assert.equal(paused.status, "paused");
    assert.equal(paused.next_run_at, null);
    const enabled = await scheduledReportService.updateScheduleStatus(pool, {
      scheduleId: created.id,
      organizationId: orgGrowth.id,
      branchId: branchG.id,
      status: "enabled",
      actorId: adminG.id,
      at: new Date("2026-07-16T05:00:00.000Z"),
    });
    assert.equal(enabled.status, "enabled");

    // --- Foundation restriction ---
    await assert.rejects(
      () =>
        scheduledReportService.createSchedule(pool, {
          organizationId: orgFoundation.id,
          branchId: branchF.id,
          actorType: "branch_admin",
          actorId: adminF.id,
          body: {
            report_type: "branch_attendance_summary",
            export_format: "pdf",
            frequency: "weekly",
            day_of_week: 1,
            timezone: "UTC",
            delivery_time_local: "10:00",
            recipients: [{ recipient_type: "branch_admin", recipient_id: adminF.id }],
          },
        }),
      (err) => err && err.code === "FOUNDATION_SCHEDULE_FORBIDDEN"
    );

    // --- Unauthorised report type ---
    await assert.rejects(
      () =>
        scheduledReportService.createSchedule(pool, {
          organizationId: orgGrowth.id,
          branchId: branchG.id,
          actorType: "branch_admin",
          actorId: adminG.id,
          body: {
            report_type: "network_executive_report",
            export_format: "csv",
            frequency: "daily",
            timezone: "UTC",
            delivery_time_local: "09:00",
            recipients: [{ recipient_type: "branch_admin", recipient_id: adminG.id }],
          },
        }),
      (err) => err && (err.code === "VALIDATION" || err.code === "UNAUTHORISED_REPORT")
    );

    // --- Cross-tenant recipient ---
    await assert.rejects(
      () =>
        scheduledReportService.createSchedule(pool, {
          organizationId: orgGrowth.id,
          branchId: branchG.id,
          actorType: "branch_admin",
          actorId: adminG.id,
          body: {
            report_type: "branch_giving_summary",
            export_format: "csv",
            frequency: "monthly",
            day_of_month: 1,
            timezone: "UTC",
            delivery_time_local: "09:00",
            recipients: [{ recipient_type: "branch_admin", recipient_id: adminOther.id }],
          },
        }),
      (err) => err && err.code === "UNAUTHORISED_RECIPIENT"
    );

    // --- Timezone execution (due job) ---
    const beforeDue = await scheduledReportService.processDueScheduledReports(pool, {
      at: new Date("2026-07-16T06:59:00.000Z"),
      limit: 50,
    });
    assert.ok(
      !beforeDue.processed.some(
        (p) => p.scheduleId === created.id && p.outcome === "delivered"
      )
    );

    const due = await scheduledReportService.processDueScheduledReports(pool, {
      at: new Date("2026-07-16T07:01:00.000Z"),
      limit: 50,
    });
    const dueHit = due.processed.find((p) => p.scheduleId === created.id);
    assert.ok(dueHit);
    assert.equal(dueHit.outcome, "delivered");
    assert.ok(dueHit.delivered >= 2);

    // --- Duplicate job execution (no second delivery) ---
    const scheduleRow = await scheduledReportService.findScheduleForBranch(
      pool,
      created.id,
      orgGrowth.id,
      branchG.id
    );
    // Force next_run back to same slot and re-run same scheduledFor via execute
    const dup = await scheduledReportService.executeScheduleRun(pool, scheduleRow, {
      at: new Date("2026-07-16T07:02:00.000Z"),
      scheduledFor: new Date("2026-07-16T07:00:00.000Z"),
    });
    assert.equal(dup.outcome, "duplicate_job");

    const deliveries = await pool.query(
      `SELECT d.status, d.idempotency_key
       FROM public.church_scheduled_report_deliveries d
       INNER JOIN public.church_scheduled_report_runs r ON r.id = d.run_id
       WHERE r.schedule_id = $1 AND r.organization_id = $2`,
      [created.id, orgGrowth.id]
    );
    const deliveredKeys = deliveries.rows.filter((d) => d.status === "delivered");
    assert.equal(deliveredKeys.length, 2);

    // --- Deleted recipient / permission removed before run ---
    // Attach recipientG2 on a new schedule, deactivate, then run.
    const sched2 = await scheduledReportService.createSchedule(pool, {
      organizationId: orgGrowth.id,
      branchId: branchG.id,
      actorType: "branch_admin",
      actorId: adminG.id,
      at: new Date("2026-07-20T05:00:00.000Z"),
      body: {
        report_type: "branch_monthly_summary",
        export_format: "pdf",
        frequency: "daily",
        timezone: "UTC",
        delivery_time_local: "08:00",
        recipients: [
          { recipient_type: "branch_admin", recipient_id: adminG.id },
          { recipient_type: "branch_admin", recipient_id: recipientG2.id },
        ],
      },
    });
    await pool.query(
      `UPDATE public.church_branch_admins SET status = 'inactive', deactivated_at = now() WHERE id = $1`,
      [recipientG2.id]
    );
    // Also delete means hard-delete for one path: create then delete recipient row assignment check
    // Permission removed: inactive treated as unauthorised.
    await pool.query(
      `UPDATE public.church_scheduled_reports SET next_run_at = $2 WHERE id = $1`,
      [sched2.id, new Date("2026-07-20T08:00:00.000Z").toISOString()]
    );
    const run2 = await scheduledReportService.processDueScheduledReports(pool, {
      at: new Date("2026-07-20T08:01:00.000Z"),
    });
    const hit2 = run2.processed.find((p) => p.scheduleId === sched2.id);
    assert.ok(hit2);
    assert.equal(hit2.outcome, "delivered");
    assert.equal(hit2.skipped, 1);
    assert.equal(hit2.delivered, 1);

    // Deleted recipient: remove admin row after schedule (soft: set deleted by removing recipient auth)
    // Simulate by scheduling with recipientG2 still on list (inactive already skipped).
    // Hard-delete path:
    const recipientGone = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgGrowth.id,
      branch_id: branchG.id,
      full_name: "Soon Deleted",
      email: `gd_${suffix}@example.com`,
      phone: "0977111006",
      password_hash: passwordHash,
      role: "branch_admin",
      status: "active",
    });
    const sched3 = await scheduledReportService.createSchedule(pool, {
      organizationId: orgGrowth.id,
      branchId: branchG.id,
      actorType: "branch_admin",
      actorId: adminG.id,
      at: new Date("2026-07-21T05:00:00.000Z"),
      body: {
        report_type: "branch_giving_summary",
        export_format: "csv",
        frequency: "daily",
        timezone: "UTC",
        delivery_time_local: "08:00",
        recipients: [
          { recipient_type: "branch_admin", recipient_id: adminG.id },
          { recipient_type: "branch_admin", recipient_id: recipientGone.id },
        ],
      },
    });
    await pool.query(`DELETE FROM public.church_branch_admins WHERE id = $1`, [recipientGone.id]);
    await pool.query(
      `UPDATE public.church_scheduled_reports SET next_run_at = $2 WHERE id = $1`,
      [sched3.id, new Date("2026-07-21T08:00:00.000Z").toISOString()]
    );
    const run3 = await scheduledReportService.processDueScheduledReports(pool, {
      at: new Date("2026-07-21T08:01:00.000Z"),
    });
    const hit3 = run3.processed.find((p) => p.scheduleId === sched3.id);
    assert.ok(hit3);
    assert.equal(hit3.skipped, 1);
    assert.equal(hit3.delivered, 1);

    // --- Failed delivery and retry (idempotent) ---
    const runs = await scheduledReportService.listRunsForSchedule(pool, created.id, orgGrowth.id, 5);
    const firstRun = runs.find((r) => r.status === "delivered") || runs[0];
    assert.ok(firstRun);
    await pool.query(
      `UPDATE public.church_scheduled_report_runs
       SET status = 'failed', last_error = 'simulated failure', finished_at = now()
       WHERE id = $1`,
      [firstRun.id]
    );
    await pool.query(
      `UPDATE public.church_scheduled_report_deliveries
       SET status = 'failed', error_message = 'simulated', delivered_at = NULL
       WHERE run_id = $1`,
      [firstRun.id]
    );
    const retry1 = await scheduledReportService.retryFailedRun(pool, firstRun.id, orgGrowth.id);
    assert.equal(retry1.outcome, "delivered");
    assert.ok(retry1.delivered >= 1);
    const retry2 = await scheduledReportService.retryFailedRun(pool, firstRun.id, orgGrowth.id).catch(
      (e) => e
    );
    // Second retry should fail validation (status no longer failed) OR be safe
    assert.ok(retry2 && (retry2.code === "INVALID_STATUS" || retry2.outcome === "delivered"));

    // --- Monthly quota (20) ---
    const quotaAt = new Date("2026-08-05T12:00:00.000Z");
    for (let i = 0; i < 20; i++) {
      await churchPackageUsageService.assertCanCreateScheduledReport(pool, {
        organizationId: orgGrowth.id,
        consume: true,
        at: quotaAt,
      });
    }
    await assert.rejects(
      () =>
        churchPackageUsageService.assertCanCreateScheduledReport(pool, {
          organizationId: orgGrowth.id,
          consume: true,
          at: quotaAt,
        }),
      (err) => err && err.code === "PACKAGE_SCHEDULED_REPORT_LIMIT"
    );

    // Quota skip during job: schedule due after consuming 20 already for August usage month.
    // Use Africa/Lusaka org timezone — August 2026.
    const schedQuota = await scheduledReportService.createSchedule(pool, {
      organizationId: orgGrowth.id,
      branchId: branchG.id,
      actorType: "branch_admin",
      actorId: adminG.id,
      at: new Date("2026-08-10T05:00:00.000Z"),
      body: {
        report_type: "branch_attendance_summary",
        export_format: "csv",
        frequency: "daily",
        timezone: "Africa/Lusaka",
        delivery_time_local: "09:00",
        recipients: [{ recipient_type: "branch_admin", recipient_id: adminG.id }],
      },
    });
    await pool.query(
      `UPDATE public.church_scheduled_reports SET next_run_at = $2 WHERE id = $1`,
      [schedQuota.id, new Date("2026-08-10T07:00:00.000Z").toISOString()]
    );
    const qRun = await scheduledReportService.processDueScheduledReports(pool, {
      at: new Date("2026-08-10T07:01:00.000Z"),
    });
    const qHit = qRun.processed.find((p) => p.scheduleId === schedQuota.id);
    assert.ok(qHit);
    assert.equal(qHit.outcome, "skipped_quota");

    // Audit rows exist for create + run
    const audits = await pool.query(
      `SELECT action FROM public.church_audit_logs
       WHERE organization_id = $1
         AND action LIKE 'scheduled_report%'
       ORDER BY id ASC`,
      [orgGrowth.id]
    );
    assert.ok(audits.rows.some((a) => a.action === "scheduled_report_created"));
    assert.ok(audits.rows.some((a) => a.action === "scheduled_report_run_completed"));
  }
);
