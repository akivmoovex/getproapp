"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
  ANNUAL_DISCOUNT_BPS,
  annualUnitAmountCents,
  DUNNING_SCHEDULE,
  RESTRICTED_MODE_PRESERVE,
  RESTRICTED_MODE_PAUSE,
} = require("../src/church/blessBoardBillingCatalogue");
const {
  inclusiveDayCount,
  monthlyPeriodContaining,
  prorateAmountCents,
  applyPercentDiscountCents,
  calculateGrowthDraftInvoice,
  invoiceIdempotencyKey,
  branchBillableOverlap,
  endOfPaidPeriod,
} = require("../src/church/churchBillingCalc");
const churchBillingStateService = require("../src/services/church/churchBillingStateService");
const {
  generateGrowthDraftInvoice,
  captureBillableBranchSnapshot,
  resolveBranchBillingDates,
} = require("../src/services/church/churchBillingInvoiceService");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const organizationsRepo = require("../src/db/pg/church/organizationsRepo");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const { ensureCanonicalTenantsForTests } = require("./helpers/pgTestSeed");
const { TENANT_ZM } = require("../src/tenants/tenantIds");

function makeSuffix(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

test("Growth price book constants and annual discount", () => {
  assert.equal(GROWTH_MONTHLY_PER_BRANCH_CENTS, 1499);
  assert.equal(ANNUAL_DISCOUNT_BPS, 1500);
  const annual = annualUnitAmountCents();
  assert.equal(annual, 1499 * 12 - Math.round((1499 * 12 * 1500) / 10000));
  assert.equal(annual, 15290);
});

test("proration and inclusive day counts", () => {
  assert.equal(inclusiveDayCount("2026-07-01", "2026-07-31"), 31);
  assert.equal(prorateAmountCents(1499, 16, 31), Math.round((1499 * 16) / 31));
  const overlap = branchBillableOverlap(
    "2026-07-01",
    "2026-07-31",
    "2026-07-16T10:00:00.000Z",
    null
  );
  assert.equal(overlap.billableFrom, "2026-07-16");
  assert.equal(overlap.billableTo, "2026-07-31");
  assert.equal(overlap.billableDays, 16);
  assert.equal(overlap.isProrated, true);
});

test("draft invoice: every active branch including first; HQ has no line", () => {
  const calc = calculateGrowthDraftInvoice({
    cadence: "monthly",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    branches: [
      {
        branchId: 1,
        branchName: "Main",
        billingStartedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        branchId: 2,
        branchName: "East",
        billingStartedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  });
  assert.equal(calc.billableBranchCount, 2);
  assert.equal(calc.subtotalCents, 1499 * 2);
  assert.equal(calc.totalCents, 2998);
  assert.equal(calc.paymentStatus, "awaiting_provider");
  assert.equal(calc.status, "draft");
  assert.ok(calc.notes.some((n) => /HQ has no separate charge/i.test(n)));
});

test("draft invoice: first partial month proration", () => {
  const calc = calculateGrowthDraftInvoice({
    cadence: "monthly",
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    branches: [
      {
        branchId: 1,
        billingStartedAt: "2026-07-16T12:00:00.000Z",
      },
    ],
  });
  assert.equal(calc.isProrated, true);
  assert.equal(calc.lines[0].billableDays, 16);
  assert.equal(calc.totalCents, Math.round((1499 * 16) / 31));
});

test("draft invoice: annual 15% discount", () => {
  const calc = calculateGrowthDraftInvoice({
    cadence: "annual",
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
    branches: [
      {
        branchId: 1,
        billingStartedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
  });
  assert.equal(calc.annualDiscountApplied, true);
  assert.equal(calc.subtotalCents, 1499 * 12);
  assert.equal(calc.discountCents, Math.round((1499 * 12 * 1500) / 10000));
  assert.equal(calc.totalCents, annualUnitAmountCents());
});

test("idempotency key is stable per org/period/cadence", () => {
  const a = invoiceIdempotencyKey(42, "monthly", "2026-07-01", "2026-07-31");
  const b = invoiceIdempotencyKey(42, "monthly", "2026-07-01", "2026-07-31");
  const c = invoiceIdempotencyKey(42, "annual", "2026-07-01", "2026-07-31");
  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("deactivation end of paid period uses month end", () => {
  assert.equal(endOfPaidPeriod("monthly", new Date("2026-07-16T10:00:00.000Z")), "2026-07-31");
  assert.equal(endOfPaidPeriod("annual", new Date("2026-07-16T10:00:00.000Z")), "2026-12-31");
});

test("failed-payment dunning schedule is defined but automation stays off", () => {
  assert.equal(DUNNING_SCHEDULE.length, 5);
  assert.equal(DUNNING_SCHEDULE[0].day, 1);
  assert.equal(DUNNING_SCHEDULE[3].state, "restricted");
  assert.equal(DUNNING_SCHEDULE[4].state, "suspended");

  const org = {
    billing_collection_state: "ok",
    billing_dunning_enabled: false,
    billing_payment_provider_enabled: false,
    billing_payment_failed_at: new Date().toISOString(),
  };
  const evalResult = churchBillingStateService.evaluateDunningTransition(org);
  assert.equal(evalResult.advanced, false);

  assert.ok(RESTRICTED_MODE_PRESERVE.includes("public_website"));
  assert.ok(RESTRICTED_MODE_PRESERVE.includes("member_login"));
  assert.ok(RESTRICTED_MODE_PRESERVE.includes("billing_access"));
  assert.ok(RESTRICTED_MODE_PAUSE.includes("new_branch_creation"));

  const restricted = { billing_collection_state: "restricted" };
  assert.equal(churchBillingStateService.mayCreateNewBranch(restricted).allowed, false);
  assert.equal(churchBillingStateService.maySendExternalMessaging(restricted).allowed, false);
  assert.equal(churchBillingStateService.mayAccessBilling(restricted).allowed, true);
  assert.equal(churchBillingStateService.mayMemberLogin(restricted).allowed, true);
});

test("resolveBranchBillingDates sets Growth start/end windows", () => {
  const org = { plan_code: "growth", billing_cadence: "monthly" };
  const activate = resolveBranchBillingDates({}, org, "activate", {
    at: new Date("2026-07-16T00:00:00.000Z"),
  });
  assert.equal(activate.apply, true);
  assert.ok(activate.billing_started_at);
  assert.equal(activate.billing_ends_at, null);

  const deactivate = resolveBranchBillingDates(
    { billing_started_at: activate.billing_started_at },
    org,
    "deactivate",
    { at: new Date("2026-07-16T00:00:00.000Z") }
  );
  assert.equal(deactivate.apply, true);
  assert.match(String(deactivate.billing_ends_at), /^2026-07-31/);

  const foundation = resolveBranchBillingDates({}, { plan_code: "foundation" }, "activate");
  assert.equal(foundation.apply, false);
});

test("applyPercentDiscountCents helper", () => {
  const r = applyPercentDiscountCents(10000, 1500);
  assert.equal(r.discountCents, 1500);
  assert.equal(r.totalAfterDiscountCents, 8500);
});

test("monthlyPeriodContaining uses UTC calendar month", () => {
  const p = monthlyPeriodContaining(new Date("2026-07-16T15:00:00.000Z"));
  assert.equal(p.periodStart, "2026-07-01");
  assert.equal(p.periodEnd, "2026-07-31");
});

test(
  "active-branch snapshots and draft invoice idempotency",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureCanonicalTenantsForTests(pool);
    await ensureChurchSchema(pool);
    const suffix = makeSuffix("bill");

    const org = await organizationsRepo.createOrganization(pool, {
      platform_tenant_id: TENANT_ZM,
      slug: `bill_${suffix}`,
      name: `Billing ${suffix}`,
      status: "active",
    });
    await organizationsRepo.updateOrganizationPlan(pool, org.id, { plan_code: "growth" }, null);

    const branchA = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `main-${suffix}`.slice(0, 40),
      host_slug: `main-${suffix}`.slice(0, 40),
      name: "Main",
      status: "active",
      billing_ready: true,
    });
    const branchB = await branchesRepo.createBranch(pool, {
      organization_id: org.id,
      slug: `east-${suffix}`.slice(0, 40),
      host_slug: `east-${suffix}`.slice(0, 40),
      name: "East",
      status: "active",
      billing_ready: true,
    });

    await pool.query(
      `UPDATE public.church_branches
       SET billing_started_at = $2, billing_ends_at = NULL
       WHERE id = ANY($1::int[])`,
      [[branchA.id, branchB.id], "2026-07-01T00:00:00.000Z"]
    );

    const snap = await captureBillableBranchSnapshot(pool, org.id, {
      cadence: "monthly",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
      persist: true,
    });
    assert.equal(snap.calculation.billableBranchCount, 2);
    assert.equal(snap.snapshots.length, 2);
    assert.equal(snap.calculation.totalCents, 2980);

    const first = await generateGrowthDraftInvoice(pool, org.id, {
      cadence: "monthly",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
    assert.equal(first.created, true);
    assert.equal(first.invoice.payment_status, "awaiting_provider");
    assert.notEqual(first.invoice.payment_status, "succeeded");
    assert.equal(Number(first.invoice.total_cents), 2980);

    const second = await generateGrowthDraftInvoice(pool, org.id, {
      cadence: "monthly",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
    assert.equal(second.created, false);
    assert.equal(second.idempotent, true);
    assert.equal(Number(second.invoice.id), Number(first.invoice.id));
  }
);
