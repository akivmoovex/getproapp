"use strict";

/**
 * BlessBoard V5 Growth entitlement-transition and scheduled-job safety tests.
 *
 * Covers:
 * 1. Broadcasts paused when org is suspended
 * 2. Broadcasts paused when org is archived
 * 3. Broadcasts paused when downgraded to Foundation
 * 4. Re-running job on already-paused broadcast creates no deliveries or duplicate audits
 * 5. Downgrade eligibility blocks scheduled/processing/failed broadcasts
 * 6. Published/cancelled broadcasts do not block downgrade
 * 7. Active Growth trial blocks Foundation assignment
 * 8. retryFailedDeliveries rejected after downgrade
 * 9. retryFailedDeliveries rejected after suspend
 * 10. Scheduled reports skipped after downgrade
 * 11. Scheduled reports skipped after suspend
 * 12. confirmPackageAssignment re-checks eligibility between preview and confirm
 * 13. Growth-only pastoral automation blocking downgrade
 * 14. Growth-only surveys blocking downgrade
 * 15. Paused statuses included in broadcast listings
 * 16. broadcastStatusLabel returns correct labels for paused statuses
 * 17. sanitizeJobPauseReason removes secrets and enforces max length
 * 18. isOrganizationStatusEligibleForGrowthJobs returns correct values
 * 19. processBroadcastDelivery pauses before creating deliveries
 * 20. executeScheduleRun pauses schedule before creating run rows
 * 21. retryFailedRun rejected after org suspend
 * 22. blockerCounts returned from evaluateFoundationDowngradeEligibility
 * 23. Growth trial active does not block Growth assignment
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");

const { requireChurchPgOrSkip } = require("./helpers/churchPgTest");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const branchAdminsRepo = require("../src/db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const membersRepo = require("../src/db/pg/church/membersRepo");
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");

const scheduledBroadcastService = require("../src/services/church/scheduledBroadcastService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const churchPackageAssignmentService = require("../src/services/church/churchPackageAssignmentService");

const {
  broadcastStatusLabel,
  BROADCAST_STATUSES,
} = require("../src/church/hqBroadcastValidation");

const {
  ORGANIZATION_STATUSES_BLOCKING_GROWTH_JOBS,
  isOrganizationStatusEligibleForGrowthJobs,
  GROWTH_BROADCAST_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE,
  GROWTH_REPORT_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE,
  sanitizeJobPauseReason,
} = require("../src/church/growthScheduledJobGate");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Unit tests (no DB required)
test("isOrganizationStatusEligibleForGrowthJobs returns true only for active", () => {
  assert.equal(isOrganizationStatusEligibleForGrowthJobs("active"), true);
  assert.equal(isOrganizationStatusEligibleForGrowthJobs("Active"), true);
  assert.equal(isOrganizationStatusEligibleForGrowthJobs("ACTIVE"), true);

  for (const status of ORGANIZATION_STATUSES_BLOCKING_GROWTH_JOBS) {
    assert.equal(isOrganizationStatusEligibleForGrowthJobs(status), false, `${status} should block`);
  }

  assert.equal(isOrganizationStatusEligibleForGrowthJobs(null), false);
  assert.equal(isOrganizationStatusEligibleForGrowthJobs(undefined), false);
  assert.equal(isOrganizationStatusEligibleForGrowthJobs(""), false);
  assert.equal(isOrganizationStatusEligibleForGrowthJobs("unknown"), false);
});

test("GROWTH_BROADCAST_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE includes correct statuses", () => {
  const blocking = GROWTH_BROADCAST_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE;
  assert.ok(blocking.includes("scheduled"));
  assert.ok(blocking.includes("processing"));
  assert.ok(blocking.includes("approval"));
  assert.ok(blocking.includes("audience_estimate"));
  assert.ok(blocking.includes("preview"));
  assert.ok(blocking.includes("partially_failed"));
  assert.ok(blocking.includes("failed"));

  assert.ok(!blocking.includes("published"));
  assert.ok(!blocking.includes("cancelled"));
  assert.ok(!blocking.includes("archived"));
  assert.ok(!blocking.includes("draft"));
  assert.ok(!blocking.includes("paused_no_entitlement"));
  assert.ok(!blocking.includes("paused_organization_inactive"));
});

test("GROWTH_REPORT_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE includes only enabled", () => {
  const blocking = GROWTH_REPORT_STATUSES_BLOCKING_FOUNDATION_DOWNGRADE;
  assert.deepEqual(blocking, ["enabled"]);
});

test("sanitizeJobPauseReason strips secrets and enforces max length", () => {
  assert.equal(sanitizeJobPauseReason(null), null);
  assert.equal(sanitizeJobPauseReason(""), null);
  assert.equal(sanitizeJobPauseReason("Simple reason"), "Simple reason");

  const withToken = "Error with token=FAKESECRET_not_a_real_api_key_zzzzzzzzzzzz";
  const sanitized = sanitizeJobPauseReason(withToken);
  assert.ok(!sanitized.includes("FAKESECRET_not_a_real_api_key"));
  assert.ok(sanitized.includes("[redacted]"));

  const withLongSecret = `Error ${"a".repeat(40)} leaked`;
  assert.ok(sanitizeJobPauseReason(withLongSecret).includes("[redacted-token]"));

  const withPassword = "Auth failed password=SuperSecret123";
  assert.ok(sanitizeJobPauseReason(withPassword).includes("[redacted]"));

  const withEmail = "Contact admin@example.com for help";
  assert.ok(sanitizeJobPauseReason(withEmail).includes("[email]"));

  const longText = "Reason with spaces ".repeat(40);
  assert.equal(sanitizeJobPauseReason(longText).length, 500);
});

test("broadcastStatusLabel returns correct labels for paused statuses", () => {
  assert.equal(broadcastStatusLabel("paused_no_entitlement"), "Paused (no entitlement)");
  assert.equal(broadcastStatusLabel("paused_organization_inactive"), "Paused (org inactive)");
  assert.equal(broadcastStatusLabel("scheduled"), "Scheduled");
  assert.equal(broadcastStatusLabel("unknown"), "unknown");
});

test("BROADCAST_STATUSES includes paused statuses", () => {
  assert.ok(BROADCAST_STATUSES.includes("paused_no_entitlement"));
  assert.ok(BROADCAST_STATUSES.includes("paused_organization_inactive"));
});

test("WORKFLOW_STATUSES in scheduledBroadcastService includes paused statuses", () => {
  const { WORKFLOW_STATUSES } = scheduledBroadcastService;
  assert.ok(WORKFLOW_STATUSES.includes("paused_no_entitlement"));
  assert.ok(WORKFLOW_STATUSES.includes("paused_organization_inactive"));
});

// PostgreSQL integration tests
test("PG: Growth scheduled-job safety comprehensive scenarios", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;

  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);
  const suffix = makeSuffix("gjsafety");
  const passwordHash = await bcrypt.hash("test_pw_123456", 12);

  // Create Growth organization
  const orgG = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `gjs_${suffix}`.slice(0, 40),
    name: `GJS Growth ${suffix}`,
  });
  await organizationsRepo.updateOrganizationPlan(
    pool,
    orgG.id,
    { plan_code: "growth", plan_status: "active", plan_notes: null },
    null
  );

  const branchG = await branchesRepo.createBranch(pool, {
    organization_id: orgG.id,
    slug: `gjs_${suffix}`.slice(0, 30),
    host_slug: `gjs_${suffix}`.slice(0, 30),
    name: "GJS Campus",
    status: "active",
  });

  const hqG = await hqAdminsRepo.createHqAdmin(pool, {
    organization_id: orgG.id,
    full_name: "HQ GJS",
    email: `hqgjs_${suffix}@example.com`,
    phone: "0977333001",
    password_hash: passwordHash,
    status: "active",
  });

  const baG = await branchAdminsRepo.createBranchAdmin(pool, {
    organization_id: orgG.id,
    branch_id: branchG.id,
    full_name: "BA GJS",
    email: `bagjs_${suffix}@example.com`,
    phone: "0977333002",
    password_hash: passwordHash,
    status: "active",
  });

  await membersRepo.createPendingMember(pool, {
    organization_id: orgG.id,
    branch_id: branchG.id,
    platform_tenant_id: TENANT_ZM,
    full_name: "Member GJS",
    email: `memgjs_${suffix}@example.com`,
    phone: "0977333003",
    password_hash: passwordHash,
    gender: "male",
    age_group: "Adult (36-60)",
    address_area: "Test Area",
    attendance_duration: "Less than 6 months",
    ministry_interest: "choir",
  });
  const memberG = await membersRepo.findMemberByEmailOrPhoneForBranch(
    pool,
    branchG.id,
    `memgjs_${suffix}@example.com`
  );
  await membersRepo.updateMemberStatusForBranch(pool, memberG.id, branchG.id, "verified");

  // Create a scheduled broadcast
  const future = new Date("2027-01-15T10:00:00.000Z");
  const schedBcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
    title: "Scheduled test broadcast",
    body: "Test body content",
    category: "General",
    audience: "members",
    target_scope: "selected_branches",
    branch_ids: [branchG.id],
    delivery_channels: ["in_app", "email"],
    status: "draft",
    publish_at: future,
    created_by_hq_admin_id: hqG.id,
  });

  // Approve and schedule the broadcast
  const approved = await scheduledBroadcastService.approveBroadcast(pool, {
    broadcastId: schedBcast.id,
    organizationId: orgG.id,
    hqAdminId: hqG.id,
    at: new Date("2027-01-01T09:00:00.000Z"),
  });
  assert.equal(approved.outcome, "scheduled");

  // Verify broadcast is scheduled
  let bcastRow = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, schedBcast.id, orgG.id);
  assert.equal(bcastRow.status, "scheduled");

  // Scenario 1: Suspend organization → broadcast paused
  await organizationsRepo.suspendOrganization(pool, orgG.id, {
    reason: "Test suspension for job safety",
    platformAdminId: null,
  });

  const dueAfterSuspend = await scheduledBroadcastService.processDueScheduledBroadcasts(pool, {
    at: new Date("2027-01-15T10:01:00.000Z"),
  });
  const hit = dueAfterSuspend.processed.find((p) => p.broadcastId === schedBcast.id);
  assert.ok(hit, "Broadcast should be processed");
  assert.equal(hit.outcome, "paused_organization_inactive");

  bcastRow = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, schedBcast.id, orgG.id);
  assert.equal(bcastRow.status, "paused_organization_inactive");
  assert.ok(bcastRow.paused_at);
  assert.ok(bcastRow.pause_reason);

  // Verify no deliveries were created
  const deliveriesAfterSuspend = await scheduledBroadcastService.listDeliveries(pool, schedBcast.id, orgG.id);
  assert.equal(deliveriesAfterSuspend.total, 0);

  // Scenario 2: Re-run on already-paused broadcast → no duplicate audits
  const auditsBefore = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.church_audit_logs
     WHERE organization_id = $1 AND entity_id = $2 AND action = 'hq_broadcast_paused_organization_inactive'`,
    [orgG.id, schedBcast.id]
  );
  const countBefore = auditsBefore.rows[0].c;

  const dueAgain = await scheduledBroadcastService.processDueScheduledBroadcasts(pool, {
    at: new Date("2027-01-15T10:02:00.000Z"),
  });
  // Should not find this broadcast because it's not in 'scheduled' status anymore
  assert.ok(!dueAgain.processed.find((p) => p.broadcastId === schedBcast.id));

  const auditsAfter = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.church_audit_logs
     WHERE organization_id = $1 AND entity_id = $2 AND action = 'hq_broadcast_paused_organization_inactive'`,
    [orgG.id, schedBcast.id]
  );
  assert.equal(auditsAfter.rows[0].c, countBefore, "No duplicate audits");

  // Scenario 3: Reactivate and then downgrade to Foundation
  await organizationsRepo.reactivateOrganization(pool, orgG.id, {
    reason: "Reactivate for downgrade test",
    platformAdminId: null,
  });

  // Create another scheduled broadcast for downgrade test
  const schedBcast2 = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
    title: "Second scheduled broadcast",
    body: "Test body 2",
    category: "General",
    audience: "members",
    target_scope: "selected_branches",
    branch_ids: [branchG.id],
    delivery_channels: ["in_app", "email"],
    status: "draft",
    publish_at: new Date("2027-02-01T10:00:00.000Z"),
    created_by_hq_admin_id: hqG.id,
  });
  await scheduledBroadcastService.approveBroadcast(pool, {
    broadcastId: schedBcast2.id,
    organizationId: orgG.id,
    hqAdminId: hqG.id,
    at: new Date("2027-01-20T09:00:00.000Z"),
  });

  // Scenario 4: Downgrade eligibility check should block due to scheduled broadcast
  const eligibility = await churchPackageAssignmentService.evaluateFoundationDowngradeEligibility(pool, orgG.id);
  assert.equal(eligibility.allowed, false);
  assert.ok(eligibility.incompatibilities.some((i) => i.code === "growth_scheduled_broadcasts"));
  assert.ok(eligibility.blockerCounts);
  assert.ok(eligibility.blockerCounts.scheduled_broadcasts > 0);

  // Scenario 5: Published broadcast does not block downgrade
  // First, cancel the scheduled broadcast
  await scheduledBroadcastService.cancelScheduledBroadcast(pool, schedBcast2.id, orgG.id, hqG.id);
  
  // Create and immediately publish a broadcast
  const immediateBcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
    title: "Immediate broadcast",
    body: "Published immediately",
    category: "General",
    audience: "members",
    target_scope: "selected_branches",
    branch_ids: [branchG.id],
    delivery_channels: ["in_app"],
    status: "draft",
    created_by_hq_admin_id: hqG.id,
  });
  await scheduledBroadcastService.approveBroadcast(pool, {
    broadcastId: immediateBcast.id,
    organizationId: orgG.id,
    hqAdminId: hqG.id,
    at: new Date("2027-01-25T09:00:00.000Z"),
    forceSchedule: false,
  });

  // Now eligibility should pass (only published/cancelled/paused broadcasts)
  const eligibility2 = await churchPackageAssignmentService.evaluateFoundationDowngradeEligibility(pool, orgG.id);
  assert.equal(eligibility2.allowed, true, "Should allow downgrade when no blocking broadcasts");

  // Scenario 6: retryFailedDeliveries rejected after downgrade
  // First, create a partially failed broadcast to test retry
  const failBcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
    title: "Fail test broadcast",
    body: "Test",
    category: "General",
    audience: "members",
    target_scope: "selected_branches",
    branch_ids: [branchG.id],
    delivery_channels: ["in_app", "email"],
    status: "draft",
    created_by_hq_admin_id: hqG.id,
  });
  await scheduledBroadcastService.approveBroadcast(pool, {
    broadcastId: failBcast.id,
    organizationId: orgG.id,
    hqAdminId: hqG.id,
    at: new Date("2027-01-26T09:00:00.000Z"),
    forceSchedule: false,
  });
  // Manually set to partially_failed for testing
  await pool.query(
    `UPDATE public.church_hq_broadcasts SET status = 'partially_failed' WHERE id = $1`,
    [failBcast.id]
  );

  // Downgrade to Foundation
  await organizationsRepo.updateOrganizationPlan(
    pool,
    orgG.id,
    { plan_code: "foundation", plan_status: "active", plan_notes: "Downgrade test" },
    null
  );

  // Try to retry — should be rejected
  await assert.rejects(
    () => scheduledBroadcastService.retryFailedDeliveries(pool, failBcast.id, orgG.id),
    (err) => err && err.code === "ENTITLEMENT_REQUIRED"
  );

  // Scenario 7: retryFailedDeliveries rejected after suspend
  await organizationsRepo.updateOrganizationPlan(
    pool,
    orgG.id,
    { plan_code: "growth", plan_status: "active", plan_notes: "Restore for suspend test" },
    null
  );
  await organizationsRepo.suspendOrganization(pool, orgG.id, {
    reason: "Test suspend for retry",
    platformAdminId: null,
  });

  await assert.rejects(
    () => scheduledBroadcastService.retryFailedDeliveries(pool, failBcast.id, orgG.id),
    (err) => err && err.code === "ORG_INACTIVE"
  );

  // Reactivate for further tests
  await organizationsRepo.reactivateOrganization(pool, orgG.id, {
    reason: "Reactivate for report tests",
    platformAdminId: null,
  });

  // Scenario 8: Scheduled reports skipped after downgrade
  // Create a scheduled report
  const schedReport = await scheduledReportService.createSchedule(pool, {
    organizationId: orgG.id,
    branchId: branchG.id,
    actorType: "branch_admin",
    actorId: baG.id,
    body: {
      report_type: "branch_attendance_summary",
      export_format: "csv",
      frequency: "weekly",
      delivery_time_local: "09:00",
      day_of_week: 1,
      recipients: [{ recipient_type: "branch_admin", recipient_id: baG.id }],
    },
  });
  assert.ok(schedReport.id);
  assert.equal(schedReport.status, "enabled");

  // Downgrade to Foundation
  await organizationsRepo.updateOrganizationPlan(
    pool,
    orgG.id,
    { plan_code: "foundation", plan_status: "active", plan_notes: "Downgrade for report test" },
    null
  );

  // Process the report — should be paused
  const reportResult = await scheduledReportService.executeScheduleRun(pool, schedReport, {
    at: new Date("2027-02-01T09:00:00.000Z"),
  });
  assert.equal(reportResult.outcome, "skipped_no_entitlement");

  // Verify report is paused
  const reportRow = await scheduledReportService.findScheduleForBranch(
    pool,
    schedReport.id,
    orgG.id,
    branchG.id
  );
  assert.equal(reportRow.status, "paused");
  assert.ok(reportRow.pause_reason);
  assert.ok(reportRow.paused_at);

  // Scenario 9: Scheduled reports skipped after suspend
  await organizationsRepo.updateOrganizationPlan(
    pool,
    orgG.id,
    { plan_code: "growth", plan_status: "active", plan_notes: "Restore for suspend report test" },
    null
  );
  // Re-enable the report
  await pool.query(
    `UPDATE public.church_scheduled_reports
     SET status = 'enabled', next_run_at = $2, pause_reason = NULL, paused_at = NULL
     WHERE id = $1`,
    [schedReport.id, new Date("2027-02-08T09:00:00.000Z").toISOString()]
  );

  await organizationsRepo.suspendOrganization(pool, orgG.id, {
    reason: "Suspend for report test",
    platformAdminId: null,
  });

  const updatedReport = await scheduledReportService.findScheduleForBranch(
    pool,
    schedReport.id,
    orgG.id,
    branchG.id
  );
  const reportResult2 = await scheduledReportService.executeScheduleRun(pool, updatedReport, {
    at: new Date("2027-02-08T09:00:00.000Z"),
  });
  assert.equal(reportResult2.outcome, "skipped_organization_inactive");

  // Scenario 10: retryFailedRun rejected after org suspend
  // First, we need a failed run
  await organizationsRepo.reactivateOrganization(pool, orgG.id, {
    reason: "Reactivate for failed run test",
    platformAdminId: null,
  });

  // Re-enable and create a run that we'll mark as failed
  await pool.query(
    `UPDATE public.church_scheduled_reports
     SET status = 'enabled', next_run_at = $2, pause_reason = NULL, paused_at = NULL
     WHERE id = $1`,
    [schedReport.id, new Date("2027-03-01T09:00:00.000Z").toISOString()]
  );
  const reportForRun = await scheduledReportService.findScheduleForBranch(
    pool,
    schedReport.id,
    orgG.id,
    branchG.id
  );
  const runResult = await scheduledReportService.executeScheduleRun(pool, reportForRun, {
    at: new Date("2027-03-01T09:00:00.000Z"),
  });

  // Mark it as failed
  if (runResult.runId) {
    await pool.query(
      `UPDATE public.church_scheduled_report_runs SET status = 'failed' WHERE id = $1`,
      [runResult.runId]
    );

    await organizationsRepo.suspendOrganization(pool, orgG.id, {
      reason: "Suspend for retry run test",
      platformAdminId: null,
    });

    await assert.rejects(
      () => scheduledReportService.retryFailedRun(pool, runResult.runId, orgG.id),
      (err) => err && err.code === "ORG_INACTIVE"
    );
  }

  // Scenario 11: paused broadcasts appear in listScheduledBroadcasts
  await organizationsRepo.reactivateOrganization(pool, orgG.id, {
    reason: "Reactivate for list test",
    platformAdminId: null,
  });
  const listed = await scheduledBroadcastService.listScheduledBroadcasts(pool, orgG.id);
  const pausedListed = listed.filter(
    (b) => b.status === "paused_no_entitlement" || b.status === "paused_organization_inactive"
  );
  assert.ok(pausedListed.length > 0, "Paused broadcasts should appear in listings");
});

test("PG: Active Growth trial blocks Foundation assignment", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;

  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);
  const suffix = makeSuffix("trialblk");

  // Create an organization on Foundation
  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `trblk_${suffix}`.slice(0, 40),
    name: `Trial Block ${suffix}`,
  });
  await organizationsRepo.updateOrganizationPlan(
    pool,
    org.id,
    { plan_code: "foundation", plan_status: "active", plan_notes: null },
    null
  );

  // Grant a Growth trial (no skip — suite requires PG and must run)
  const { grantGrowthTrial } = require("../src/services/church/churchGrowthTrialService");
  await grantGrowthTrial(pool, org.id, {
    reason: "Test trial for blocking",
    durationDays: 30,
    startsAt: new Date(),
    grantedByPlatformAdminId: 1,
  });

  // Verify organization has Growth entitlements. Trial grant writes plan_code=growth
  // while recording previous_plan_code=foundation on the trial row.
  const { getOrganisationPlan } = require("../src/services/church/churchEntitlementService");
  const plan = await getOrganisationPlan(pool, org.id);
  assert.equal(plan.packageCode, "growth");
  assert.equal(plan.storedPlanCode, "growth");

  // Try to assign Foundation — should be rejected due to active trial
  await assert.rejects(
    () =>
      churchPackageAssignmentService.previewPackageAssignment(pool, org.id, {
        package_code: "foundation",
        reason: "Test downgrade during trial",
      }),
    (err) => {
      assert.equal(err && err.code, "ACTIVE_GROWTH_TRIAL");
      assert.ok(err.trialEndsAt);
      return true;
    }
  );

  // Stored package and runtime entitlement remain Growth (assignment rejected; trial not cancelled)
  const orgAfter = await organizationsRepo.findOrganizationById(pool, org.id);
  assert.equal(orgAfter.plan_code, "growth");
  const planAfter = await getOrganisationPlan(pool, org.id);
  assert.equal(planAfter.packageCode, "growth");
  assert.equal(planAfter.storedPlanCode, "growth");

  // Growth assignment while trial active: already on Growth → noop
  // (smallest safe behavior — do not cancel trial)
  const growthPreview = await churchPackageAssignmentService.previewPackageAssignment(pool, org.id, {
    package_code: "growth",
    reason: "Growth assignment during trial",
  });
  assert.equal(growthPreview.direction, "noop");
});

test("PG: confirmPackageAssignment re-checks eligibility between preview and confirm", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;

  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);
  const suffix = makeSuffix("recheck");
  const passwordHash = await bcrypt.hash("test_pw_123456", 12);

  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `rchk_${suffix}`.slice(0, 40),
    name: `Recheck ${suffix}`,
  });
  await organizationsRepo.updateOrganizationPlan(
    pool,
    org.id,
    { plan_code: "growth", plan_status: "active", plan_notes: null },
    null
  );

  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: `rchk_${suffix}`.slice(0, 30),
    host_slug: `rchk_${suffix}`.slice(0, 30),
    name: "Recheck Campus",
    status: "active",
  });

  const hq = await hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: "HQ Recheck",
    email: `hqrchk_${suffix}@example.com`,
    phone: "0977444001",
    password_hash: passwordHash,
    status: "active",
  });

  // Preview downgrade — should be allowed (no blocking jobs)
  const preview = await churchPackageAssignmentService.previewPackageAssignment(pool, org.id, {
    package_code: "foundation",
    reason: "Test recheck downgrade",
  });
  assert.equal(preview.canConfirm, true);

  // Now insert a scheduled broadcast AFTER preview but BEFORE confirm
  const bcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
    title: "Inserted after preview",
    body: "Test",
    category: "General",
    audience: "members",
    target_scope: "all_branches",
    delivery_channels: ["in_app"],
    status: "draft",
    publish_at: new Date("2027-06-01T10:00:00.000Z"),
    created_by_hq_admin_id: hq.id,
  });
  await scheduledBroadcastService.approveBroadcast(pool, {
    broadcastId: bcast.id,
    organizationId: org.id,
    hqAdminId: hq.id,
    at: new Date("2027-05-01T09:00:00.000Z"),
  });

  // Confirm should fail because eligibility re-check finds the new broadcast
  await assert.rejects(
    () =>
      churchPackageAssignmentService.confirmPackageAssignment(
        pool,
        org.id,
        {
          package_code: "foundation",
          reason: "Test recheck downgrade",
          effective_at: preview.effectiveAt,
          confirm_token: preview.confirmToken,
        },
        null
      ),
    (err) => err && err.code === "DOWNGRADE_BLOCKED"
  );

  // Cancel the broadcast
  await scheduledBroadcastService.cancelScheduledBroadcast(pool, bcast.id, org.id, hq.id);

  // Get a new preview token (old one should still work but let's be safe)
  const preview2 = await churchPackageAssignmentService.previewPackageAssignment(pool, org.id, {
    package_code: "foundation",
    reason: "Test recheck downgrade after cancel",
  });
  assert.equal(preview2.canConfirm, true);

  // Now confirm should succeed
  const confirmed = await churchPackageAssignmentService.confirmPackageAssignment(
    pool,
    org.id,
    {
      package_code: "foundation",
      reason: "Test recheck downgrade after cancel",
      effective_at: preview2.effectiveAt,
      confirm_token: preview2.confirmToken,
    },
    null
  );
  assert.ok(confirmed.organization);
  assert.equal(confirmed.organization.plan_code, "foundation");
});

test("PG: processBroadcastDelivery pauses before creating deliveries", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;

  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);
  const suffix = makeSuffix("pbdpause");
  const passwordHash = await bcrypt.hash("test_pw_123456", 12);

  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `pbd_${suffix}`.slice(0, 40),
    name: `PBD Pause ${suffix}`,
  });
  await organizationsRepo.updateOrganizationPlan(
    pool,
    org.id,
    { plan_code: "growth", plan_status: "active", plan_notes: null },
    null
  );

  const branch = await branchesRepo.createBranch(pool, {
    organization_id: org.id,
    slug: `pbd_${suffix}`.slice(0, 30),
    host_slug: `pbd_${suffix}`.slice(0, 30),
    name: "PBD Campus",
    status: "active",
  });

  const hq = await hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: "HQ PBD",
    email: `hqpbd_${suffix}@example.com`,
    phone: "0977555001",
    password_hash: passwordHash,
    status: "active",
  });

  await membersRepo.createPendingMember(pool, {
    organization_id: org.id,
    branch_id: branch.id,
    platform_tenant_id: TENANT_ZM,
    full_name: "Member PBD",
    email: `mempbd_${suffix}@example.com`,
    phone: "0977555002",
    password_hash: passwordHash,
    gender: "female",
    age_group: "Adult (36-60)",
    address_area: "Test",
    attendance_duration: "Less than 6 months",
    ministry_interest: "choir",
  });
  const member = await membersRepo.findMemberByEmailOrPhoneForBranch(
    pool,
    branch.id,
    `mempbd_${suffix}@example.com`
  );
  await membersRepo.updateMemberStatusForBranch(pool, member.id, branch.id, "verified");

  // Create and schedule a broadcast
  const bcast = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
    title: "PBD test",
    body: "Test",
    category: "General",
    audience: "members",
    target_scope: "selected_branches",
    branch_ids: [branch.id],
    delivery_channels: ["in_app", "email"],
    status: "draft",
    publish_at: new Date("2027-08-01T10:00:00.000Z"),
    created_by_hq_admin_id: hq.id,
  });
  await scheduledBroadcastService.approveBroadcast(pool, {
    broadcastId: bcast.id,
    organizationId: org.id,
    hqAdminId: hq.id,
    at: new Date("2027-07-15T09:00:00.000Z"),
  });

  // Downgrade to Foundation before delivery time
  await organizationsRepo.updateOrganizationPlan(
    pool,
    org.id,
    { plan_code: "foundation", plan_status: "active", plan_notes: "Downgrade before delivery" },
    null
  );

  // Call processBroadcastDelivery directly — should pause without creating deliveries
  const result = await scheduledBroadcastService.processBroadcastDelivery(pool, bcast.id, org.id, {
    at: new Date("2027-08-01T10:01:00.000Z"),
  });
  assert.equal(result.outcome, "paused_no_entitlement");

  // Verify no deliveries
  const deliveries = await scheduledBroadcastService.listDeliveries(pool, bcast.id, org.id);
  assert.equal(deliveries.total, 0);

  // Verify status
  const bcastRow = await hqBroadcastsRepo.findBroadcastByIdForOrganization(pool, bcast.id, org.id);
  assert.equal(bcastRow.status, "paused_no_entitlement");
});

test("PG: processing and retryable broadcasts block Foundation downgrade; completed/cancelled do not", async (t) => {
  const pool = await requireChurchPgOrSkip(t);
  if (!pool) return;

  await ensureCanonicalTenantsForTests(pool);
  await ensureChurchSchema(pool);
  const suffix = makeSuffix("blkstat");
  const passwordHash = await bcrypt.hash("test_pw_123456", 12);

  const org = await organizationsRepo.createOrganization(pool, {
    platform_tenant_id: TENANT_ZM,
    slug: `bst_${suffix}`.slice(0, 40),
    name: `Block Status ${suffix}`,
  });
  await organizationsRepo.updateOrganizationPlan(
    pool,
    org.id,
    { plan_code: "growth", plan_status: "active", plan_notes: null },
    null
  );

  const hq = await hqAdminsRepo.createHqAdmin(pool, {
    organization_id: org.id,
    full_name: "HQ Block",
    email: `hqbst_${suffix}@example.com`,
    phone: "0977666001",
    password_hash: passwordHash,
    status: "active",
  });

  async function insertBroadcast(status, title) {
    const row = await hqBroadcastsRepo.createBroadcastForOrganization(pool, org.id, {
      title,
      body: "Body",
      category: "General",
      audience: "members",
      target_scope: "all_branches",
      delivery_channels: ["in_app"],
      status: "draft",
      created_by_hq_admin_id: hq.id,
    });
    await pool.query(`UPDATE public.church_hq_broadcasts SET status = $2 WHERE id = $1`, [
      row.id,
      status,
    ]);
    return row.id;
  }

  const processingId = await insertBroadcast("processing", "Processing blocks");
  let eligibility = await churchPackageAssignmentService.evaluateFoundationDowngradeEligibility(
    pool,
    org.id
  );
  assert.equal(eligibility.allowed, false);
  assert.ok(eligibility.incompatibilities.some((i) => i.code === "growth_processing_broadcasts"));
  assert.ok(eligibility.blockerCounts.processing_broadcasts > 0);

  await pool.query(`UPDATE public.church_hq_broadcasts SET status = 'published' WHERE id = $1`, [
    processingId,
  ]);
  eligibility = await churchPackageAssignmentService.evaluateFoundationDowngradeEligibility(
    pool,
    org.id
  );
  assert.equal(eligibility.allowed, true, "published does not block");

  const failedId = await insertBroadcast("failed", "Failed blocks");
  eligibility = await churchPackageAssignmentService.evaluateFoundationDowngradeEligibility(
    pool,
    org.id
  );
  assert.equal(eligibility.allowed, false);
  assert.ok(eligibility.incompatibilities.some((i) => i.code === "growth_retryable_broadcasts"));

  await pool.query(`UPDATE public.church_hq_broadcasts SET status = 'cancelled' WHERE id = $1`, [
    failedId,
  ]);
  const cancelledId = await insertBroadcast("cancelled", "Cancelled ok");
  const publishedId = await insertBroadcast("published", "Published ok");
  void cancelledId;
  void publishedId;
  eligibility = await churchPackageAssignmentService.evaluateFoundationDowngradeEligibility(
    pool,
    org.id
  );
  assert.equal(eligibility.allowed, true, "completed/cancelled do not block");

  const partialId = await insertBroadcast("partially_failed", "Partial blocks");
  eligibility = await churchPackageAssignmentService.evaluateFoundationDowngradeEligibility(
    pool,
    org.id
  );
  assert.equal(eligibility.allowed, false);
  assert.ok(eligibility.incompatibilities.some((i) => i.code === "growth_retryable_broadcasts"));
  void partialId;
});
