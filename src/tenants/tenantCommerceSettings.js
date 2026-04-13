"use strict";

const clientIntake = require("../intake/clientProjectIntake");
const tenantCommerceSettingsRepo = require("../db/pg/tenantCommerceSettingsRepo");

const DEFAULTS = {
  currency: "ZMW",
  currency_name: "",
  currency_symbol: "",
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
function pickNullablePercent(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function normalizeCommerceRow(row) {
  const currency =
    row && row.currency != null && String(row.currency).trim()
      ? String(row.currency).trim().slice(0, 12)
      : DEFAULTS.currency;
  const currency_name = pickStr(row && row.currency_name, 80, DEFAULTS.currency_name);
  const currency_symbol = pickStr(row && row.currency_symbol, 16, DEFAULTS.currency_symbol);
  const deal_price_percentage = pickNum(row && row.deal_price_percentage, DEFAULTS.deal_price_percentage);
  const minimum_credit_balance = pickNum(row && row.minimum_credit_balance, DEFAULTS.minimum_credit_balance);
  const starting_credit_balance = pickNum(row && row.starting_credit_balance, DEFAULTS.starting_credit_balance);
  const minimum_review_rating = pickNum(row && row.minimum_review_rating, DEFAULTS.minimum_review_rating);
  const field_agent_sp_commission_percent = pickNullablePercent(row && row.field_agent_sp_commission_percent);
  const field_agent_ec_commission_percent = pickNullablePercent(row && row.field_agent_ec_commission_percent);
  const field_agent_sp_high_rating_bonus_percent = pickNullablePercent(row && row.field_agent_sp_high_rating_bonus_percent);
  const field_agent_sp_rating_low_threshold = pickNullablePercent(row && row.field_agent_sp_rating_low_threshold);
  const field_agent_sp_rating_high_threshold = pickNullablePercent(row && row.field_agent_sp_rating_high_threshold);
  return {
    currency,
    currency_name,
    currency_symbol,
    deal_price_percentage,
    minimum_credit_balance,
    starting_credit_balance,
    minimum_review_rating,
    field_agent_sp_commission_percent,
    field_agent_ec_commission_percent,
    field_agent_sp_high_rating_bonus_percent,
    field_agent_sp_rating_low_threshold,
    field_agent_sp_rating_high_threshold,
  };
}

function pickStr(raw, maxLen, fallback) {
  if (raw == null) return fallback;
  const s = String(raw).trim();
  if (!s) return fallback;
  return s.slice(0, maxLen);
}

/**
 * Uppercase currency code for admin UI and messages (e.g. ZMW, USD).
 * @param {{ currency?: string }|null|undefined} cs
 */
function commerceCurrencyCodeUpper(cs) {
  const c =
    cs && cs.currency != null && String(cs.currency).trim()
      ? String(cs.currency).trim()
      : DEFAULTS.currency;
  return c.toUpperCase();
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
  if (cs.currency_symbol && String(cs.currency_symbol).trim()) {
    displayPrefix = String(cs.currency_symbol).trim().slice(0, 16);
  } else if (up === "ZMW") {
    displayPrefix = "K";
  } else if (up !== String(slugMeta.code || "").toUpperCase()) {
    displayPrefix = up.length <= 6 ? up : up.slice(0, 6);
  }
  let label = slugMeta.label;
  if (cs.currency_name && String(cs.currency_name).trim()) {
    label = String(cs.currency_name).trim().slice(0, 80);
  }
  return {
    ...slugMeta,
    code,
    displayPrefix,
    label,
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
  pickNullablePercent,
  commerceCurrencyCodeUpper,
  getBudgetDisplayMetaForTenant,
  passesMinimumReviewRatingForAllocation,
  passesMinimumReviewRatingForDealValidatedOffer,
  creditBalanceOkForDealOffer,
};
