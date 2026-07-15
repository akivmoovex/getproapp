"use strict";

/**
 * Pure Growth billing calculations (no DB, no payment provider).
 */

const {
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
  ANNUAL_DISCOUNT_BPS,
  annualUnitAmountCents,
  BILLING_CURRENCY,
} = require("../church/blessBoardBillingCatalogue");

/**
 * Inclusive calendar-day count between two Date-like values (UTC date parts).
 * @param {Date|string} from
 * @param {Date|string} to
 */
function inclusiveDayCount(from, to) {
  const a = toUtcDateOnly(from);
  const b = toUtcDateOnly(to);
  if (b < a) return 0;
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / 86400000) + 1;
}

function toUtcDateOnly(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split("-").map((n) => Number(n));
  return new Date(Date.UTC(y, m - 1, d));
}

function formatUtcDate(date) {
  const d = toUtcDateOnly(date);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Build monthly period containing `at` (UTC calendar month). Billing in advance
 * uses the period that starts on the 1st.
 */
function monthlyPeriodContaining(at = new Date()) {
  const d = toUtcDateOnly(at);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { periodStart: formatUtcDate(start), periodEnd: formatUtcDate(end), cadence: "monthly" };
}

/**
 * Build annual period starting Jan 1 of the year containing `at` (UTC).
 */
function annualPeriodContaining(at = new Date()) {
  const d = toUtcDateOnly(at);
  const start = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), 11, 31));
  return { periodStart: formatUtcDate(start), periodEnd: formatUtcDate(end), cadence: "annual" };
}

function periodForCadence(cadence, at = new Date()) {
  return cadence === "annual" ? annualPeriodContaining(at) : monthlyPeriodContaining(at);
}

/**
 * End of the paid period for deactivation (stops future billing after this date).
 */
function endOfPaidPeriod(cadence, at = new Date()) {
  const p = periodForCadence(cadence || "monthly", at);
  return p.periodEnd;
}

/**
 * Overlap of branch billable window with invoice period (inclusive dates).
 * @returns {{ billableFrom: string, billableTo: string, billableDays: number, periodDays: number, isProrated: boolean } | null}
 */
function branchBillableOverlap(periodStart, periodEnd, billingStartedAt, billingEndsAt) {
  const periodDays = inclusiveDayCount(periodStart, periodEnd);
  if (periodDays <= 0) return null;

  const started = billingStartedAt ? formatUtcDate(billingStartedAt) : null;
  if (!started) return null;

  let from = started > periodStart ? started : periodStart;
  let to = periodEnd;
  if (billingEndsAt) {
    const ends = formatUtcDate(billingEndsAt);
    if (ends < from) return null;
    if (ends < to) to = ends;
  }
  if (to < from) return null;

  const billableDays = inclusiveDayCount(from, to);
  if (billableDays <= 0) return null;

  return {
    billableFrom: from,
    billableTo: to,
    billableDays,
    periodDays,
    isProrated: billableDays < periodDays,
  };
}

/**
 * Prorate unit amount by billable days / period days (round half up).
 */
function prorateAmountCents(unitAmountCents, billableDays, periodDays) {
  const unit = Math.max(0, Math.floor(Number(unitAmountCents) || 0));
  const days = Math.max(0, Math.floor(Number(billableDays) || 0));
  const period = Math.max(1, Math.floor(Number(periodDays) || 1));
  if (days >= period) return unit;
  return Math.round((unit * days) / period);
}

/**
 * Apply percent discount in basis points to a subtotal.
 */
function applyPercentDiscountCents(subtotalCents, discountBps) {
  const sub = Math.max(0, Math.floor(Number(subtotalCents) || 0));
  const bps = Math.max(0, Math.floor(Number(discountBps) || 0));
  const discount = Math.round((sub * bps) / 10000);
  return { discountCents: discount, totalAfterDiscountCents: Math.max(0, sub - discount) };
}

/**
 * Calculate draft Growth invoice from branch rows.
 *
 * @param {object} opts
 * @param {'monthly'|'annual'} opts.cadence
 * @param {string} opts.periodStart YYYY-MM-DD
 * @param {string} opts.periodEnd YYYY-MM-DD
 * @param {Array<{ branchId: number, branchSlug?: string, branchName?: string, billingStartedAt: Date|string, billingEndsAt?: Date|string|null }>} opts.branches
 * @param {number} [opts.monthlyUnitCents]
 * @param {number} [opts.annualDiscountBps]
 * @param {number} [opts.creditCents]
 * @param {Array<{ type: 'percent'|'fixed', percentBps?: number, amountCents?: number, label?: string }>} [opts.discounts]
 */
