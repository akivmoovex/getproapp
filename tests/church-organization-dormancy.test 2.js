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
const websiteContentRepo = require("../src/db/pg/church/websiteContentRepo");
const hqAdminsRepo = require("../src/db/pg/church/hqAdminsRepo");
const {
  classifyInactivity,
  calculateOrganisationActivity,
  FIRST_WARNING_MONTHS,
  FINAL_WARNING_MONTHS,
  DORMANT_MONTHS,
  DATA_PRESERVE_DAYS,
} = require("../src/services/church/churchInactivityActivityService");
const dormancyService = require("../src/services/church/churchDormancyService");
const { grantGrowthTrial } = require("../src/services/church/churchGrowthTrialService");
const {
  assertCanSuspendOrganization,
  assertCanReactivateFromDormancy,
  assertCanReactivateOrganization,
} = require("../src/church/platformStatusValidation");
const { isAdminAccessibleOrgStatus, isOperationalStatus } = require("../src/church/churchStatusAccess");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function monthsAgo(months, from = new Date("2026-07-16T12:00:00.000Z")) {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() - Math.round(months * 30.436875));
  return d;
}

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

test("inactivity classification thresholds (10 / 11 / 12 months)", () => {
  const at = new Date("2026-07-16T12:00:00.000Z");
  const make = (months) => ({
    certain: true,
    lastActivityAt: monthsAgo(months, at),
  });

  const active = classifyInactivity(make(9), at);
  assert.equal(active.eligibleForFirstWarning, false);
  assert.equal(active.eligibleForFinalWarning, false);
  assert.equal(active.eligibleForDormant, false);

  const first = classifyInactivity(make(10.5), at);
  assert.equal(first.eligibleForFirstWarning, true);
  assert.equal(first.eligibleForFinalWarning, false);

  const final = classifyInactivity(make(11.5), at);
  assert.equal(final.eligibleForFinalWarning, true);
  assert.equal(final.eligibleForDormant, false);

  const dormant = classifyInactivity(make(12.2), at);
  assert.equal(dormant.eligibleForDormant, true);

  assert.equal(FIRST_WARNING_MONTHS, 10);
  assert.equal(FINAL_WARNING_MONTHS, 11);
  assert.equal(DORMANT_MONTHS, 12);
  assert.equal(DATA_PRESERVE_DAYS, 90);
});

test("uncertain activity is never dormant-eligible", () => {
  const c = classifyInactivity({ certain: false, reason: "calculation_error" }, new Date());
  assert.equal(c.certain, false);
  assert.equal(c.eligibleForDormant, undefined);
});

test("dormancy and suspension remain distinct in access helpers", () => {
  assert.equal(isOperationalStatus("dormant"), false);
  assert.equal(isAdminAccessibleOrgStatus("dormant"), true);
  assert.equal(isAdminAccessibleOrgStatus("suspended"), false);
  assert.equal(assertCanSuspendOrganization({ status: "dormant" }).ok, false);
  assert.equal(assertCanReactivateOrganization({ status: "dormant" }).ok, false);
  assert.equal(assertCanReactivateFromDormancy({ status: "dormant" }).ok, true);
});

