"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const churchPilotFeatureFlagService = require("../src/services/church/churchPilotFeatureFlagService");
const scheduledReportService = require("../src/services/church/scheduledReportService");
const { getOrganisationPlan } = require("../src/services/church/churchEntitlementService");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("catalogue lists controlled Growth pilot flags", () => {
  const keys = churchPilotFeatureFlagService.listPilotFlagDefinitions().map((f) => f.key);
  for (const k of [
    "attendance_offline",
    "reports_scheduled",
    "broadcasts_scheduled",
    "growth_trial",
    "reports_cross_branch",
    "member_import_advanced",
    "dormancy_automation",
    "billing_snapshot",
  ]) {
    assert.ok(keys.includes(k), k);
  }
});

test("missing flag data falls back to catalogue default (safe)", async () => {
  const emptyPool = {
    async query() {
      throw new Error("relation does not exist");
    },
  };
  const resolved = await churchPilotFeatureFlagService.resolvePilotFlag(emptyPool, {
    flagKey: "reports_scheduled",
    organizationId: 1,
  });
  assert.equal(resolved.source, "catalogue_fallback");
  assert.equal(resolved.flagAllows, true);
});

test(
  "pilot flags: entitlement×flag matrix, expiry, isolation, duplicate update, job skip",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pff");

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pffa_${suffix}`.slice(0, 40),
      name: `Pilot A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pffb_${suffix}`.slice(0, 40),
      name: `Pilot B ${suffix}`,
    });
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgA.id,
      { plan_code: "growth", plan_status: "active", plan_notes: null },
      null
    );
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgB.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: null },
      null
    );

    const actor = { id: 42, label: "Pilot Approver" };
    const flagKey = "reports_scheduled";

    // Clean any prior rows for this flag on these orgs / platform for isolation of test assertions
    await pool.query(
      `DELETE FROM public.church_pilot_feature_flag_tenant_overrides
       WHERE organization_id IN ($1,$2) AND flag_key = $3`,
      [orgA.id, orgB.id, flagKey]
    );

    const planGrowth = await getOrganisationPlan(pool, orgA.id);
    const planFoundation = await getOrganisationPlan(pool, orgB.id);

    // entitlement true + flag true (catalogue default / explicit enable)
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgA.id,
      flagKey,
      { enabled: "true", reason: "Pilot on", approver_label: actor.label },
      actor
    );
    const bothTrue = await churchPilotFeatureFlagService.isPilotFeatureAvailable(pool, {
      organizationId: orgA.id,
      flagKey,
      plan: planGrowth,
    });
    assert.equal(bothTrue.entitlementAllows, true);
    assert.equal(bothTrue.flagAllows, true);
    assert.equal(bothTrue.available, true);

    // entitlement true + flag false
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgA.id,
      flagKey,
      { enabled: "false", reason: "Pilot off", approver_label: actor.label },
      actor
    );
    const entTrueFlagFalse = await churchPilotFeatureFlagService.isPilotFeatureAvailable(pool, {
      organizationId: orgA.id,
      flagKey,
      plan: planGrowth,
    });
    assert.equal(entTrueFlagFalse.entitlementAllows, true);
    assert.equal(entTrueFlagFalse.flagAllows, false);
    assert.equal(entTrueFlagFalse.available, false);

    // entitlement false + flag true
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgB.id,
      flagKey,
      { enabled: "true", reason: "Flag on but Foundation", approver_label: actor.label },
      actor
    );
    const entFalseFlagTrue = await churchPilotFeatureFlagService.isPilotFeatureAvailable(pool, {
      organizationId: orgB.id,
      flagKey,
      plan: planFoundation,
    });
    assert.equal(entFalseFlagTrue.entitlementAllows, false);
    assert.equal(entFalseFlagTrue.flagAllows, true);
    assert.equal(entFalseFlagTrue.available, false);

    // expired flag
    const past = new Date(Date.now() - 86400000).toISOString();
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgA.id,
      flagKey,
      {
        enabled: "true",
        starts_at: new Date(Date.now() - 7 * 86400000).toISOString(),
        ends_at: past,
        reason: "Expired window",
        approver_label: actor.label,
      },
      actor
    );
    const expired = await churchPilotFeatureFlagService.isPilotFeatureAvailable(pool, {
      organizationId: orgA.id,
      flagKey,
      plan: planGrowth,
      at: new Date(),
    });
    assert.equal(expired.flagAllows, false);
    assert.equal(expired.expired, true);
    assert.equal(expired.available, false);

    // tenant isolation — orgB override must not affect orgA after we reset orgA
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgA.id,
      flagKey,
      { enabled: "true", reason: "A on", approver_label: actor.label },
      actor
    );
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgB.id,
      flagKey,
      { enabled: "false", reason: "B off", approver_label: actor.label },
      actor
    );
    const aCheck = await churchPilotFeatureFlagService.resolvePilotFlag(pool, {
      organizationId: orgA.id,
      flagKey,
    });
    const bCheck = await churchPilotFeatureFlagService.resolvePilotFlag(pool, {
      organizationId: orgB.id,
      flagKey,
    });
    assert.equal(aCheck.flagAllows, true);
    assert.equal(bCheck.flagAllows, false);

    // duplicate update — second upsert succeeds and writes another audit row
    const auditBefore = await churchPilotFeatureFlagService.listPilotFlagAudit(pool, {
      organizationId: orgA.id,
      flagKey,
      limit: 100,
    });
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgA.id,
      flagKey,
      { enabled: "true", reason: "Duplicate save", approver_label: actor.label },
      actor
    );
    const auditAfter = await churchPilotFeatureFlagService.listPilotFlagAudit(pool, {
      organizationId: orgA.id,
      flagKey,
      limit: 100,
    });
    assert.ok(auditAfter.length >= auditBefore.length + 1);

    // background-job enforcement: processDue skips when flag false
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgA.id,
      flagKey,
      { enabled: "false", reason: "Block jobs", approver_label: actor.label },
      actor
    );
    await assert.rejects(
      () => scheduledReportService.assertCanScheduleReports(pool, orgA.id),
      (err) => err && (err.code === "PILOT_FEATURE_DENIED" || err.code === "PACKAGE_FEATURE_DENIED")
    );

    // auto-expiry housekeeping
    await churchPilotFeatureFlagService.setTenantPilotFlag(
      pool,
      orgA.id,
      flagKey,
      {
        enabled: "true",
        ends_at: past,
        reason: "Will auto-expire",
        approver_label: actor.label,
      },
      actor
    );
    const expiry = await churchPilotFeatureFlagService.processExpiredPilotFlags(pool, {
      at: new Date(),
      limit: 50,
    });
    assert.ok(expiry.count >= 1);
    const afterExpiry = await churchPilotFeatureFlagService.resolvePilotFlag(pool, {
      organizationId: orgA.id,
      flagKey,
    });
    assert.equal(afterExpiry.enabled, false);

    await pool.query(
      `DELETE FROM public.church_pilot_feature_flag_audit WHERE organization_id IN ($1,$2)`,
      [orgA.id, orgB.id]
    );
    await pool.query(
      `DELETE FROM public.church_pilot_feature_flag_tenant_overrides WHERE organization_id IN ($1,$2)`,
      [orgA.id, orgB.id]
    );
  }
);
