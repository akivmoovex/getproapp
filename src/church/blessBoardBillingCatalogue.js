"use strict";

/**
 * BlessBoard billing commercial constants (readiness layer — no payment provider).
 *
 * Rules:
 * - Foundation: USD 0 (not billed per branch)
 * - Growth: USD 14.99 per active branch per month
 * - Network: USD 29.99 per active branch per month
 * - HQ has no separate charge
 * - Every active branch, including the first, is billable on Growth/Network
 * - Monthly billing in advance; annual option with 15% discount
 * - First partial month supports proration
 */

const GROWTH_PACKAGE_CODE = "growth";
const NETWORK_PACKAGE_CODE = "network";
const FOUNDATION_PACKAGE_CODE = "foundation";
const BILLING_CURRENCY = "USD";
const ACTIVE_BRANCH_ITEM_CODE = "active_branch";

/** USD 14.99 → cents */
const GROWTH_MONTHLY_PER_BRANCH_CENTS = 1499;

/** USD 29.99 → cents */
const NETWORK_MONTHLY_PER_BRANCH_CENTS = 2999;

/** Annual list before discount = 12 × monthly */
const GROWTH_ANNUAL_LIST_PER_BRANCH_CENTS = GROWTH_MONTHLY_PER_BRANCH_CENTS * 12;
const NETWORK_ANNUAL_LIST_PER_BRANCH_CENTS = NETWORK_MONTHLY_PER_BRANCH_CENTS * 12;

/** 15% annual prepay discount in basis points */
const ANNUAL_DISCOUNT_BPS = 1500;

const BILLING_CADENCES = Object.freeze(["monthly", "annual"]);

/**
 * Failed-payment dunning schedule (days after payment_failed_at).
 * Must not run until payment provider is integrated AND billing_dunning_enabled.
 */
const DUNNING_SCHEDULE = Object.freeze([
  { day: 1, state: "notice", label: "Day 1 retry and notice" },
  { day: 3, state: "reminder", label: "Day 3 reminder" },
  { day: 7, state: "final_warning", label: "Day 7 final warning" },
  { day: 14, state: "restricted", label: "Day 14 restricted mode" },
  { day: 30, state: "suspended", label: "Day 30 suspension" },
]);

const COLLECTION_STATES = Object.freeze([
  "ok",
  "notice",
  "reminder",
  "final_warning",
  "restricted",
  "suspended",
]);

/** Paths / capabilities preserved in restricted mode. */
const RESTRICTED_MODE_PRESERVE = Object.freeze([
  "public_website",
  "member_login",
  "billing_access",
  "authorised_exports",
]);

/** Capabilities that may pause in restricted mode. */
const RESTRICTED_MODE_PAUSE = Object.freeze([
  "new_branch_creation",
  "growth_automation",
  "external_messaging",
]);

function annualUnitAmountCents(monthlyCents = GROWTH_MONTHLY_PER_BRANCH_CENTS, discountBps = ANNUAL_DISCOUNT_BPS) {
  const list = monthlyCents * 12;
  const discount = Math.round((list * discountBps) / 10000);
  return list - discount;
}

function defaultPriceBookEntries() {
  return [
    {
      packageCode: GROWTH_PACKAGE_CODE,
      itemCode: ACTIVE_BRANCH_ITEM_CODE,
      label: "Growth active branch",
      currency: BILLING_CURRENCY,
      unitAmountCents: GROWTH_MONTHLY_PER_BRANCH_CENTS,
      billingInterval: "monthly",
      billableUnit: "active_branch",
    },
    {
      packageCode: GROWTH_PACKAGE_CODE,
      itemCode: ACTIVE_BRANCH_ITEM_CODE,
      label: "Growth active branch (annual list)",
      currency: BILLING_CURRENCY,
      unitAmountCents: GROWTH_ANNUAL_LIST_PER_BRANCH_CENTS,
      billingInterval: "annual",
      billableUnit: "active_branch",
    },
    {
      packageCode: NETWORK_PACKAGE_CODE,
      itemCode: ACTIVE_BRANCH_ITEM_CODE,
      label: "Network active branch",
      currency: BILLING_CURRENCY,
      unitAmountCents: NETWORK_MONTHLY_PER_BRANCH_CENTS,
      billingInterval: "monthly",
      billableUnit: "active_branch",
    },
    {
      packageCode: NETWORK_PACKAGE_CODE,
      itemCode: ACTIVE_BRANCH_ITEM_CODE,
      label: "Network active branch (annual list)",
      currency: BILLING_CURRENCY,
      unitAmountCents: NETWORK_ANNUAL_LIST_PER_BRANCH_CENTS,
      billingInterval: "annual",
      billableUnit: "active_branch",
    },
  ];
}

module.exports = {
  FOUNDATION_PACKAGE_CODE,
  GROWTH_PACKAGE_CODE,
  NETWORK_PACKAGE_CODE,
  BILLING_CURRENCY,
  ACTIVE_BRANCH_ITEM_CODE,
  GROWTH_MONTHLY_PER_BRANCH_CENTS,
  NETWORK_MONTHLY_PER_BRANCH_CENTS,
  GROWTH_ANNUAL_LIST_PER_BRANCH_CENTS,
  NETWORK_ANNUAL_LIST_PER_BRANCH_CENTS,
  ANNUAL_DISCOUNT_BPS,
  BILLING_CADENCES,
  DUNNING_SCHEDULE,
  COLLECTION_STATES,
  RESTRICTED_MODE_PRESERVE,
  RESTRICTED_MODE_PAUSE,
  annualUnitAmountCents,
  defaultPriceBookEntries,
};
