"use strict";

/**
 * Proves Foundation / Growth / Network commercial numbers live in the package
 * catalogue (and active-branch prices in the billing price book).
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const catalogue = require("../src/church/blessBoardPackageCatalogue");
const {
  BLESSBOARD_PACKAGES,
  PACKAGE_CODES,
  FOUNDATION_ACTIVE_BRANCHES,
  FOUNDATION_ACTIVE_MEMBERS,
  FOUNDATION_ADMIN_ACCOUNTS,
  FOUNDATION_STORAGE_BYTES,
  FOUNDATION_EXTERNAL_EMAILS_MONTHLY,
  FOUNDATION_SCHEDULED_REPORTS_MONTHLY,
  GROWTH_STORAGE_BYTES_BASE,
  GROWTH_STORAGE_BYTES_PER_ACTIVE_BRANCH,
  GROWTH_EXTERNAL_EMAILS_MONTHLY_BASE,
  GROWTH_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH,
  GROWTH_SCHEDULED_REPORTS_MONTHLY,
  NETWORK_MAILBOXES_PER_BRANCH,
  DEFAULT_GROWTH_TRIAL_DURATION_DAYS,
  BYTES_PER_GIB,
  getCommercialCapacitySnapshot,
  getPackageDefinition,
  readEntitlementPath,
  resolvePackageFromPlanCode,
} = catalogue;
const {
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
  NETWORK_MONTHLY_PER_BRANCH_CENTS,
  BILLING_CURRENCY,
} = require("../src/church/blessBoardBillingCatalogue");
const { DEFAULT_DURATION_DAYS } = require("../src/services/church/churchGrowthTrialService");
const { FOUNDATION_SECOND_ACTIVE_ERROR } = require("../src/services/church/branchActivationPolicyService");
const { getNumericLimit } = require("../src/services/church/churchEntitlementService");

const ROOT = path.join(__dirname, "..");

test("package catalogue is the sole Foundation/Growth/Network capacity source of truth", () => {
  const snap = getCommercialCapacitySnapshot();

  assert.deepEqual([...PACKAGE_CODES], ["foundation", "growth", "network"]);
  assert.equal(FOUNDATION_ACTIVE_BRANCHES, 1);
  assert.equal(FOUNDATION_ACTIVE_MEMBERS, 250);
  assert.equal(FOUNDATION_ADMIN_ACCOUNTS, 10);
  assert.equal(FOUNDATION_STORAGE_BYTES, 2 * BYTES_PER_GIB);
  assert.equal(FOUNDATION_EXTERNAL_EMAILS_MONTHLY, 500);
  assert.equal(FOUNDATION_SCHEDULED_REPORTS_MONTHLY, 0);

  assert.equal(GROWTH_STORAGE_BYTES_BASE, 10 * BYTES_PER_GIB);
  assert.equal(GROWTH_STORAGE_BYTES_PER_ACTIVE_BRANCH, 2 * BYTES_PER_GIB);
  assert.equal(GROWTH_EXTERNAL_EMAILS_MONTHLY_BASE, 5000);
  assert.equal(GROWTH_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH, 1000);
  assert.equal(GROWTH_SCHEDULED_REPORTS_MONTHLY, 20);
  assert.equal(DEFAULT_GROWTH_TRIAL_DURATION_DAYS, 30);
  assert.equal(NETWORK_MAILBOXES_PER_BRANCH, 5);

  const foundation = getPackageDefinition("foundation").entitlements;
  assert.equal(readEntitlementPath(foundation, "branches.max_active"), FOUNDATION_ACTIVE_BRANCHES);
  assert.equal(readEntitlementPath(foundation, "members.max_active"), FOUNDATION_ACTIVE_MEMBERS);
  assert.equal(readEntitlementPath(foundation, "admins.max"), FOUNDATION_ADMIN_ACCOUNTS);
  assert.equal(readEntitlementPath(foundation, "domains.custom"), false);
  assert.equal(readEntitlementPath(foundation, "email.mailboxes_per_branch"), 0);

  const growth = getPackageDefinition("growth").entitlements;
  assert.equal(readEntitlementPath(growth, "reports.cross_branch"), true);
  assert.equal(readEntitlementPath(growth, "domains.custom"), false);
  assert.equal(readEntitlementPath(growth, "email.mailboxes_per_branch"), 0);

  const network = getPackageDefinition("network").entitlements;
  assert.equal(readEntitlementPath(network, "domains.custom"), true);
  assert.equal(readEntitlementPath(network, "email.mailboxes_per_branch"), NETWORK_MAILBOXES_PER_BRANCH);
  assert.equal(readEntitlementPath(network, "integrations.webhooks"), true);
  assert.equal(readEntitlementPath(network, "network.priority_support"), true);

  assert.equal(snap.foundation.activeMembers, FOUNDATION_ACTIVE_MEMBERS);
  assert.equal(snap.growth.scheduledReportsMonthly, GROWTH_SCHEDULED_REPORTS_MONTHLY);
  assert.equal(snap.network.mailboxesPerBranch, NETWORK_MAILBOXES_PER_BRANCH);

  assert.ok(BLESSBOARD_PACKAGES.foundation);
  assert.ok(BLESSBOARD_PACKAGES.growth);
  assert.ok(BLESSBOARD_PACKAGES.network);
});

test("Growth and Network price book are the sole active-branch USD sources", () => {
  assert.equal(BILLING_CURRENCY, "USD");
  assert.equal(GROWTH_MONTHLY_PER_BRANCH_CENTS, 1499);
  assert.equal(NETWORK_MONTHLY_PER_BRANCH_CENTS, 2999);
});

test("legacy plan codes map to Foundation / Growth / Network", () => {
  assert.equal(resolvePackageFromPlanCode("free").packageCode, "foundation");
  assert.equal(resolvePackageFromPlanCode("professional").packageCode, "network");
  assert.equal(resolvePackageFromPlanCode("partner").packageCode, "network");
  assert.equal(resolvePackageFromPlanCode("pro").packageCode, "growth");
});

test("trial default duration and Foundation branch message use the package catalogue", () => {
  assert.equal(DEFAULT_DURATION_DAYS, DEFAULT_GROWTH_TRIAL_DURATION_DAYS);
  assert.equal(DEFAULT_DURATION_DAYS, 30);
  assert.equal(
    FOUNDATION_SECOND_ACTIVE_ERROR,
    "Foundation includes one active branch. Deactivate the existing branch or upgrade to Growth."
  );
  assert.equal(
    readEntitlementPath(getPackageDefinition("foundation").entitlements, "branches.max_active"),
    FOUNDATION_ACTIVE_BRANCHES
  );
});

test("entitlement helpers resolve capacity from the catalogue packages", () => {
  const foundationPlan = {
    packageCode: "foundation",
    entitlements: getPackageDefinition("foundation").entitlements,
  };
  const growthPlan = {
    packageCode: "growth",
    entitlements: getPackageDefinition("growth").entitlements,
  };

  assert.equal(getNumericLimit(foundationPlan, "members.max_active"), FOUNDATION_ACTIVE_MEMBERS);
  assert.equal(getNumericLimit(foundationPlan, "storage.bytes"), FOUNDATION_STORAGE_BYTES);
  assert.equal(getNumericLimit(foundationPlan, "external_emails.monthly"), FOUNDATION_EXTERNAL_EMAILS_MONTHLY);
  assert.equal(getNumericLimit(foundationPlan, "reports.scheduled_monthly"), FOUNDATION_SCHEDULED_REPORTS_MONTHLY);
  assert.equal(
    getNumericLimit(growthPlan, "storage.bytes", { activeBranchCount: 2 }),
    GROWTH_STORAGE_BYTES_BASE + GROWTH_STORAGE_BYTES_PER_ACTIVE_BRANCH * 2
  );
  assert.equal(
    getNumericLimit(growthPlan, "external_emails.monthly", { activeBranchCount: 3 }),
    GROWTH_EXTERNAL_EMAILS_MONTHLY_BASE + GROWTH_EXTERNAL_EMAILS_MONTHLY_PER_ACTIVE_BRANCH * 3
  );
  assert.equal(getNumericLimit(growthPlan, "reports.scheduled_monthly"), GROWTH_SCHEDULED_REPORTS_MONTHLY);
});

test("UI templates do not hardcode Growth trial days or scheduled-report monthly cap", () => {
  const planEjs = fs.readFileSync(
    path.join(ROOT, "views/admin/church/organization_plan.ejs"),
    "utf8"
  );
  const reportsEjs = fs.readFileSync(
    path.join(ROOT, "views/church/branch-admin/scheduled_reports.ejs"),
    "utf8"
  );

  assert.doesNotMatch(planEjs, /30-day Growth trial/);
  assert.match(planEjs, /growthTrialDurationDays/);
  assert.doesNotMatch(reportsEjs, /Maximum 20 scheduled runs/);
  assert.match(reportsEjs, /scheduledReportsMonthlyLimit/);
});

test("trial service and scheduled-report route import catalogue constants", () => {
  const trialSrc = fs.readFileSync(
    path.join(ROOT, "src/services/church/churchGrowthTrialService.js"),
    "utf8"
  );
  const reportsRouteSrc = fs.readFileSync(
    path.join(ROOT, "src/routes/church/branchAdminScheduledReports.js"),
    "utf8"
  );

  assert.match(trialSrc, /DEFAULT_GROWTH_TRIAL_DURATION_DAYS/);
  assert.doesNotMatch(trialSrc, /const DEFAULT_DURATION_DAYS = 30/);
  assert.match(reportsRouteSrc, /GROWTH_SCHEDULED_REPORTS_MONTHLY/);
  assert.match(reportsRouteSrc, /scheduledReportsMonthlyLimit:\s*GROWTH_SCHEDULED_REPORTS_MONTHLY/);
});
