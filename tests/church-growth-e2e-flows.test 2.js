"use strict";

/**
 * Focused Growth end-to-end flows against real PostgreSQL + real worker/service paths.
 *
 * Covers only Growth features with real routes (not 501 catalogue stubs):
 * scheduled reports, scheduled broadcasts, cross-branch reporting, multi-branch HQ admin,
 * package upgrade/downgrade, trial conflict, suspension pause, retry protection.
 *
 * Run:
 *   NODE_ENV=test GETPRO_TEST_DB=1 GETPRO_PG_SSL=off node --test tests/church-growth-e2e-flows.test.js
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const { requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const {
  createFoundationSmokeTenant,
  createGrowthSmokeTenant,
  cleanupPilotOrganization,
  makeInjectedChurchApp,
  loginBranchAdmin,
  makeSuffix,
} = require("./helpers/churchPilotSmokeFixtures");

const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");

const { getOrganisationPlan, hasEntitlement } = require("../src/services/church/churchEntitlementService");
const {
  previewPackageAssignment,
  confirmPackageAssignment,
  evaluateFoundationDowngradeEligibility,
} = require("../src/services/church/churchPackageAssignmentService");
const { createBranchByHq, deactivateBranchByHq } = require("../src/services/church/growthMultiBranchService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const scheduledBroadcastService = require("../src/services/church/scheduledBroadcastService");
const crossBranchComparisonService = require("../src/services/church/crossBranchComparisonService");
const { grantGrowthTrial } = require("../src/services/church/churchGrowthTrialService");

async function assertFoundationGrowthDenied(pool, foundation, opts = {}) {
  await assert.rejects(
    () =>
      scheduledReportService.createSchedule(pool, {
        organizationId: foundation.organization.id,
        branchId: foundation.branch.id,
        actorType: "branch_admin",
        actorId: foundation.branchAdmin.id,
        body: {
          report_type: "branch_attendance_summary",
          export_format: "csv",
          frequency: "daily",
          timezone: "UTC",
          delivery_time_local: "09:00",
          recipients: [{ recipient_type: "branch_admin", recipient_id: foundation.branchAdmin.id }],
        },
      }),
    (err) => err && err.code === "FOUNDATION_SCHEDULE_FORBIDDEN"
  );

  await assert.rejects(
    () =>
      crossBranchComparisonService.loadCrossBranchComparison(pool, {
        organizationId: foundation.organization.id,
        canViewFinance: true,
        filters: {},
      }),
    (err) => err && err.code === "FOUNDATION_CROSS_BRANCH_FORBIDDEN"
  );

  if (opts.skipMultiBranchProbe) return;

  // Foundation may create a non-active draft branch, but cannot activate a second active branch.
  const tag = opts.branchTag || "sec";
  const draftSecond = await createBranchByHq(pool, foundation.organization.id, foundation.hqAdmin.id, {
    branch: {
      name: `Second Campus ${tag}`,
      slug: `${tag}-${foundation.suffix}`.slice(0, 30),
      location_text: "Lusaka",
      service_times: "Sunday 10:00",
      country: "Zambia",
      city: "Lusaka",
    },
    branchAdmin: {
      full_name: "Second Admin",
      email: `${tag}_${foundation.suffix}@example.com`,
      phone: "0977000999",
      temporary_password: "temppass12345",
    },
  });
  assert.equal(draftSecond.createdAsActive, false);
  assert.notEqual(draftSecond.branch.status, "active");
}

async function scheduleDueBroadcast(pool, orgId, hqAdminId, branchId, publishAt, title) {
  const draft = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgId, {
    title,
    body: "Growth E2E broadcast body",
    category: "General",
    audience: "members",
    target_scope: "selected_branches",
    branch_ids: [branchId],
    delivery_channels: ["in_app"],
    status: "draft",
    publish_at: publishAt,
    created_by_hq_admin_id: hqAdminId,
  });
  const approved = await scheduledBroadcastService.approveBroadcast(pool, {
    broadcastId: draft.id,
    organizationId: orgId,
    hqAdminId,
    at: new Date(publishAt.getTime() - 7 * 24 * 60 * 60 * 1000),
  });
  assert.equal(approved.outcome, "scheduled");
  return draft.id;
}

test("Growth E2E flows 1–10: upgrade, schedules, downgrade, race, suspend, trial, retry, isolation", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;

  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);

  const identity = await pool.query(
    `SELECT environment_code FROM public.church_database_identity WHERE id = 1`
  );
  if (identity.rows[0]) {
    assert.equal(identity.rows[0].environment_code, "testing");
  }

  const createdOrgIds = [];
  t.after(async () => {
    for (const id of createdOrgIds) {
      await cleanupPilotOrganization(pool, id);
    }
  });

  // ─── Flow 1: Foundation → Growth upgrade + multi-branch ───
  const foundation = await createFoundationSmokeTenant(pool, {
    suffix: makeSuffix("g1"),
    name: "Growth E2E Foundation",
  });
  createdOrgIds.push(foundation.organization.id);

  await assertFoundationGrowthDenied(pool, foundation);

  const upgradePreview = await previewPackageAssignment(pool, foundation.organization.id, {
    package_code: "growth",
    reason: "Growth E2E controlled pilot upgrade",
    effective_at: new Date("2026-07-16T10:00:00.000Z"),
  });
  assert.equal(upgradePreview.direction, "upgrade");
  assert.equal(upgradePreview.canConfirm, true);

  const upgraded = await confirmPackageAssignment(
    pool,
    foundation.organization.id,
    {
      package_code: "growth",
      reason: "Growth E2E controlled pilot upgrade",
      effective_at: "2026-07-16T10:00:00.000Z",
      confirm_token: upgradePreview.confirmToken,
      used_tokens: new Set(),
    },
    null
  );
  assert.equal(upgraded.package.packageCode, "growth");

  const planAfterUpgrade = await getOrganisationPlan(pool, foundation.organization.id);
  assert.equal(planAfterUpgrade.packageCode, "growth");
  assert.equal(hasEntitlement(planAfterUpgrade, "broadcasts.scheduled"), true);
  assert.equal(hasEntitlement(planAfterUpgrade, "reports.scheduled"), true);
  assert.equal(hasEntitlement(planAfterUpgrade, "reports.cross_branch"), true);

  const second = await createBranchByHq(pool, foundation.organization.id, foundation.hqAdmin.id, {
    branch: {
      name: "East Campus",
      slug: `east-${foundation.suffix}`.slice(0, 30),
      location_text: "Lusaka East",
      service_times: "Sunday 09:00",
      country: "Zambia",
      city: "Lusaka",
    },
    branchAdmin: {
      full_name: "East Branch Admin",
      email: `east_${foundation.suffix}@example.com`,
      phone: "0977000888",
      temporary_password: "temppass12345",
    },
  });
  assert.ok(second.branch && second.branch.id);
  assert.equal(second.createdAsActive, true);

  const hqBranches = await branchesRepo.listBranchesForOrganization(pool, foundation.organization.id);
  assert.ok(hqBranches.filter((b) => b.status === "active").length >= 2);
  assert.ok(hqBranches.some((b) => Number(b.id) === Number(foundation.branch.id)));
  assert.ok(hqBranches.some((b) => Number(b.id) === Number(second.branch.id)));

  const eastAdmin = await branchAdminsRepo.findBranchAdminByEmailForBranch(
    pool,
    second.branch.id,
    `east_${foundation.suffix}@example.com`
  );
  assert.ok(eastAdmin);
  assert.equal(Number(eastAdmin.branch_id), Number(second.branch.id));
  assert.notEqual(Number(eastAdmin.branch_id), Number(foundation.branch.id));

  // Branch-scoped admin remains bound to their branch (not the East campus).
  assert.equal(Number(eastAdmin.branch_id), Number(second.branch.id));
  assert.equal(Number(foundation.branchAdmin.branch_id || foundation.branch.id), Number(foundation.branch.id));
  const mainApp = makeInjectedChurchApp({
    kind: "branch",
    organization: await organizationsRepo.findOrganizationById(pool, foundation.organization.id),
    branch: foundation.branch,
    hostSlug: foundation.branch.host_slug,
  });
  const mainBa = await loginBranchAdmin(mainApp, foundation, null);
  assert.ok(
    [200, 302, 303].includes(mainBa.login.status),
    `branch admin login status ${mainBa.login.status}`
  );

  // ─── Flow 2: Scheduled report create → due → idempotent ───
  const reportDueAt = new Date("2026-09-01T09:00:00.000Z");
  const schedule = await scheduledReportService.createSchedule(pool, {
    organizationId: foundation.organization.id,
    branchId: foundation.branch.id,
    actorType: "branch_admin",
    actorId: foundation.branchAdmin.id,
    body: {
      report_type: "branch_attendance_summary",
      export_format: "csv",
      frequency: "daily",
      timezone: "UTC",
      delivery_time_local: "09:00",
      recipients: [{ recipient_type: "branch_admin", recipient_id: foundation.branchAdmin.id }],
    },
  });
  assert.equal(schedule.status, "enabled");
  await pool.query(
    `UPDATE public.church_scheduled_reports SET next_run_at = $2 WHERE id = $1`,
    [schedule.id, reportDueAt.toISOString()]
  );

  const reportRun1 = await scheduledReportService.processDueScheduledReports(pool, {
    at: new Date(reportDueAt.getTime() + 60_000),
    limit: 50,
  });
  const reportHit = reportRun1.processed.find((p) => Number(p.scheduleId) === Number(schedule.id));
  assert.ok(reportHit, "due report should be processed");
  assert.ok(
    ["delivered", "completed", "partial"].includes(reportHit.outcome) ||
      reportHit.runId ||
      reportHit.outcome === "duplicate_job",
    `unexpected report outcome: ${reportHit.outcome}`
  );

  const runsAfterFirst = await pool.query(
    `SELECT id, status, job_key FROM public.church_scheduled_report_runs
     WHERE schedule_id = $1 AND organization_id = $2`,
    [schedule.id, foundation.organization.id]
  );
  assert.ok(runsAfterFirst.rows.length >= 1);

  const reportRun2 = await scheduledReportService.processDueScheduledReports(pool, {
    at: new Date(reportDueAt.getTime() + 120_000),
    limit: 50,
  });
  const reportHit2 = reportRun2.processed.find((p) => Number(p.scheduleId) === Number(schedule.id));
  if (reportHit2) {
    assert.ok(
      reportHit2.outcome === "duplicate_job" || reportHit2.outcome === "skipped_not_enabled",
      `re-run should be idempotent, got ${reportHit2.outcome}`
    );
  }
  const runsAfterSecond = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.church_scheduled_report_runs
     WHERE schedule_id = $1 AND organization_id = $2`,
    [schedule.id, foundation.organization.id]
  );
  assert.equal(runsAfterSecond.rows[0].c, runsAfterFirst.rows.length);

  // Pause/cancel report so later downgrade is not blocked by this schedule if still enabled
  await scheduledReportService.updateScheduleStatus(pool, {
    scheduleId: schedule.id,
    organizationId: foundation.organization.id,
    branchId: foundation.branch.id,
    status: "cancelled",
    actorType: "branch_admin",
    actorId: foundation.branchAdmin.id,
  });

  // ─── Flow 3: Scheduled broadcast create → due → no duplicate delivery ───
  const bcastPublishAt = new Date("2026-09-15T10:00:00.000Z");
  const broadcastId = await scheduleDueBroadcast(
    pool,
    foundation.organization.id,
    foundation.hqAdmin.id,
    foundation.branch.id,
    bcastPublishAt,
    "Growth E2E scheduled broadcast"
  );

  const bcastDue = await scheduledBroadcastService.processDueScheduledBroadcasts(pool, {
    at: new Date(bcastPublishAt.getTime() + 60_000),
  });
  const bcastHit = bcastDue.processed.find((p) => Number(p.broadcastId) === Number(broadcastId));
  assert.ok(bcastHit);
  assert.ok(["published", "partially_failed"].includes(bcastHit.outcome), bcastHit.outcome);

  const deliveries1 = await scheduledBroadcastService.listDeliveries(
    pool,
    broadcastId,
    foundation.organization.id
  );
  assert.ok(deliveries1.total >= 0);
  for (const d of deliveries1.rows || []) {
    assert.equal(Number(d.organization_id), Number(foundation.organization.id));
  }

  const bcastDup = await scheduledBroadcastService.processBroadcastDelivery(
    pool,
    broadcastId,
    foundation.organization.id,
    { at: new Date(bcastPublishAt.getTime() + 120_000) }
  );
  assert.equal(bcastDup.outcome, "duplicate_job");
  const deliveries2 = await scheduledBroadcastService.listDeliveries(
    pool,
    broadcastId,
    foundation.organization.id
  );
  assert.equal(deliveries2.total, deliveries1.total);

  // ─── Flow 4: Downgrade blocker with open Growth work ───
  const blockerPublishAt = new Date("2027-01-10T10:00:00.000Z");
  const blockingBroadcastId = await scheduleDueBroadcast(
    pool,
    foundation.organization.id,
    foundation.hqAdmin.id,
    foundation.branch.id,
    blockerPublishAt,
    "Open Growth work blocking downgrade"
  );

  const openReport = await scheduledReportService.createSchedule(pool, {
    organizationId: foundation.organization.id,
    branchId: foundation.branch.id,
    actorType: "branch_admin",
    actorId: foundation.branchAdmin.id,
    body: {
      report_type: "branch_attendance_summary",
      export_format: "csv",
      frequency: "weekly",
      day_of_week: 1,
      timezone: "UTC",
      delivery_time_local: "09:00",
      recipients: [{ recipient_type: "branch_admin", recipient_id: foundation.branchAdmin.id }],
    },
  });
  assert.equal(openReport.status, "enabled");

  const eligibilityBlocked = await evaluateFoundationDowngradeEligibility(
    pool,
    foundation.organization.id
  );
  assert.equal(eligibilityBlocked.allowed, false);
  assert.ok(eligibilityBlocked.blockerCounts);
  assert.ok(
    eligibilityBlocked.blockerCounts.scheduled_broadcasts > 0 ||
      eligibilityBlocked.blockerCounts.enabled_reports > 0
  );
  assert.ok(
    eligibilityBlocked.incompatibilities.some(
      (i) =>
        i.code === "growth_scheduled_broadcasts" || i.code === "growth_scheduled_reports"
    )
  );

  const downPreviewBlocked = await previewPackageAssignment(pool, foundation.organization.id, {
    package_code: "foundation",
    reason: "Blocked downgrade attempt",
    effective_at: new Date("2026-10-01T10:00:00.000Z"),
  });
  assert.equal(downPreviewBlocked.canConfirm, false);
  assert.ok(downPreviewBlocked.downgrade && downPreviewBlocked.downgrade.allowed === false);

  await assert.rejects(
    () =>
      confirmPackageAssignment(
        pool,
        foundation.organization.id,
        {
          package_code: "foundation",
          reason: "Blocked downgrade attempt",
          effective_at: downPreviewBlocked.effectiveAt,
          confirm_token: downPreviewBlocked.confirmToken,
        },
        null
      ),
    (err) =>
      err &&
      (err.code === "DOWNGRADE_BLOCKED" ||
        err.code === "INVALID_TOKEN" ||
        /block|confirm|token/i.test(String(err.message || "")))
  );

  // ─── Flow 6 (race) before resolving blockers: preview clean-ish then insert schedule ───
  // Cancel open work first for a clean preview, then race-insert before confirm.
  await scheduledBroadcastService.cancelScheduledBroadcast(
    pool,
    blockingBroadcastId,
    foundation.organization.id,
    foundation.hqAdmin.id
  );
  await scheduledReportService.updateScheduleStatus(pool, {
    scheduleId: openReport.id,
    organizationId: foundation.organization.id,
    branchId: foundation.branch.id,
    status: "cancelled",
    actorType: "branch_admin",
    actorId: foundation.branchAdmin.id,
  });

  // Foundation allows one active branch — deactivate the Growth second campus before downgrade paths.
  await deactivateBranchByHq(
    pool,
    second.branch.id,
    foundation.organization.id,
    foundation.hqAdmin.id,
    { reason: "Prepare Foundation downgrade" }
  );

  const racePreview = await previewPackageAssignment(pool, foundation.organization.id, {
    package_code: "foundation",
    reason: "Race recheck downgrade",
    effective_at: new Date("2026-10-02T10:00:00.000Z"),
  });
  assert.equal(racePreview.canConfirm, true);

  const raceBroadcastId = await scheduleDueBroadcast(
    pool,
    foundation.organization.id,
    foundation.hqAdmin.id,
    foundation.branch.id,
    new Date("2027-02-01T10:00:00.000Z"),
    "Inserted between preview and confirm"
  );

  await assert.rejects(
    () =>
      confirmPackageAssignment(
        pool,
        foundation.organization.id,
        {
          package_code: "foundation",
          reason: "Race recheck downgrade",
          effective_at: racePreview.effectiveAt,
          confirm_token: racePreview.confirmToken,
        },
        null
      ),
    (err) => err && err.code === "DOWNGRADE_BLOCKED"
  );

  // ─── Flow 5: Safe downgrade after resolving blockers ───
  await scheduledBroadcastService.cancelScheduledBroadcast(
    pool,
    raceBroadcastId,
    foundation.organization.id,
    foundation.hqAdmin.id
  );

  const safePreview = await previewPackageAssignment(pool, foundation.organization.id, {
    package_code: "foundation",
    reason: "Safe downgrade after cancel",
    effective_at: new Date("2026-10-03T10:00:00.000Z"),
  });
  assert.equal(safePreview.canConfirm, true);

  const downgraded = await confirmPackageAssignment(
    pool,
    foundation.organization.id,
    {
      package_code: "foundation",
      reason: "Safe downgrade after cancel",
      effective_at: safePreview.effectiveAt,
      confirm_token: safePreview.confirmToken,
      used_tokens: new Set(),
    },
    null
  );
  assert.equal(downgraded.organization.plan_code, "foundation");
  const planAfterDown = await getOrganisationPlan(pool, foundation.organization.id);
  assert.equal(planAfterDown.packageCode, "foundation");
  assert.equal(hasEntitlement(planAfterDown, "broadcasts.scheduled"), false);
  assert.equal(hasEntitlement(planAfterDown, "reports.scheduled"), false);

  await assertFoundationGrowthDenied(pool, foundation, { skipMultiBranchProbe: true });

  // Completed broadcast remains readable (published/cancelled history)
  const pastPublished = await hqBroadcastsRepo.findBroadcastByIdForOrganization(
    pool,
    broadcastId,
    foundation.organization.id
  );
  assert.ok(pastPublished);
  assert.ok(["published", "partially_failed", "failed", "cancelled"].includes(pastPublished.status));

  // Future Growth job must not execute after downgrade
  const stalePublishAt = new Date("2027-03-01T10:00:00.000Z");
  // Cannot approve new scheduled broadcast on Foundation — seed a scheduled row then run worker
  const staleDraft = await hqBroadcastsRepo.createBroadcastForOrganization(
    pool,
    foundation.organization.id,
    {
      title: "Should not deliver after downgrade",
      body: "Body",
      category: "General",
      audience: "members",
      target_scope: "selected_branches",
      branch_ids: [foundation.branch.id],
      delivery_channels: ["in_app"],
      status: "draft",
      publish_at: stalePublishAt,
      created_by_hq_admin_id: foundation.hqAdmin.id,
    }
  );
  await pool.query(
    `UPDATE public.church_hq_broadcasts SET status = 'scheduled' WHERE id = $1`,
    [staleDraft.id]
  );
  const afterDownDue = await scheduledBroadcastService.processDueScheduledBroadcasts(pool, {
    at: new Date(stalePublishAt.getTime() + 60_000),
  });
  const staleHit = afterDownDue.processed.find((p) => Number(p.broadcastId) === Number(staleDraft.id));
  assert.ok(staleHit);
  assert.equal(staleHit.outcome, "paused_no_entitlement");
  const staleDeliveries = await scheduledBroadcastService.listDeliveries(
    pool,
    staleDraft.id,
    foundation.organization.id
  );
  assert.equal(staleDeliveries.total, 0);

  // ─── Flow 7: Suspension with scheduled work ───
  const growthSuspend = await createGrowthSmokeTenant(pool, {
    suffix: makeSuffix("g7"),
    name: "Growth E2E Suspend",
  });
  createdOrgIds.push(growthSuspend.organization.id);

  const suspendReport = await scheduledReportService.createSchedule(pool, {
    organizationId: growthSuspend.organization.id,
    branchId: growthSuspend.branchA.id,
    actorType: "branch_admin",
    actorId: growthSuspend.branchAdmin.id,
    body: {
      report_type: "branch_attendance_summary",
      export_format: "csv",
      frequency: "daily",
      timezone: "UTC",
      delivery_time_local: "09:00",
      recipients: [{ recipient_type: "branch_admin", recipient_id: growthSuspend.branchAdmin.id }],
    },
  });
  const suspendReportDue = new Date("2026-11-01T09:00:00.000Z");
  await pool.query(
    `UPDATE public.church_scheduled_reports SET next_run_at = $2 WHERE id = $1`,
    [suspendReport.id, suspendReportDue.toISOString()]
  );

  const suspendBcastId = await scheduleDueBroadcast(
    pool,
    growthSuspend.organization.id,
    growthSuspend.hqAdmin.id,
    growthSuspend.branchA.id,
    new Date("2026-11-01T10:00:00.000Z"),
    "Suspend due broadcast"
  );

  await organizationsRepo.suspendOrganization(pool, growthSuspend.organization.id, {
    reason: "Growth E2E suspension with scheduled work",
    platformAdminId: null,
  });

  const suspendBcastDue = await scheduledBroadcastService.processDueScheduledBroadcasts(pool, {
    at: new Date("2026-11-01T10:05:00.000Z"),
  });
  const suspendBcastHit = suspendBcastDue.processed.find(
    (p) => Number(p.broadcastId) === Number(suspendBcastId)
  );
  assert.ok(suspendBcastHit);
  assert.equal(suspendBcastHit.outcome, "paused_organization_inactive");
  assert.equal(
    (await scheduledBroadcastService.listDeliveries(pool, suspendBcastId, growthSuspend.organization.id))
      .total,
    0
  );

  const suspendReportDueResult = await scheduledReportService.executeScheduleRun(
    pool,
    await scheduledReportService.findScheduleForBranch(
      pool,
      suspendReport.id,
      growthSuspend.organization.id,
      growthSuspend.branchA.id
    ),
    { at: new Date(suspendReportDue.getTime() + 60_000) }
  );
  assert.equal(suspendReportDueResult.outcome, "skipped_organization_inactive");
  const suspendReportRow = await scheduledReportService.findScheduleForBranch(
    pool,
    suspendReport.id,
    growthSuspend.organization.id,
    growthSuspend.branchA.id
  );
  assert.equal(suspendReportRow.status, "paused");
  assert.ok(suspendReportRow.pause_reason);

  await organizationsRepo.reactivateOrganization(pool, growthSuspend.organization.id, {
    reason: "Reactivate after suspend E2E",
    platformAdminId: null,
  });
  // Reactivation does not auto-send: broadcast remains paused; report remains paused
  const bcastAfterReactivate = await hqBroadcastsRepo.findBroadcastByIdForOrganization(
    pool,
    suspendBcastId,
    growthSuspend.organization.id
  );
  assert.equal(bcastAfterReactivate.status, "paused_organization_inactive");
  const reportAfterReactivate = await scheduledReportService.findScheduleForBranch(
    pool,
    suspendReport.id,
    growthSuspend.organization.id,
    growthSuspend.branchA.id
  );
  assert.equal(reportAfterReactivate.status, "paused");

  // ─── Flow 8: Active Growth trial blocks Foundation assignment ───
  const trialTenant = await createFoundationSmokeTenant(pool, {
    suffix: makeSuffix("g8"),
    name: "Growth E2E Trial",
  });
  createdOrgIds.push(trialTenant.organization.id);

  await grantGrowthTrial(pool, trialTenant.organization.id, {
    reason: "E2E trial conflict",
    durationDays: 30,
    startsAt: new Date(),
    grantedByPlatformAdminId: 1,
  });
  const trialPlan = await getOrganisationPlan(pool, trialTenant.organization.id);
  assert.equal(trialPlan.packageCode, "growth");

  await assert.rejects(
    () =>
      previewPackageAssignment(pool, trialTenant.organization.id, {
        package_code: "foundation",
        reason: "Should conflict with active trial",
      }),
    (err) => {
      assert.equal(err && err.code, "ACTIVE_GROWTH_TRIAL");
      assert.ok(err.trialEndsAt);
      return true;
    }
  );
  const orgAfterTrialReject = await organizationsRepo.findOrganizationById(
    pool,
    trialTenant.organization.id
  );
  assert.equal(orgAfterTrialReject.plan_code, "growth");
  const planAfterTrialReject = await getOrganisationPlan(pool, trialTenant.organization.id);
  assert.equal(planAfterTrialReject.packageCode, "growth");
  assert.equal(planAfterTrialReject.storedPlanCode, "growth");

  // ─── Flow 9: Retry protection after downgrade / suspend ───
  const retryTenant = await createGrowthSmokeTenant(pool, {
    suffix: makeSuffix("g9"),
    name: "Growth E2E Retry",
  });
  createdOrgIds.push(retryTenant.organization.id);

  const failBcast = await hqBroadcastsRepo.createBroadcastForOrganization(
    pool,
    retryTenant.organization.id,
    {
      title: "Retryable broadcast",
      body: "Body",
      category: "General",
      audience: "members",
      target_scope: "selected_branches",
      branch_ids: [retryTenant.branchA.id],
      delivery_channels: ["in_app", "email"],
      status: "draft",
      created_by_hq_admin_id: retryTenant.hqAdmin.id,
    }
  );
  await pool.query(
    `UPDATE public.church_hq_broadcasts SET status = 'partially_failed' WHERE id = $1`,
    [failBcast.id]
  );
  await pool.query(
    `INSERT INTO public.church_hq_broadcast_deliveries (
       organization_id, broadcast_id, channel, recipient_type, recipient_id,
       status, idempotency_key, error_message
     ) VALUES ($1,$2,'email','branch_admin',$3,'failed',$4,'simulated')
     ON CONFLICT DO NOTHING`,
    [
      retryTenant.organization.id,
      failBcast.id,
      retryTenant.branchAdmin.id,
      `e2e-retry:${failBcast.id}:${retryTenant.branchAdmin.id}`,
    ]
  );

  await organizationsRepo.updateOrganizationPlan(
    pool,
    retryTenant.organization.id,
    { plan_code: "foundation", plan_status: "active", plan_notes: "retry downgrade" },
    null
  );
  await assert.rejects(
    () =>
      scheduledBroadcastService.retryFailedDeliveries(
        pool,
        failBcast.id,
        retryTenant.organization.id
      ),
    (err) => err && err.code === "ENTITLEMENT_REQUIRED"
  );
  const delAfterEntitlementReject = await scheduledBroadcastService.listDeliveries(
    pool,
    failBcast.id,
    retryTenant.organization.id
  );
  const deliveredAfterReject = (delAfterEntitlementReject.rows || []).filter(
    (d) => d.status === "delivered"
  );
  assert.equal(deliveredAfterReject.length, 0);

  await organizationsRepo.updateOrganizationPlan(
    pool,
    retryTenant.organization.id,
    { plan_code: "growth", plan_status: "active", plan_notes: "restore for suspend retry" },
    null
  );
  await organizationsRepo.suspendOrganization(pool, retryTenant.organization.id, {
    reason: "Retry suspend E2E",
    platformAdminId: null,
  });
  await assert.rejects(
    () =>
      scheduledBroadcastService.retryFailedDeliveries(
        pool,
        failBcast.id,
        retryTenant.organization.id
      ),
    (err) => err && err.code === "ORG_INACTIVE"
  );

  // ─── Flow 10: Cross-branch isolation ───
  const iso = await createGrowthSmokeTenant(pool, {
    suffix: makeSuffix("g10"),
    name: "Growth E2E Isolation",
  });
  createdOrgIds.push(iso.organization.id);
  const foreign = await createGrowthSmokeTenant(pool, {
    suffix: makeSuffix("g10f"),
    name: "Growth E2E Foreign",
  });
  createdOrgIds.push(foreign.organization.id);

  await pool.query(
    `UPDATE public.church_hq_admins SET can_view_finance = true WHERE id = $1`,
    [iso.hqAdmin.id]
  );

  const comparison = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
    organizationId: iso.organization.id,
    canViewFinance: true,
    filters: {},
  });
  assert.ok(comparison);
  const branchIdsInReport = (comparison.rows || []).map((b) => Number(b.branch_id || b.id));
  if (branchIdsInReport.length) {
    assert.ok(branchIdsInReport.includes(Number(iso.branchA.id)));
    assert.ok(branchIdsInReport.includes(Number(iso.branchB.id)));
    assert.ok(!branchIdsInReport.includes(Number(foreign.branchA.id)));
  }

  // Branch admin cannot use HQ cross-branch surface (HTTP)
  const branchApp = makeInjectedChurchApp({
    kind: "branch",
    organization: iso.organization,
    branch: iso.branchA,
    hostSlug: iso.branchA.host_slug,
  });
  const baLogin = await loginBranchAdmin(branchApp, iso, null);
  const crossBranchAsBa = await baLogin.agent.get("/hq/cross-branch-reports");
  assert.ok(
    [302, 401, 403, 404].includes(crossBranchAsBa.status),
    `branch admin must not access cross-branch reports, got ${crossBranchAsBa.status}`
  );

  // Foreign org IDs inaccessible via HQ drill-down
  await assert.rejects(
    () =>
      crossBranchComparisonService.loadBranchDrillDown(pool, {
        organizationId: iso.organization.id,
        canViewFinance: true,
        branchId: foreign.branchA.id,
        filters: {},
      }),
    (err) =>
      err &&
      (err.code === "NOT_FOUND" ||
        err.code === "CROSS_TENANT" ||
        err.code === "FORBIDDEN" ||
        /not found|forbidden|organisation|organization/i.test(String(err.message || "")))
  );

  const foreignBroadcast = await hqBroadcastsRepo.findBroadcastByIdForOrganization(
    pool,
    failBcast.id,
    iso.organization.id
  );
  assert.equal(foreignBroadcast, null);
});
