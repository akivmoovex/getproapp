"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BLESSBOARD_PACKAGES,
  DEFAULT_PACKAGE_CODE,
  resolvePackageFromPlanCode,
  FAIR_USE,
} = require("../src/church/blessBoardPackageCatalogue");
const {
  getOrganisationPlan,
  getEntitlement,
  hasEntitlement,
  getNumericLimit,
  checkQuota,
  getOrganisationPackageDiagnostic,
  assignOrganisationPackage,
} = require("../src/services/church/churchEntitlementService");
const { validatePlanUpdateBody } = require("../src/church/churchPlanValidation");
const { getChurchPlan, isFeatureEnabled, canCreateAdditionalBranch } = require("../src/church/churchPlans");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("Foundation catalogue entitlements resolve as specified", () => {
  const resolved = resolvePackageFromPlanCode("foundation");
  assert.equal(resolved.packageCode, "foundation");
  assert.equal(resolved.entitlementSource, "direct");
  assert.equal(resolved.usedFallback, false);

  const plan = {
    entitlements: BLESSBOARD_PACKAGES.foundation.entitlements,
  };
  assert.equal(getNumericLimit(plan, "branches.max_active"), 1);
  assert.equal(getNumericLimit(plan, "members.max_active"), 250);
  assert.equal(getNumericLimit(plan, "admins.max"), 10);
  assert.equal(getNumericLimit(plan, "storage.bytes"), 2147483648);
  assert.equal(getNumericLimit(plan, "external_emails.monthly"), 500);
  assert.equal(hasEntitlement(plan, "attendance.qr"), true);
  assert.equal(hasEntitlement(plan, "attendance.offline"), false);
  assert.equal(hasEntitlement(plan, "attendance.custom_rules"), false);
  assert.equal(getEntitlement(plan, "care.automation"), "basic");
  assert.equal(getEntitlement(plan, "surveys.custom"), "limited");
  assert.equal(hasEntitlement(plan, "surveys.custom"), true);
  assert.equal(hasEntitlement(plan, "appointments.calendar"), false);
  assert.equal(hasEntitlement(plan, "volunteers.scheduling"), false);
  assert.equal(hasEntitlement(plan, "events.advanced_logistics"), false);
  assert.equal(hasEntitlement(plan, "broadcasts.scheduled"), false);
  assert.equal(hasEntitlement(plan, "reports.scheduled"), false);
  assert.equal(getNumericLimit(plan, "reports.scheduled_monthly"), 0);
  assert.equal(hasEntitlement(plan, "reports.cross_branch"), false);
  assert.equal(hasEntitlement(plan, "reports.custom_builder"), false);
  assert.equal(hasEntitlement(plan, "domains.custom"), false);
  assert.equal(getEntitlement(plan, "email.mailboxes_per_branch"), 0);
  assert.equal(hasEntitlement(plan, "integrations.webhooks"), false);
  assert.equal(hasEntitlement(plan, "integrations.public_api"), false);
  assert.equal(hasEntitlement(plan, "reports.api"), false);
  assert.equal(hasEntitlement(plan, "network.executive_hierarchy"), false);
  assert.equal(hasEntitlement(plan, "network.priority_support"), false);
  assert.equal(getEntitlement(plan, "support.level"), "basic");
});

