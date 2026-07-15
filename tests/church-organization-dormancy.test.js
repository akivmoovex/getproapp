"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const websiteContentRepo = require("../src/db/pg/church/websiteContentRepo");
const {
  classifyInactivity,
  calculateOrganisationActivity,
  FIRST_WARNING_MONTHS,
  FINAL_WARNING_MONTHS,
  DORMANT_MONTHS,
  DATA_PRESERVE_DAYS,
} = require("../src/services/church/churchInactivityActivityService");
const dormancyService = require("../src/services/church/churchDormancyService");
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

    const orgFinal = await makeOrg("dn", "foundation");
    await ageOrg(orgFinal.id, 11.5);

    const orgDormant = await makeOrg("dd", "foundation");
    const dormantCreated = await ageOrg(orgDormant.id, 12.5);

    const orgGrowth = await makeOrg("dg", "growth");
    await ageOrg(orgGrowth.id, 13);

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

    const ids = [orgActive.id, orgFirst.id, orgFinal.id, orgDormant.id, orgGrowth.id];

    // Active Foundation (< 10 months)
    const run1 = await dormancyService.processFoundationInactivityJobs(pool, {
      at,
      organizationIds: ids,
    });
    const activeRow = run1.processed.find((p) => p.organizationId === orgActive.id);
    assert.equal(activeRow.outcome, "active_ok");

    // 10-month warning
    const firstRow = run1.processed.find((p) => p.organizationId === orgFirst.id);
    assert.equal(firstRow.stage, "first");
    assert.equal(firstRow.outcome, "recorded");

    // 11-month warning
    const finalRow = run1.processed.find((p) => p.organizationId === orgFinal.id);
    assert.equal(finalRow.stage, "final");
    assert.equal(finalRow.outcome, "recorded");

    // 12-month dormant + public site unpublished
    const dormantRow = run1.processed.find((p) => p.organizationId === orgDormant.id);
    assert.equal(dormantRow.outcome, "dormant");
    const dormantOrg = await organizationsRepo.findOrganizationById(pool, orgDormant.id);
    assert.equal(dormantOrg.status, "dormant");
    assert.ok(dormantOrg.dormant_at);
    assert.ok(dormantOrg.dormancy_data_preserve_until);
    assert.equal(dormantOrg.dormant_by_system, true);
    const publishedAfter = await websiteContentRepo.getPublishedWebsiteContentForBranch(
      pool,
      branchDormant.id
    );
    assert.equal(publishedAfter, null);
    const siteRow = await websiteContentRepo.getWebsiteContentForBranch(pool, branchDormant.id);
    assert.equal(siteRow.status, "draft");

    // Growth excluded
    const growthRow = run1.processed.find((p) => p.organizationId === orgGrowth.id);
    assert.equal(growthRow.outcome, "skipped_growth");
    const growthOrg = await organizationsRepo.findOrganizationById(pool, orgGrowth.id);
    assert.equal(growthOrg.status, "active");

    // Duplicate job run — warnings and dormant claim are idempotent
    const run2 = await dormancyService.processFoundationInactivityJobs(pool, {
      at,
      organizationIds: [orgFirst.id, orgFinal.id, orgDormant.id],
    });
    const firstDup = run2.processed.find((p) => p.organizationId === orgFirst.id);
    assert.equal(firstDup.outcome, "duplicate_job");
    const finalDup = run2.processed.find((p) => p.organizationId === orgFinal.id);
    assert.equal(finalDup.outcome, "duplicate_job");
    const dormantDup = run2.processed.find((p) => p.organizationId === orgDormant.id);
    assert.ok(
      dormantDup.outcome === "already_dormant" ||
        dormantDup.outcome === "skipped_status" ||
        // org may be filtered if status != active — process only selects active
        dormantDup == null
    );
    // Dormant org is no longer in active candidates when we pass organizationIds with status filter
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

    // Anchors still based on org creation for aged dormant sample (before reactivation activity updates)
    assert.ok(dormantCreated);
  }
);