function calculateGrowthDraftInvoice(opts) {
  const cadence = opts.cadence === "annual" ? "annual" : "monthly";
  const periodStart = formatUtcDate(opts.periodStart);
  const periodEnd = formatUtcDate(opts.periodEnd);
  const monthlyUnit = opts.monthlyUnitCents != null
    ? Number(opts.monthlyUnitCents)
    : GROWTH_MONTHLY_PER_BRANCH_CENTS;
  const annualDiscountBps =
    opts.annualDiscountBps != null ? Number(opts.annualDiscountBps) : ANNUAL_DISCOUNT_BPS;

  const unitAmountCents =
    cadence === "annual"
      ? annualUnitAmountCents(monthlyUnit, 0) // list before annual discount; discount applied below
      : monthlyUnit;

  const periodDays = inclusiveDayCount(periodStart, periodEnd);
  const lines = [];
  let anyProration = false;

  for (const branch of opts.branches || []) {
    const overlap = branchBillableOverlap(
      periodStart,
      periodEnd,
      branch.billingStartedAt,
      branch.billingEndsAt
    );
    if (!overlap) continue;

    const lineAmount = prorateAmountCents(
      unitAmountCents,
      overlap.billableDays,
      overlap.periodDays
    );
    if (overlap.isProrated) anyProration = true;

    lines.push({
      branchId: branch.branchId,
      branchSlug: branch.branchSlug || null,
      branchName: branch.branchName || null,
      itemCode: "active_branch",
      currency: BILLING_CURRENCY,
      unitAmountCents,
      billableFrom: overlap.billableFrom,
      billableTo: overlap.billableTo,
      billableDays: overlap.billableDays,
      periodDays: overlap.periodDays,
      isProrated: overlap.isProrated,
      lineAmountCents: lineAmount,
      description:
        cadence === "annual"
          ? "Growth active branch (annual list)"
          : "Growth active branch (monthly)",
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + l.lineAmountCents, 0);

  let discountCents = 0;
  let annualDiscountApplied = false;
  if (cadence === "annual" && annualDiscountBps > 0 && subtotalCents > 0) {
    const applied = applyPercentDiscountCents(subtotalCents, annualDiscountBps);
    discountCents += applied.discountCents;
    annualDiscountApplied = applied.discountCents > 0;
  }

  for (const d of opts.discounts || []) {
    if (d.type === "percent" && d.percentBps) {
      discountCents += applyPercentDiscountCents(subtotalCents, d.percentBps).discountCents;
    } else if (d.type === "fixed" && d.amountCents) {
      discountCents += Math.max(0, Math.floor(Number(d.amountCents) || 0));
    }
  }
  discountCents = Math.min(discountCents, subtotalCents);

  const creditCents = Math.max(0, Math.floor(Number(opts.creditCents) || 0));
  const afterDiscount = Math.max(0, subtotalCents - discountCents);
  const appliedCredit = Math.min(creditCents, afterDiscount);
  const taxCents = Math.max(0, Math.floor(Number(opts.taxCents) || 0));
  const totalCents = Math.max(0, afterDiscount - appliedCredit + taxCents);

  return {
    cadence,
    periodStart,
    periodEnd,
    periodDays,
    currency: BILLING_CURRENCY,
    monthlyUnitCents: monthlyUnit,
    unitAmountCents,
    annualDiscountBps: cadence === "annual" ? annualDiscountBps : 0,
    annualDiscountApplied,
    isProrated: anyProration,
    billableBranchCount: lines.length,
    lines,
    subtotalCents,
    discountCents,
    creditCents: appliedCredit,
    taxCents,
    totalCents,
    paymentStatus: "awaiting_provider",
    status: "draft",
    notes: [
      "HQ has no separate charge.",
      "Every active branch, including the first, is billable.",
      "Draft only — no payment collected.",
    ],
  };
}

/**
 * Stable idempotency key for draft invoice generation.
 */
function invoiceIdempotencyKey(organizationId, cadence, periodStart, periodEnd) {
  return `growth-draft:org:${Number(organizationId)}:${cadence}:${periodStart}:${periodEnd}`;
}

/**
 * Snapshot key tied to the same generation identity.
 */
function snapshotKeyForInvoice(organizationId, cadence, periodStart, periodEnd) {
  return `snap:${invoiceIdempotencyKey(organizationId, cadence, periodStart, periodEnd)}`;
}

module.exports = {
  inclusiveDayCount,
  toUtcDateOnly,
  formatUtcDate,
  monthlyPeriodContaining,
  annualPeriodContaining,
  periodForCadence,
  endOfPaidPeriod,
  branchBillableOverlap,
  prorateAmountCents,
  applyPercentDiscountCents,
  calculateGrowthDraftInvoice,
  invoiceIdempotencyKey,
  snapshotKeyForInvoice,
};
