"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BLESSBOARD_PACKAGES,
  FAIR_USE,
} = require("../src/church/blessBoardPackageCatalogue");
const {
  getNumericLimit,
  checkQuota,
} = require("../src/services/church/churchEntitlementService");
const organizationUsageRepo = require("../src/db/pg/church/organizationUsageRepo");
const churchPackageUsageService = require("../src/services/church/churchPackageUsageService");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("catalogue scheduled_monthly and composed limits match Foundation / Growth", () => {
  const foundation = { entitlements: BLESSBOARD_PACKAGES.foundation.entitlements };
  const growth = { entitlements: BLESSBOARD_PACKAGES.growth.entitlements };

  assert.equal(getNumericLimit(foundation, "reports.scheduled_monthly"), 0);
  assert.equal(getNumericLimit(growth, "reports.scheduled_monthly"), 20);
  assert.equal(getNumericLimit(foundation, "external_emails.monthly"), 500);
  assert.equal(getNumericLimit(foundation, "storage.bytes"), 2147483648);
  assert.equal(getNumericLimit(growth, "external_emails.monthly", { activeBranchCount: 2 }), 7000);
  assert.equal(getNumericLimit(growth, "storage.bytes", { activeBranchCount: 1 }), 10737418240 + 2147483648);
  assert.equal(getNumericLimit(growth, "members.max_active"), FAIR_USE);
  assert.equal(getNumericLimit(growth, "branches.max_active"), null);
});

test("checkQuota warning bands at 80%, 90%, and 100%", () => {
  const foundation = { entitlements: BLESSBOARD_PACKAGES.foundation.entitlements };
  assert.equal(checkQuota(foundation, "members.max_active", 100).status, "ok");
  assert.equal(checkQuota(foundation, "members.max_active", 200).status, "near");
  assert.equal(checkQuota(foundation, "members.max_active", 200).warningBand, 80);
  assert.equal(checkQuota(foundation, "members.max_active", 225).status, "warn_90");
  assert.equal(checkQuota(foundation, "members.max_active", 225).warningBand, 90);
  assert.equal(checkQuota(foundation, "members.max_active", 250).status, "at_limit");
  assert.equal(checkQuota(foundation, "members.max_active", 250).warningBand, 100);
  assert.equal(checkQuota(foundation, "members.max_active", 251).status, "exceeded");
});

test("usage month key respects organisation timezone around month boundary", () => {
  // 2026-03-01 00:30 UTC → still Feb 28 evening in US/Pacific
  const justAfterUtcMonth = new Date("2026-03-01T00:30:00.000Z");
  assert.equal(
    organizationUsageRepo.usageMonthKeyForTimezone("UTC", justAfterUtcMonth),
    "2026-03-01"
  );
  assert.equal(
    organizationUsageRepo.usageMonthKeyForTimezone("America/Los_Angeles", justAfterUtcMonth),
    "2026-02-01"
  );

  // Invalid timezone falls back to UTC
  assert.equal(
    organizationUsageRepo.usageMonthKeyForTimezone("Not/AZone", justAfterUtcMonth),
    "2026-03-01"
  );
});

test("exempt email categories are never billable meters", () => {
  for (const cat of [
    "security_notification",
    "password_recovery",
    "safeguarding",
    "account_export",
    "billing_access",
    "offboarding",
  ]) {
    assert.equal(churchPackageUsageService.isExemptEmailCategory(cat), true);
  }
  assert.equal(churchPackageUsageService.isExemptEmailCategory("newsletter"), false);
});

