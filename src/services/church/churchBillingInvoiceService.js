"use strict";

/**
 * Growth billing readiness — draft invoices, snapshots, no payment collection.
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const churchBillingRepo = require("../../db/pg/church/churchBillingRepo");
const {
  GROWTH_PACKAGE_CODE,
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
  ANNUAL_DISCOUNT_BPS,
} = require("../../church/blessBoardBillingCatalogue");
const {
  periodForCadence,
  calculateGrowthDraftInvoice,
  invoiceIdempotencyKey,
  snapshotKeyForInvoice,
  endOfPaidPeriod,
  formatUtcDate,
} = require("../../church/churchBillingCalc");
const { resolvePackageFromPlanCode } = require("../../church/blessBoardPackageCatalogue");

/**
 * Capture billable active-branch snapshot rows for an organisation period (in memory + optional persist).
 */
async function captureBillableBranchSnapshot(db, organizationId, opts = {}) {
  const org = await organizationsRepo.findOrganizationById(db, organizationId);
  if (!org) {
    const err = new Error("Organisation not found");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  const cadence = opts.cadence || org.billing_cadence || "monthly";
  const period =
    opts.periodStart && opts.periodEnd
      ? { periodStart: opts.periodStart, periodEnd: opts.periodEnd, cadence }
      : periodForCadence(cadence, opts.at instanceof Date ? opts.at : new Date());

  const branches = await churchBillingRepo.listBillableBranchesForOrganization(
    db,
    organizationId,
    period.periodStart,
    period.periodEnd
  );

  const calc = calculateGrowthDraftInvoice({
    cadence: period.cadence,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    monthlyUnitCents: opts.monthlyUnitCents || GROWTH_MONTHLY_PER_BRANCH_CENTS,
    annualDiscountBps: opts.annualDiscountBps != null ? opts.annualDiscountBps : ANNUAL_DISCOUNT_BPS,
    branches: branches.map((b) => ({
      branchId: b.id,
      branchSlug: b.slug,
      branchName: b.name,
      billingStartedAt: b.billing_started_at,
      billingEndsAt: b.billing_ends_at,
    })),
  });

  const snapKey =
    opts.snapshotKey ||
    snapshotKeyForInvoice(organizationId, period.cadence, period.periodStart, period.periodEnd);

  let periodRow = null;
  let persisted = [];
  if (opts.persist) {
    periodRow = await churchBillingRepo.ensureBillingPeriod(
      db,
      organizationId,
      period.cadence,
      period.periodStart,
      period.periodEnd
    );
    persisted = await churchBillingRepo.replaceBranchSnapshots(
      db,
      organizationId,
      snapKey,
      periodRow.id,
      calc.lines.map((line) => {
        const src = branches.find((b) => Number(b.id) === Number(line.branchId));
        return {
          branchId: line.branchId,
          branchSlug: line.branchSlug,
          branchName: line.branchName,
          billingStartedAt: src && src.billing_started_at,
          billingEndsAt: src && src.billing_ends_at,
          billableFrom: line.billableFrom,
          billableTo: line.billableTo,
          billableDays: line.billableDays,
          periodDays: line.periodDays,
          isProrated: line.isProrated,
          unitAmountCents: line.unitAmountCents,
          lineAmountCents: line.lineAmountCents,
          currency: line.currency,
        };
      })
    );
  }

  return {
    organizationId,
    packageCode: resolvePackageFromPlanCode(org.plan_code).packageCode,
    cadence: period.cadence,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    snapshotKey: snapKey,
    branches,
    calculation: calc,
    period: periodRow,
    snapshots: persisted,
  };
}

/**
 * Idempotent draft invoice generation for Growth.
 * Foundation orgs → null calculation (not billed).
 * Never marks payment as succeeded.
 */
async function generateGrowthDraftInvoice(db, organizationId, opts = {}) {
  const org = await organizationsRepo.findOrganizationById(db, organizationId);
  if (!org) {
    const err = new Error("Organisation not found");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }

  const resolved = resolvePackageFromPlanCode(org.plan_code);
  if (resolved.packageCode !== GROWTH_PACKAGE_CODE) {
    return {
      skipped: true,
      reason: "Draft invoices apply to Growth organisations only.",
      packageCode: resolved.packageCode,
    };
  }

  const cadence = opts.cadence || org.billing_cadence || "monthly";
  const period =
    opts.periodStart && opts.periodEnd
      ? { periodStart: opts.periodStart, periodEnd: opts.periodEnd, cadence }
      : periodForCadence(cadence, opts.at instanceof Date ? opts.at : new Date());

  const idempotencyKey =
    opts.idempotencyKey ||
    invoiceIdempotencyKey(organizationId, period.cadence, period.periodStart, period.periodEnd);

  const existing = await churchBillingRepo.findInvoiceByIdempotencyKey(db, idempotencyKey);
  if (existing) {
    return {
      created: false,
      idempotent: true,
      invoice: existing,
      packageCode: GROWTH_PACKAGE_CODE,
    };
  }

  const discountsDb = await churchBillingRepo.listActiveDiscounts(db, organizationId);
  const creditsDb = await churchBillingRepo.listOpenCredits(db, organizationId);
  const creditCents = creditsDb.reduce((s, c) => s + Number(c.remaining_cents || 0), 0);
  const discounts = discountsDb.map((d) => ({
    type: d.discount_type === "fixed" ? "fixed" : "percent",
    percentBps: d.percent_bps,
    amountCents: d.amount_cents,
    label: d.label,
  }));

  const snap = await captureBillableBranchSnapshot(db, organizationId, {
    cadence: period.cadence,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    monthlyUnitCents: opts.monthlyUnitCents,
    annualDiscountBps: opts.annualDiscountBps,
    persist: true,
    snapshotKey: snapshotKeyForInvoice(
      organizationId,
      period.cadence,
      period.periodStart,
      period.periodEnd
    ),
  });

  // Recompute with credits/discounts
  const calc = calculateGrowthDraftInvoice({
    cadence: period.cadence,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    monthlyUnitCents: opts.monthlyUnitCents || GROWTH_MONTHLY_PER_BRANCH_CENTS,
    annualDiscountBps: opts.annualDiscountBps != null ? opts.annualDiscountBps : ANNUAL_DISCOUNT_BPS,
    creditCents,
    discounts,
    branches: snap.branches.map((b) => ({
      branchId: b.id,
      branchSlug: b.slug,
      branchName: b.name,
      billingStartedAt: b.billing_started_at,
      billingEndsAt: b.billing_ends_at,
    })),
  });

  try {
    const invoice = await churchBillingRepo.insertDraftInvoice(db, {
      organization_id: organizationId,
      billing_period_id: snap.period && snap.period.id,
      idempotency_key: idempotencyKey,
      cadence: period.cadence,
      period_start: period.periodStart,
      period_end: period.periodEnd,
      currency: calc.currency,
      subtotal_cents: calc.subtotalCents,
      discount_cents: calc.discountCents,
      credit_cents: calc.creditCents,
      tax_cents: calc.taxCents,
      total_cents: calc.totalCents,
      annual_discount_applied: calc.annualDiscountApplied,
      annual_discount_bps: calc.annualDiscountBps,
      is_prorated: calc.isProrated,
      billable_branch_count: calc.billableBranchCount,
      snapshot_key: snap.snapshotKey,
      line_items_json: calc.lines,
      calculation_json: {
        notes: calc.notes,
        payment_status: "awaiting_provider",
        hq_charge: 0,
        every_active_branch_billable: true,
      },
    });

    return {
      created: true,
      idempotent: false,
      invoice,
      calculation: calc,
      snapshot: snap,
      packageCode: GROWTH_PACKAGE_CODE,
    };
  } catch (err) {
    // Concurrent insert races → return existing (idempotent).
    if (err && (err.code === "23505" || /unique/i.test(String(err.message || "")))) {
      const raced = await churchBillingRepo.findInvoiceByIdempotencyKey(db, idempotencyKey);
      if (raced) {
        return {
          created: false,
          idempotent: true,
          invoice: raced,
          packageCode: GROWTH_PACKAGE_CODE,
        };
      }
    }
    throw err;
  }
}

/**
 * Apply Growth billing start/end dates around activate/deactivate.
 * @param {object} branch
 * @param {object} organization
 * @param {'activate'|'deactivate'} action
 * @param {{ at?: Date }} [opts]
 */
function resolveBranchBillingDates(branch, organization, action, opts = {}) {
  const resolved = resolvePackageFromPlanCode(organization && organization.plan_code);
  const at = opts.at instanceof Date ? opts.at : new Date();
  if (resolved.packageCode !== GROWTH_PACKAGE_CODE) {
    return { apply: false, packageCode: resolved.packageCode };
  }

  if (action === "activate") {
    return {
      apply: true,
      packageCode: GROWTH_PACKAGE_CODE,
      billing_started_at: branch.billing_started_at || at,
      billing_ends_at: null,
    };
  }

  if (action === "deactivate") {
    const cadence = (organization && organization.billing_cadence) || "monthly";
    return {
      apply: true,
      packageCode: GROWTH_PACKAGE_CODE,
      billing_ends_at: formatUtcDate(endOfPaidPeriod(cadence, at)) + "T23:59:59.999Z",
    };
  }

  return { apply: false, packageCode: resolved.packageCode };
}

module.exports = {
  captureBillableBranchSnapshot,
  generateGrowthDraftInvoice,
  resolveBranchBillingDates,
};