test(
  "Foundation inactivity warnings, dormancy, Growth exclusion, reactivation, idempotency, site + data",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("dorm");
    const at = new Date("2026-07-16T12:00:00.000Z");
    const adminHash = await bcrypt.hash("dormadmin123456", 12);

    async function makeOrg(slugPrefix, planCode) {
      const org = await organizationsRepo.createOrganization(pool, {
        platform_tenant_id: TENANT_ZM,
        slug: `${slugPrefix}_${suffix}`.slice(0, 40),
        name: `${slugPrefix} ${suffix}`,
      });
      await organizationsRepo.updateOrganizationPlan(
        pool,
        org.id,
        { plan_code: planCode, plan_status: "active", plan_notes: null },
        null
      );
      return org;
    }

    async function ageOrg(organizationId, months) {
      const created = monthsAgo(months, at);
      await pool.query(`UPDATE public.church_organizations SET created_at = $2 WHERE id = $1`, [
        organizationId,
        created.toISOString(),
      ]);
      return created;
    }

    const orgActive = await makeOrg("da", "foundation");
    await ageOrg(orgActive.id, 3);

    const orgFirst = await makeOrg("df", "foundation");
    await ageOrg(orgFirst.id, 10.5);
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgFirst.id,
      full_name: "First Warning HQ",
      email: `first_hq_${suffix}@example.com`,
      phone: `0944${String(Date.now()).slice(-6)}`,
      password_hash: adminHash,
      role: "hq_admin",
      status: "active",
    });

    const orgFinal = await makeOrg("dn", "foundation");
    await ageOrg(orgFinal.id, 11.5);
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgFinal.id,
      full_name: "Final Warning HQ",
      email: `final_hq_${suffix}@example.com`,
      phone: `0945${String(Date.now()).slice(-6)}`,
      password_hash: adminHash,
      role: "hq_admin",
      status: "active",
    });

    const orgDormant = await makeOrg("dd", "foundation");
    const dormantCreated = await ageOrg(orgDormant.id, 12.5);
    await hqAdminsRepo.createHqAdmin(pool, {
      organization_id: orgDormant.id,
      full_name: "Dormant HQ",
      email: `dorm_hq_${suffix}@example.com`,
      phone: `0946${String(Date.now()).slice(-6)}`,
      password_hash: adminHash,
      role: "hq_admin",
      status: "active",
    });

    const orgGrowth = await makeOrg("dg", "growth");
    await ageOrg(orgGrowth.id, 13);

    const orgTrial = await makeOrg("dt", "foundation");
    await ageOrg(orgTrial.id, 13);
    await grantGrowthTrial(pool, orgTrial.id, {
      reason: "Dormancy exclusion trial",
      startsAt: addDays(at, -5),
      grantedByPlatformAdminId: 1,
    });

    // Aged Foundation org that stays active because of genuine check-in activity
    const orgCheckIn = await makeOrg("dc", "foundation");
    await ageOrg(orgCheckIn.id, 13);
    const branchCheckIn = await branchesRepo.createBranch(pool, {
      organization_id: orgCheckIn.id,
      slug: `bc_${suffix}`.slice(0, 30),
      host_slug: `bc_${suffix}`.slice(0, 30),
      name: "Check-in Branch",
      status: "active",
    });
    const sessionInsert = await pool.query(
      `INSERT INTO public.church_attendance_service_sessions (
         organization_id, branch_id, attendance_type, service_name, session_date, status
       ) VALUES ($1, $2, 'sunday', 'Main', $3::date, 'open')
       RETURNING id`,
      [orgCheckIn.id, branchCheckIn.id, at.toISOString().slice(0, 10)]
    );
    await pool.query(
      `INSERT INTO public.church_attendance_check_ins (
         organization_id, branch_id, service_session_id, check_in_kind, method,
         visitor_name, checked_in_at, status
       ) VALUES ($1, $2, $3, 'visitor', 'manual', 'Visitor', $4, 'active')`,
      [orgCheckIn.id, branchCheckIn.id, sessionInsert.rows[0].id, at.toISOString()]
    );

    const branchDormant = await branchesRepo.createBranch(pool, {
      organization_id: orgDormant.id,
      slug: `bd_${suffix}`.slice(0, 30),
      host_slug: `bd_${suffix}`.slice(0, 30),
      name: "Dormant Branch",
      status: "active",
    });

    await websiteContentRepo.upsertWebsiteDraftForBranch(pool, branchDormant.id, {
      organization_id: orgDormant.id,
      homepage_hero_title: "Hello",
      homepage_hero_subtitle: "Sub",
      welcome_message: "Welcome",
      service_times: "",
      location_text: "",
      about_title: "",
      about_body: "",
      mission_text: "",
      vision_text: "",
      values_text: "",
      leadership_json: {},
      ministries_json: [],
      contact_phone: "",
      contact_email: "",
      office_hours: "",
      address: "",
      map_embed_placeholder: "",
      giving_bank_details: "",
      giving_mobile_money: "",
      giving_categories: "",
      giving_instructions: "",
      giving_qr_placeholder: "",
      footer_message: "",
      updated_by_admin_id: null,
    });
    await websiteContentRepo.publishWebsiteContentForBranch(pool, branchDormant.id, null);
    const publishedBefore = await websiteContentRepo.getPublishedWebsiteContentForBranch(
      pool,
      branchDormant.id
    );
    assert.ok(publishedBefore);

    const memberEmail = `m_${suffix}@example.com`;
    const memberInsert = await pool.query(
      `INSERT INTO public.church_members (
         organization_id, branch_id, platform_tenant_id,
         email, full_name, phone, phone_normalized, status, password_hash
       ) VALUES ($1, $2, $3, $4, $5, '', '', 'verified', 'hash')
       RETURNING id`,
      [orgDormant.id, branchDormant.id, TENANT_ZM, memberEmail, `Member ${suffix}`]
    );
    const memberId = memberInsert.rows[0].id;

    const ids = [
      orgActive.id,
      orgFirst.id,
      orgFinal.id,
      orgDormant.id,
      orgGrowth.id,
      orgTrial.id,
      orgCheckIn.id,
    ];

    // Active Foundation (< 10 months)
    const run1 = await dormancyService.processFoundationInactivityJobs(pool, {
      at,
      organizationIds: ids,
    });
    const activeRow = run1.processed.find((p) => p.organizationId === orgActive.id);
    assert.equal(activeRow.outcome, "active_ok");

    // Recent check-in counts as genuine attendance — not dormant despite age
    const checkInRow = run1.processed.find((p) => p.organizationId === orgCheckIn.id);
    assert.equal(checkInRow.outcome, "active_ok");
    const checkInActivity = await calculateOrganisationActivity(pool, orgCheckIn.id);
    assert.equal(checkInActivity.certain, true);
    assert.ok(checkInActivity.sources.some((s) => s.key === "attendance_check_in"));

    // 10-month warning + recorded notice
    const firstRow = run1.processed.find((p) => p.organizationId === orgFirst.id);
    assert.equal(firstRow.stage, "first");
    assert.equal(firstRow.outcome, "recorded");
    assert.ok(firstRow.recordedDeliveries >= 1);
    const firstDeliveries = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.church_notification_test_deliveries
       WHERE organization_id = $1 AND template_key = 'foundation_dormancy_warning'`,
      [orgFirst.id]
    );
    assert.ok(firstDeliveries.rows[0].c >= 1);

    // 11-month warning
    const finalRow = run1.processed.find((p) => p.organizationId === orgFinal.id);
    assert.equal(finalRow.stage, "final");
    assert.equal(finalRow.outcome, "recorded");
    assert.ok(finalRow.recordedDeliveries >= 1);

    // 12-month dormant + public site unpublished + 90-day preserve window
    const dormantRow = run1.processed.find((p) => p.organizationId === orgDormant.id);
    assert.equal(dormantRow.outcome, "dormant");
    const dormantOrg = await organizationsRepo.findOrganizationById(pool, orgDormant.id);
    assert.equal(dormantOrg.status, "dormant");
    assert.ok(dormantOrg.dormant_at);
    assert.equal(dormantOrg.dormant_by_system, true);
    assert.equal(
      new Date(dormantOrg.dormancy_data_preserve_until).toISOString(),
      addDays(at, DATA_PRESERVE_DAYS).toISOString()
    );
    const publishedAfter = await websiteContentRepo.getPublishedWebsiteContentForBranch(
      pool,
      branchDormant.id
    );
    assert.equal(publishedAfter, null);
    const siteRow = await websiteContentRepo.getWebsiteContentForBranch(pool, branchDormant.id);
    assert.equal(siteRow.status, "draft");

    // Growth package excluded
    const growthRow = run1.processed.find((p) => p.organizationId === orgGrowth.id);
    assert.equal(growthRow.outcome, "skipped_growth");
    const growthOrg = await organizationsRepo.findOrganizationById(pool, orgGrowth.id);
    assert.equal(growthOrg.status, "active");

    // Growth trial excluded
    const trialRow = run1.processed.find((p) => p.organizationId === orgTrial.id);
    assert.equal(trialRow.outcome, "skipped_growth");
    assert.equal(trialRow.reason, "growth_trial");
    const trialOrg = await organizationsRepo.findOrganizationById(pool, orgTrial.id);
    assert.equal(trialOrg.status, "active");

    // Duplicate job run — warnings and dormant claim are idempotent
    const run2 = await dormancyService.processFoundationInactivityJobs(pool, {
      at,
      organizationIds: [orgFirst.id, orgFinal.id, orgDormant.id],
    });
    const firstDup = run2.processed.find((p) => p.organizationId === orgFirst.id);
    assert.equal(firstDup.outcome, "duplicate_job");
    const finalDup = run2.processed.find((p) => p.organizationId === orgFinal.id);
    assert.equal(finalDup.outcome, "duplicate_job");
    assert.ok(
      !run2.processed.some((p) => p.organizationId === orgDormant.id && p.outcome === "dormant")
    );

    const warningCount = await pool.query(
      `SELECT warning_stage, COUNT(*)::int AS c
       FROM public.church_organization_inactivity_warnings
       WHERE organization_id = $1 AND warning_stage IN ('first','final')
       GROUP BY warning_stage`,
      [orgFirst.id]
    );
    assert.equal(warningCount.rows.find((r) => r.warning_stage === "first").c, 1);

    // Preserved data (member still present; no deletion)
    const memberStill = await pool.query(`SELECT id, email FROM public.church_members WHERE id = $1`, [
      memberId,
    ]);
    assert.equal(memberStill.rows.length, 1);
    assert.equal(memberStill.rows[0].email, memberEmail);

    const diag = await dormancyService.getOrganisationDormancyDiagnostic(pool, orgDormant.id, { at });
    assert.equal(diag.status, "dormant");
    assert.equal(diag.productionDeletionEnabled, false);
    assert.ok(diag.auditHistory.some((a) => a.action === "organization_marked_dormant"));

    // Uncertain activity — never mark dormant
    const uncertain = await dormancyService.markOrganisationDormant(pool, {
      organizationId: orgActive.id,
      activity: { certain: false, reason: "calculation_error" },
      at,
    });
    assert.equal(uncertain.outcome, "skipped_uncertain");

    // Reactivation
    const reactivated = await dormancyService.reactivateFromDormancy(pool, {
      organizationId: orgDormant.id,
      actorType: "hq_admin",
      actorId: 1,
      reason: "Test reactivation",
      at,
    });
    assert.equal(reactivated.status, "active");
    assert.equal(reactivated.dormant_at, null);
    assert.ok(reactivated.reactivated_from_dormancy_at);
    const memberAfter = await pool.query(`SELECT id FROM public.church_members WHERE id = $1`, [memberId]);
    assert.equal(memberAfter.rows.length, 1);
    const siteAfterReactivate = await websiteContentRepo.getWebsiteContentForBranch(
      pool,
      branchDormant.id
    );
    assert.equal(siteAfterReactivate.status, "draft", "public site stays unpublished after reactivation");

    const activity = await calculateOrganisationActivity(pool, orgActive.id);
    assert.equal(activity.certain, true);
    assert.ok(activity.lastActivityAt);
    assert.ok(Array.isArray(activity.sources));
    assert.ok(activity.sources.some((s) => s.key === "organization_created"));

    assert.ok(dormantCreated);

    // Cleanup
    const allOrgIds = ids;
    await pool.query(
      `DELETE FROM public.church_notification_test_deliveries WHERE organization_id = ANY($1::int[])`,
      [allOrgIds]
    );
    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = ANY($1::int[])`, [
      allOrgIds,
    ]);
    await pool.query(
      `DELETE FROM public.church_organization_inactivity_warnings WHERE organization_id = ANY($1::int[])`,
      [allOrgIds]
    );
    await pool.query(
      `DELETE FROM public.church_organization_package_trial_reminders WHERE organization_id = ANY($1::int[])`,
      [allOrgIds]
    );
    await pool.query(
      `DELETE FROM public.church_organization_package_trials WHERE organization_id = ANY($1::int[])`,
      [allOrgIds]
    );
    await pool.query(
      `DELETE FROM public.church_organization_package_history WHERE organization_id = ANY($1::int[])`,
      [allOrgIds]
    );
    await pool.query(`DELETE FROM public.church_attendance_check_ins WHERE organization_id = ANY($1::int[])`, [
      allOrgIds,
    ]);
    await pool.query(
      `DELETE FROM public.church_attendance_service_sessions WHERE organization_id = ANY($1::int[])`,
      [allOrgIds]
    );
    await pool.query(`DELETE FROM public.church_branch_website_content WHERE organization_id = ANY($1::int[])`, [
      allOrgIds,
    ]).catch(async () => {
      await pool.query(
        `DELETE FROM public.church_branch_website_content
         WHERE branch_id IN (SELECT id FROM public.church_branches WHERE organization_id = ANY($1::int[]))`,
        [allOrgIds]
      ).catch(() => null);
    });
    await pool.query(`DELETE FROM public.church_members WHERE organization_id = ANY($1::int[])`, [
      allOrgIds,
    ]);
    await pool.query(`DELETE FROM public.church_hq_admins WHERE organization_id = ANY($1::int[])`, [
      allOrgIds,
    ]);
    await pool.query(`DELETE FROM public.church_branches WHERE organization_id = ANY($1::int[])`, [
      allOrgIds,
    ]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = ANY($1::int[])`, [allOrgIds]);
  }
);