test("Growth catalogue entitlements resolve as specified", () => {
  const resolved = resolvePackageFromPlanCode("growth");
  assert.equal(resolved.packageCode, "growth");
  assert.equal(resolved.entitlementSource, "direct");

  const plan = {
    entitlements: BLESSBOARD_PACKAGES.growth.entitlements,
  };
  assert.equal(getNumericLimit(plan, "branches.max_active"), null);
  assert.equal(getNumericLimit(plan, "members.max_active"), FAIR_USE);
  assert.equal(getNumericLimit(plan, "admins.max"), FAIR_USE);
  assert.equal(getNumericLimit(plan, "storage.bytes", { activeBranchCount: 2 }), 10737418240 + 2147483648 * 2);
  assert.equal(getNumericLimit(plan, "external_emails.monthly", { activeBranchCount: 3 }), 5000 + 1000 * 3);
  assert.equal(hasEntitlement(plan, "attendance.offline"), true);
  assert.equal(hasEntitlement(plan, "attendance.custom_rules"), true);
  assert.equal(getEntitlement(plan, "care.automation"), "advanced");
  assert.equal(hasEntitlement(plan, "surveys.custom"), true);
  assert.equal(hasEntitlement(plan, "appointments.calendar"), true);
  assert.equal(hasEntitlement(plan, "volunteers.scheduling"), true);
  assert.equal(hasEntitlement(plan, "events.advanced_logistics"), true);
  assert.equal(hasEntitlement(plan, "broadcasts.scheduled"), true);
  assert.equal(hasEntitlement(plan, "reports.scheduled"), true);
  assert.equal(getNumericLimit(plan, "reports.scheduled_monthly"), 20);
  assert.equal(hasEntitlement(plan, "reports.cross_branch"), true);
  assert.equal(hasEntitlement(plan, "reports.custom_builder"), false);
  assert.equal(hasEntitlement(plan, "domains.custom"), false);
  assert.equal(getEntitlement(plan, "support.level"), "standard");
});

test("legacy free/standard/pro alias to Foundation/Growth without fallback", () => {
  assert.equal(resolvePackageFromPlanCode("free").packageCode, "foundation");
  assert.equal(resolvePackageFromPlanCode("free").entitlementSource, "legacy_alias");
  assert.equal(resolvePackageFromPlanCode("standard").packageCode, "growth");
  assert.equal(resolvePackageFromPlanCode("pro").packageCode, "growth");
  assert.equal(resolvePackageFromPlanCode("pro").usedFallback, false);
});

test("missing or unknown plan_code falls back to Foundation and reports it", () => {
  const missing = resolvePackageFromPlanCode(null);
  assert.equal(missing.packageCode, DEFAULT_PACKAGE_CODE);
  assert.equal(missing.entitlementSource, "fallback_default");
  assert.equal(missing.usedFallback, true);
  assert.match(missing.fallbackReason || "", /Missing plan_code/i);

  const unknown = resolvePackageFromPlanCode("enterprise");
  assert.equal(unknown.packageCode, "foundation");
  assert.equal(unknown.usedFallback, true);
  assert.match(unknown.fallbackReason || "", /Unknown plan_code/i);
});

test("checkQuota never enforces and reports status", () => {
  const foundation = { entitlements: BLESSBOARD_PACKAGES.foundation.entitlements };
  const ok = checkQuota(foundation, "members.max_active", 100);
  assert.equal(ok.enforced, false);
  assert.equal(ok.status, "ok");
  assert.equal(ok.ok, true);

  const near = checkQuota(foundation, "members.max_active", 200);
  assert.equal(near.status, "near");
  assert.equal(near.enforced, false);

  const atLimit = checkQuota(foundation, "members.max_active", 250);
  assert.equal(atLimit.status, "at_limit");
  assert.equal(atLimit.ok, true);
  assert.equal(atLimit.enforced, false);

  const exceeded = checkQuota(foundation, "members.max_active", 251);
  assert.equal(exceeded.status, "exceeded");
  assert.equal(exceeded.ok, false);
  assert.equal(exceeded.enforced, false);

  const growth = { entitlements: BLESSBOARD_PACKAGES.growth.entitlements };
  const unlimited = checkQuota(growth, "branches.max_active", 99);
  assert.equal(unlimited.status, "unlimited");
  assert.equal(unlimited.enforced, false);

  const fair = checkQuota(growth, "members.max_active", 5000);
  assert.equal(fair.status, "fair_use");
  assert.equal(fair.enforced, false);
});