test(
  "usage meters are org-scoped and roll over by timezone month",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("usage");

    const orgA = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `usage_a_${suffix}`,
      name: `Usage A ${suffix}`,
      status: "active",
    });
    const orgB = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `usage_b_${suffix}`,
      name: `Usage B ${suffix}`,
      status: "active",
    });
    await organizationsRepo.updateOrganizationPlan(pool, orgA.id, { plan_code: "foundation" }, null);
    await organizationsRepo.updateOrganizationPlan(pool, orgB.id, { plan_code: "growth" }, null);

    await pool.query(`UPDATE public.church_organizations SET timezone = $2 WHERE id = $1`, [
      orgA.id,
      "UTC",
    ]);
    await pool.query(`UPDATE public.church_organizations SET timezone = $2 WHERE id = $1`, [
      orgB.id,
      "Pacific/Auckland",
    ]);

    const lateFebUtc = new Date("2026-02-28T12:00:00.000Z");
    await churchPackageUsageService.recordExternalEmailSend(pool, {
      organizationId: orgA.id,
      category: "newsletter",
      count: 10,
      at: lateFebUtc,
    });
    await churchPackageUsageService.recordExternalEmailSend(pool, {
      organizationId: orgA.id,
      category: "password_recovery",
      count: 5,
      at: lateFebUtc,
    });

    const snapAFeb = await churchPackageUsageService.getOrganisationUsageSnapshot(pool, orgA.id, {
      at: lateFebUtc,
      reconcileStorage: true,
    });
    assert.equal(snapAFeb.packageCode, "foundation");
    assert.equal(snapAFeb.externalEmailsThisMonth, 10);
    assert.equal(snapAFeb.meters.externalEmails.limit, 500);
    assert.equal(snapAFeb.meters.scheduledReports.state, "unavailable");
    assert.ok(snapAFeb.availableUpgrade);

    const marchUtc = new Date("2026-03-01T12:00:00.000Z");
    const snapAMar = await churchPackageUsageService.getOrganisationUsageSnapshot(pool, orgA.id, {
      at: marchUtc,
      reconcileStorage: false,
    });
    assert.equal(snapAMar.usageMonth, "2026-03-01");
    assert.equal(snapAMar.externalEmailsThisMonth, 0);

    await churchPackageUsageService.assertCanCreateScheduledReport(pool, {
      organizationId: orgB.id,
      consume: true,
      at: marchUtc,
    });
    const snapB = await churchPackageUsageService.getOrganisationUsageSnapshot(pool, orgB.id, {
      at: marchUtc,
      reconcileStorage: false,
    });
    assert.equal(snapB.scheduledReportsThisMonth, 1);
    assert.equal(snapB.meters.scheduledReports.limit, 20);
    assert.equal(snapB.availableUpgrade, null);

    // Tenant isolation: org B emails do not appear on org A
    await churchPackageUsageService.recordExternalEmailSend(pool, {
      organizationId: orgB.id,
      category: "newsletter",
      count: 3,
      at: marchUtc,
    });
    const snapAAgain = await churchPackageUsageService.getOrganisationUsageSnapshot(pool, orgA.id, {
      at: marchUtc,
      reconcileStorage: false,
    });
    assert.equal(snapAAgain.externalEmailsThisMonth, 0);

    // Foundation hard block on scheduled reports (limit 0)
    await assert.rejects(
      () =>
        churchPackageUsageService.assertCanCreateScheduledReport(pool, {
          organizationId: orgA.id,
          consume: true,
          at: marchUtc,
        }),
      (err) => err && err.code === "PACKAGE_SCHEDULED_REPORT_LIMIT"
    );
  }
);

test(
  "external email hard limit blocks non-exempt sends",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("emaillimit");

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `usage_el_${suffix}`,
      name: `Usage EL ${suffix}`,
      status: "active",
    });
    await organizationsRepo.updateOrganizationPlan(pool, org.id, { plan_code: "foundation" }, null);

    const month = organizationUsageRepo.usageMonthKeyForTimezone("UTC", new Date());
    await organizationUsageRepo.incrementExternalEmails(pool, org.id, month, 500);

    await assert.rejects(
      () =>
        churchPackageUsageService.recordExternalEmailSend(pool, {
          organizationId: org.id,
          category: "newsletter",
          count: 1,
        }),
      (err) => err && err.code === "PACKAGE_EXTERNAL_EMAIL_LIMIT"
    );

    const exempt = await churchPackageUsageService.recordExternalEmailSend(pool, {
      organizationId: org.id,
      category: "safeguarding",
      count: 1,
    });
    assert.equal(exempt.allowed, true);
    assert.equal(exempt.exempt, true);
    assert.equal(exempt.recorded, false);
  }
);
