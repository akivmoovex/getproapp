"use strict";

const clientIntake = require("../intake/clientProjectIntake");
const tenantCommerceSettingsRepo = require("../db/pg/tenantCommerceSettingsRepo");

const DEFAULTS = {
  currency: "ZMW",
  deal_price_percentage: 3,
  minimum_credit_balance: 0,
  starting_credit_balance: 250,
  minimum_review_rating: 3,
};

/**
 * Normalized commerce settings; never null. Uses DB row when present, else safe defaults.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function getCommerceSettingsForTenant(pool, tenantId) {
  const row = await tenantCommerceSettingsRepo.getByTenantId(pool, tenantId);
  return normalizeCommerceRow(row);
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function normalizeCommerceRow(row) {
  const currency =
    row && row.currency != null && String(row.currency).trim()
      ? String(row.currency).trim().slice(0, 12)
      : DEFAULTS.currency;
  const deal_price_percentage = pickNum(row && row.deal_price_percentage, DEFAULTS.deal_price_percentage);
  const minimum_credit_balance = pickNum(row && row.minimum_credit_balance, DEFAULTS.minimum_credit_balance);
  const starting_credit_balance = pickNum(row && row.starting_credit_balance, DEFAULTS.starting_credit_balance);
  const minimum_review_rating = pickNum(row && row.minimum_review_rating, DEFAULTS.minimum_review_rating);
  return {
    currency,
    deal_price_percentage,
    minimum_credit_balance,
    starting_credit_balance,
    minimum_review_rating,
  };
}

function pickNum(raw, fallback) {
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Budget display meta for portals: slug-based label + tenant currency code.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function getBudgetDisplayMetaForTenant(pool, tenantId) {
  const slugMeta = await clientIntake.getBudgetMetaForTenantWithStore(pool, tenantId);
  const cs = await getCommerceSettingsForTenant(pool, tenantId);
  const code = cs.currency || slugMeta.code || "ZMW";
  const up = String(code).toUpperCase();
  let displayPrefix = slugMeta.displayPrefix;
  if (up === "ZMW") {
    displayPrefix = "K";
  } else if (up !== String(slugMeta.code || "").toUpperCase()) {
    displayPrefix = up.length <= 6 ? up : up.slice(0, 6);
  }
  return {
    ...slugMeta,
    code,
    displayPrefix,
  };
}

/**
 * Intake allocation: allow provisional / no-avg paths; only enforce floor when an average exists.
 * @param {number|null|undefined} avgRating
 * @param {number} minReview
 */
function passesMinimumReviewRatingForAllocation(avgRating, minReview) {
  const m = Number(minReview);
  if (!Number.isFinite(m)) return true;
  const avg = avgRating != null && Number.isFinite(Number(avgRating)) ? Number(avgRating) : null;
  if (avg == null) return true;
  return avg >= m;
}

/**
 * Deal-validated random offer: require a measured average at or above the tenant minimum.
 * @param {number|null|undefined} avgRating
 * @param {number} minReview
 */
function passesMinimumReviewRatingForDealValidatedOffer(avgRating, minReview) {
  const m = Number(minReview);
  if (!Number.isFinite(m)) return false;
  const avg = avgRating != null && Number.isFinite(Number(avgRating)) ? Number(avgRating) : null;
  if (avg == null) return false;
  return avg >= m;
}

/**
 * Credit check: balance minus deal price must stay at or above the tenant minimum.
 * @param {number} balance
 * @param {number|null|undefined} dealPrice
 * @param {number} minimumCreditBalance
 */
function creditBalanceOkForDealOffer(balance, dealPrice, minimumCreditBalance) {
  const b = Number(balance);
  const dp = dealPrice != null && Number.isFinite(Number(dealPrice)) ? Number(dealPrice) : 0;
  const floor = Number(minimumCreditBalance);
  if (!Number.isFinite(b)) return false;
  const mc = Number.isFinite(floor) ? floor : 0;
  return b - dp >= mc;
}

module.exports = {
  DEFAULTS,
  getCommerceSettingsForTenant,
  normalizeCommerceRow,
  getBudgetDisplayMetaForTenant,
  passesMinimumReviewRatingForAllocation,
  passesMinimumReviewRatingForDealValidatedOffer,
  creditBalanceOkForDealOffer,
};