test("legacy churchPlans behaviour for free/standard remains unchanged", () => {
  assert.equal(getChurchPlan("free").limits.max_members, 200);
  assert.equal(getChurchPlan("free").limits.max_branches, 1);
  assert.equal(isFeatureEnabled("free", "hq_broadcasts"), false);
  assert.equal(isFeatureEnabled("standard", "hq_broadcasts"), true);
  assert.equal(canCreateAdditionalBranch("free", 1).allowed, false);
  // Package codes alias to previous enforcement profile (no behaviour change yet)
  assert.equal(getChurchPlan("foundation").limits.max_members, 200);
  assert.equal(isFeatureEnabled("foundation", "hq_broadcasts"), false);
  assert.equal(isFeatureEnabled("growth", "hq_broadcasts"), true);
});

test("validatePlanUpdateBody accepts foundation and growth", () => {
  assert.equal(validatePlanUpdateBody({ plan_code: "foundation" }).ok, true);
  assert.equal(validatePlanUpdateBody({ plan_code: "growth" }).ok, true);
  assert.equal(validatePlanUpdateBody({ plan_code: "enterprise" }).ok, false);
});

test(
  "getOrganisationPlan is scoped to organisation id (tenant isolation)",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pkgiso");

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkg_a_${suffix}`,
      name: `Pkg A ${suffix}`,
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkg_b_${suffix}`,
      name: `Pkg B ${suffix}`,
    });

    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgA.id,
      { plan_code: "foundation", plan_status: "active", plan_notes: "a" },
      null
    );
    await organizationsRepo.updateOrganizationPlan(
      pool,
      orgB.id,
      { plan_code: "growth", plan_status: "active", plan_notes: "b" },
      null
    );

    const planA = await getOrganisationPlan(pool, orgA.id);
    const planB = await getOrganisationPlan(pool, orgB.id);
    assert.ok(planA);
    assert.ok(planB);
    assert.equal(planA.organizationId, orgA.id);
    assert.equal(planB.organizationId, orgB.id);
    assert.equal(planA.packageCode, "foundation");
    assert.equal(planB.packageCode, "growth");
    assert.notEqual(planA.organizationId, planB.organizationId);
    assert.notEqual(planA.packageCode, planB.packageCode);

    // Negative: resolving A must never return B's package details
    assert.notEqual(planA.storedPlanCode, "growth");
    assert.notEqual(planA.organizationSlug, orgB.slug);

    const diagA = await getOrganisationPackageDiagnostic(pool, orgA.id);
    assert.equal(diagA.organization.id, orgA.id);
    assert.equal(diagA.currentPackage.code, "foundation");
    assert.equal(diagA.entitlementSource, "direct");
    assert.equal(diagA.fallback.used, false);

    const missing = await getOrganisationPlan(pool, 999999991);
    assert.equal(missing, null);

    const assigned = await assignOrganisationPackage(
      pool,
      orgA.id,
      { package_code: "growth", plan_status: "active", plan_notes: "switched" },
      null
    );
    assert.equal(assigned.package.packageCode, "growth");
    assert.equal(assigned.organization.plan_code, "growth");

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id IN ($1, $2)`, [
      orgA.id,
      orgB.id,
    ]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id IN ($1, $2)`, [orgA.id, orgB.id]);
  }
);

test(
  "free plan_code organisation resolves Foundation via legacy alias",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("pkgfree");
    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `pkg_free_${suffix}`,
      name: `Pkg Free ${suffix}`,
    });
    // Default create typically leaves plan_code free
    const plan = await getOrganisationPlan(pool, org.id);
    assert.ok(plan);
    assert.equal(plan.packageCode, "foundation");
    assert.ok(plan.entitlementSource === "legacy_alias" || plan.entitlementSource === "direct" || plan.entitlementSource === "fallback_default");
    if (plan.storedPlanCode === "free" || plan.storedPlanCode == null || plan.storedPlanCode === "") {
      assert.ok(["legacy_alias", "fallback_default"].includes(plan.entitlementSource));
    }
    assert.equal(getNumericLimit(plan, "members.max_active"), 250);

    await pool.query(`DELETE FROM public.church_audit_logs WHERE organization_id = $1`, [org.id]);
    await pool.query(`DELETE FROM public.church_organizations WHERE id = $1`, [org.id]);
  }
);
