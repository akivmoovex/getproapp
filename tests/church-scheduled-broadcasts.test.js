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
const hqBroadcastsRepo = require("../src/db/pg/church/hqBroadcastsRepo");
const {
  safeBroadcastEmailSubject,
} = require("../src/church/hqBroadcastValidation");
const scheduledBroadcastService = require("../src/services/church/scheduledBroadcastService");
const churchPackageUsageService = require("../src/services/church/churchPackageUsageService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("email subject excludes confidential title/body", () => {
  const subject = safeBroadcastEmailSubject("Grace Chapel", "Leadership");
  assert.equal(subject, "Grace Chapel: Leadership update");
  assert.doesNotMatch(subject, /secret|salary|discipline/i);
});

test(
  "Growth scheduled broadcast workflow: schedule, foundation, estimate, consent, quota, duplicate, cancel, partial, isolation",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("schedbcast");
    const passwordHash = await bcrypt.hash("bcast_pw_123456", 12);

    const orgG = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bg_${suffix}`.slice(0, 40),
      name: `Bcast Growth ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgG.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const orgF = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bf_${suffix}`.slice(0, 40),
      name: `Bcast Found ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgF.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const orgO = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bo_${suffix}`.slice(0, 40),
      name: `Bcast Other ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgO.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );

    const branchG = await branchesRepo.createBranch(pool, {
      organization_id: orgG.id,
      slug: `bg_${suffix}`.slice(0, 30),
      host_slug: `bg_${suffix}`.slice(0, 30),
      name: "Growth Campus",
      status: "active",
    });
    const branchF = await branchesRepo.createBranch(pool, {
      organization_id: orgF.id,
      slug: `bf_${suffix}`.slice(0, 30),
      host_slug: `bf_${suffix}`.slice(0, 30),
      name: "Foundation Campus",
      status: "active",
    });
    const branchO = await branchesRepo.createBranch(pool, {
      organization_id: orgO.id,
      slug: `bo_${suffix}`.slice(0, 30),
      host_slug: `bo_${suffix}`.slice(0, 30),
      name: "Other Campus",
      status: "active",
    });

    const hqG = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgG.id,
      full_name: "HQ Growth",
      email: `hqg_${suffix}@example.com`,
      phone: "0977222001",
      password_hash: passwordHash,
      status: "active",
    });
    const baG = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgG.id,
      branch_id: branchG.id,
      full_name: "Branch Admin G",
      email: `bag_${suffix}@example.com`,
      phone: "0977222002",
      password_hash: passwordHash,
      status: "active",
    });
    const baG2 = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgG.id,
      branch_id: branchG.id,
      full_name: "Branch Admin G2",
      email: `bag2_${suffix}@example.com`,
      phone: "0977222003",
      password_hash: passwordHash,
      status: "active",
    });
    const baO = await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgO.id,
      branch_id: branchO.id,
      full_name: "Other Admin",
      email: `bao_${suffix}@example.com`,
      phone: "0977222004",
      password_hash: passwordHash,
      status: "active",
    });
    const hqF = await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgF.id,
      full_name: "HQ Found",
      email: `hqf_${suffix}@example.com`,
      phone: "0977222005",
      password_hash: passwordHash,
      status: "active",
    });

    // Members for consent / audience
    await membersRepo.createPendingMember(pool, {
      organization_id: orgG.id,
      branch_id: branchG.id,
      platform_tenant_id: TENANT_ZM,
      full_name: "Member Yes",
      email: `my_${suffix}@example.com`,
      phone: "0977222010",
      password_hash: passwordHash,
      gender: "female",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "choir",
    });
    await membersRepo.createPendingMember(pool, {
      organization_id: orgG.id,
      branch_id: branchG.id,
      platform_tenant_id: TENANT_ZM,
      full_name: "Member No Consent",
      email: `mn_${suffix}@example.com`,
      phone: "0977222011",
      password_hash: passwordHash,
      gender: "male",
      age_group: "Adult (36-60)",
      address_area: "Lusaka",
      attendance_duration: "Less than 6 months",
      ministry_interest: "ushering",
    });
    const memberYes = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchG.id,
      `my_${suffix}@example.com`
    );
    const memberNo = await membersRepo.findMemberByEmailOrPhoneForBranch(
      pool,
      branchG.id,
      `mn_${suffix}@example.com`
    );
    await membersRepo.updateMemberStatusForBranch(pool, memberYes.id, branchG.id, "verified");
    await membersRepo.updateMemberStatusForBranch(pool, memberNo.id, branchG.id, "verified");
    await pool.query(
      `UPDATE public.church_members SET communication_consent = false WHERE id = $1`,
      [memberNo.id]
    );

    // --- Growth schedule ---
    const future = new Date("2026-08-01T10:00:00.000Z");
    const scheduledB = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
      title: "Confidential pastor review notes",
      body: "Do not put this in email subjects.",
      category: "Leadership",
      audience: "branch_admins",
      target_scope: "selected_branches",
      branch_ids: [branchG.id],
      delivery_channels: ["in_app", "email"],
      status: "draft",
      publish_at: future,
      created_by_hq_admin_id: hqG.id,
    });

    await scheduledBroadcastService.moveToPreview(pool, scheduledB.id, orgG.id);
    const estimated = await scheduledBroadcastService.computeAndStoreAudienceEstimate(
      pool,
      scheduledB.id,
      orgG.id
    );
    assert.equal(estimated.status, "audience_estimate");
    assert.ok(estimated.audience_estimate_json.estimated_recipients >= 2);

    await scheduledBroadcastService.submitForApproval(pool, scheduledB.id, orgG.id);
    const approved = await scheduledBroadcastService.approveBroadcast(pool, {
      broadcastId: scheduledB.id,
      organizationId: orgG.id,
      hqAdminId: hqG.id,
      at: new Date("2026-07-15T09:00:00.000Z"),
    });
    assert.equal(approved.outcome, "scheduled");
    const schedRow = await hqBroadcastsRepo.findBroadcastByIdForOrganization(
      pool,
      scheduledB.id,
      orgG.id
    );
    assert.equal(schedRow.status, "scheduled");
    assert.ok(schedRow.approved_at);
    assert.equal(Number(schedRow.approved_by_hq_admin_id), hqG.id);

    // Due job before publish_at → nothing
    const early = await scheduledBroadcastService.processDueScheduledBroadcasts(pool, {
      at: new Date("2026-07-31T12:00:00.000Z"),
    });
    assert.ok(!early.processed.some((p) => p.broadcastId === scheduledB.id));

    // --- Permission removed before send ---
    await pool.query(
      `UPDATE public.church_branch_admins SET status = 'inactive' WHERE id = $1`,
      [baG2.id]
    );

    const due = await scheduledBroadcastService.processDueScheduledBroadcasts(pool, {
      at: new Date("2026-08-01T10:01:00.000Z"),
    });
    const hit = due.processed.find((p) => p.broadcastId === scheduledB.id);
    assert.ok(hit);
    assert.ok(["published", "partially_failed"].includes(hit.outcome));
    assert.ok(hit.skipped >= 1); // inactive admin skipped
    assert.ok(hit.delivered >= 1);

    const deliveries = (await scheduledBroadcastService.listDeliveries(pool, scheduledB.id, orgG.id)).rows;
    assert.ok(deliveries.some((d) => d.status === "skipped_unauthorised"));
    assert.ok(deliveries.some((d) => d.channel === "email" && d.status === "delivered"));
    // Subject must not include confidential title
    const audit = await pool.query(
      `SELECT metadata_json FROM public.church_audit_logs
       WHERE organization_id = $1 AND entity_id = $2 AND action = 'hq_broadcast_delivery_completed'
       ORDER BY id DESC LIMIT 1`,
      [orgG.id, scheduledB.id]
    );
    assert.ok(audit.rows[0]);
    assert.match(String(audit.rows[0].metadata_json.email_subject), /Leadership update/);
    assert.doesNotMatch(String(audit.rows[0].metadata_json.email_subject), /Confidential pastor/i);

    // --- Duplicate job execution ---
    const dup = await scheduledBroadcastService.processBroadcastDelivery(pool, scheduledB.id, orgG.id, {
      at: new Date("2026-08-01T10:02:00.000Z"),
    });
    assert.equal(dup.outcome, "duplicate_job");
    const delAfterDup = (await scheduledBroadcastService.listDeliveries(pool, scheduledB.id, orgG.id)).rows;
    assert.equal(delAfterDup.length, deliveries.length);

    // --- Foundation restriction ---
    const foundationDraft = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgF.id, {
      title: "Foundation notice",
      body: "In-app only",
      category: "General",
      audience: "branch_admins",
      target_scope: "all_branches",
      delivery_channels: ["in_app", "email"],
      status: "draft",
      publish_at: new Date("2026-09-01T10:00:00.000Z"),
      created_by_hq_admin_id: hqF.id,
    });
    await assert.rejects(
      () =>
        scheduledBroadcastService.approveBroadcast(pool, {
          broadcastId: foundationDraft.id,
          organizationId: orgF.id,
          hqAdminId: hqF.id,
          at: new Date("2026-07-15T09:00:00.000Z"),
          forceSchedule: true,
        }),
      (err) => err && err.code === "FOUNDATION_SCHEDULE_FORBIDDEN"
    );

    // Immediate Foundation in-app still works
    const foundationNow = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgF.id, {
      title: "Immediate foundation",
      body: "Ok",
      category: "General",
      audience: "branch_admins",
      target_scope: "selected_branches",
      branch_ids: [branchF.id],
      delivery_channels: ["in_app"],
      status: "draft",
      publish_at: null,
      created_by_hq_admin_id: hqF.id,
    });
    await branchAdminsRepo.createBranchAdmin(pool, {
      organization_id: orgF.id,
      branch_id: branchF.id,
      full_name: "Found Admin",
      email: `baf_${suffix}@example.com`,
      phone: "0977222006",
      password_hash: passwordHash,
      status: "active",
    });
    const foundPub = await scheduledBroadcastService.approveBroadcast(pool, {
      broadcastId: foundationNow.id,
      organizationId: orgF.id,
      hqAdminId: hqF.id,
      at: new Date("2026-07-16T09:00:00.000Z"),
      forceSchedule: false,
    });
    assert.equal(foundPub.outcome, "published");

    // --- Consent exclusion ---
    const consentB = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
      title: "Consent check",
      body: "Hello",
      category: "General",
      audience: "selected_recipients",
      target_scope: "all_branches",
      selected_recipients: [
        { recipient_type: "member", recipient_id: memberYes.id },
        { recipient_type: "member", recipient_id: memberNo.id },
      ],
      delivery_channels: ["in_app", "email"],
      status: "draft",
      publish_at: null,
      created_by_hq_admin_id: hqG.id,
    });
    const consentRun = await scheduledBroadcastService.approveBroadcast(pool, {
      broadcastId: consentB.id,
      organizationId: orgG.id,
      hqAdminId: hqG.id,
      at: new Date("2026-07-16T10:00:00.000Z"),
      forceSchedule: false,
    });
    assert.ok(consentRun.skipped >= 1);
    const consentDel = (await scheduledBroadcastService.listDeliveries(pool, consentB.id, orgG.id)).rows;
    assert.ok(
      consentDel.some(
        (d) =>
          d.recipient_id === memberNo.id &&
          d.channel === "email" &&
          d.status === "skipped_consent"
      )
    );
    assert.ok(
      consentDel.some(
        (d) => d.recipient_id === memberYes.id && d.channel === "email" && d.status === "delivered"
      )
    );

    // --- Tenant isolation (cross-tenant recipient not authorised) ---
    const cross = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
      title: "Cross tenant attempt",
      body: "Nope",
      category: "General",
      audience: "selected_recipients",
      selected_recipients: [{ recipient_type: "branch_admin", recipient_id: baO.id }],
      delivery_channels: ["in_app", "email"],
      status: "draft",
      created_by_hq_admin_id: hqG.id,
    });
    const crossRun = await scheduledBroadcastService.approveBroadcast(pool, {
      broadcastId: cross.id,
      organizationId: orgG.id,
      hqAdminId: hqG.id,
      at: new Date("2026-07-16T11:00:00.000Z"),
      forceSchedule: false,
    });
    // Recipient resolves empty → published with zero deliveries or skipped
    const crossDel = (await scheduledBroadcastService.listDeliveries(pool, cross.id, orgG.id)).rows;
    assert.ok(
      crossDel.length === 0 ||
        crossDel.every((d) => d.status === "skipped_unauthorised") ||
        crossRun.delivered === 0
    );
    // Other org deliveries untouched
    const leak = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.church_hq_broadcast_deliveries
       WHERE organization_id = $1 AND broadcast_id = $2`,
      [orgO.id, cross.id]
    );
    assert.equal(leak.rows[0].c, 0);

    // --- Cancellation ---
    const toCancel = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
      title: "Cancel me",
      body: "Pending",
      category: "General",
      audience: "branch_admins",
      target_scope: "selected_branches",
      branch_ids: [branchG.id],
      delivery_channels: ["in_app", "email"],
      status: "draft",
      publish_at: new Date("2026-10-01T10:00:00.000Z"),
      created_by_hq_admin_id: hqG.id,
    });
    await scheduledBroadcastService.approveBroadcast(pool, {
      broadcastId: toCancel.id,
      organizationId: orgG.id,
      hqAdminId: hqG.id,
      at: new Date("2026-07-16T12:00:00.000Z"),
    });
    const cancelled = await scheduledBroadcastService.cancelScheduledBroadcast(
      pool,
      toCancel.id,
      orgG.id,
      hqG.id
    );
    assert.equal(cancelled.status, "cancelled");
    const afterCancel = await scheduledBroadcastService.processDueScheduledBroadcasts(pool, {
      at: new Date("2026-10-01T10:01:00.000Z"),
    });
    assert.ok(!afterCancel.processed.some((p) => p.broadcastId === toCancel.id));

    // --- Partial failure + retry (no duplicate of successful) ---
    const partial = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
      title: "Partial",
      body: "Body",
      category: "General",
      audience: "branch_admins",
      target_scope: "selected_branches",
      branch_ids: [branchG.id],
      delivery_channels: ["in_app", "email"],
      status: "draft",
      created_by_hq_admin_id: hqG.id,
    });
    // Reactivate baG2 for this audience
    await pool.query(
      `UPDATE public.church_branch_admins SET status = 'active' WHERE id = $1`,
      [baG2.id]
    );
    await scheduledBroadcastService.approveBroadcast(pool, {
      broadcastId: partial.id,
      organizationId: orgG.id,
      hqAdminId: hqG.id,
      at: new Date("2026-07-16T13:00:00.000Z"),
      forceSchedule: false,
    });
    const beforeFail = (await scheduledBroadcastService.listDeliveries(pool, partial.id, orgG.id)).rows;
    const emailDel = beforeFail.find((d) => d.channel === "email" && d.status === "delivered");
    assert.ok(emailDel);
    await pool.query(
      `UPDATE public.church_hq_broadcast_deliveries
       SET status = 'failed', error_message = 'simulated', delivered_at = NULL
       WHERE id = $1`,
      [emailDel.id]
    );
    await pool.query(
      `UPDATE public.church_hq_broadcasts SET status = 'partially_failed' WHERE id = $1`,
      [partial.id]
    );
    const deliveredCountBefore = beforeFail.filter((d) => d.status === "delivered").length;
    const retry = await scheduledBroadcastService.retryFailedDeliveries(pool, partial.id, orgG.id);
    assert.ok(["published", "partially_failed"].includes(retry.outcome));
    const afterRetry = (await scheduledBroadcastService.listDeliveries(pool, partial.id, orgG.id)).rows;
    // Successful in_app rows unchanged; failed email recovered without duplicating rows
    assert.equal(afterRetry.length, beforeFail.length);
    assert.ok(afterRetry.find((d) => d.id === emailDel.id && d.status === "delivered"));
    assert.ok(afterRetry.filter((d) => d.status === "delivered").length >= deliveredCountBefore);

    // --- Quota reached ---
    const quotaAt = new Date("2026-11-05T12:00:00.000Z");
    // Pump usage close to Growth monthly limit (5000 + 1000*branches = 6000 for 1 branch)
    const planSnap = await churchPackageUsageService.getOrganisationUsageSnapshot(pool, orgG.id, {
      at: quotaAt,
      reconcileStorage: false,
    });
    const limit = planSnap.meters.externalEmails.limit;
    const used = planSnap.externalEmailsThisMonth || 0;
    const remain = typeof limit === "number" ? Math.max(0, limit - used) : 0;
    if (remain > 0) {
      await churchPackageUsageService.recordExternalEmailSend(pool, {
        organizationId: orgG.id,
        category: "newsletter",
        count: remain,
        at: quotaAt,
      });
    }
    const quotaB = await hqBroadcastsRepo.createBroadcastForOrganization(pool, orgG.id, {
      title: "Quota",
      body: "Body",
      category: "General",
      audience: "selected_recipients",
      selected_recipients: [{ recipient_type: "member", recipient_id: memberYes.id }],
      delivery_channels: ["in_app", "email"],
      status: "draft",
      created_by_hq_admin_id: hqG.id,
    });
    const quotaRun = await scheduledBroadcastService.approveBroadcast(pool, {
      broadcastId: quotaB.id,
      organizationId: orgG.id,
      hqAdminId: hqG.id,
      at: quotaAt,
      forceSchedule: false,
    });
    const quotaDel = (await scheduledBroadcastService.listDeliveries(pool, quotaB.id, orgG.id)).rows;
    assert.ok(
      quotaDel.some((d) => d.channel === "email" && d.status === "skipped_quota") ||
        quotaRun.skipped >= 1
    );
    // in-app still delivered
    assert.ok(quotaDel.some((d) => d.channel === "in_app" && d.status === "delivered"));
  }
);
