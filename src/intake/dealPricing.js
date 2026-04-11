"use strict";

const { DEFAULTS } = require("../tenants/tenantCommerceSettings");

/**
 * Deal fee: `deal_price_percentage`% of internal price estimation (CSR / admin only).
 * @param {number|null|undefined} priceEstimation
 * @param {number|null|undefined} [dealPricePercentage] percent points (e.g. 3 → 3%); defaults to tenant default.
 * @returns {number|null}
 */
function computeDealPriceFromEstimation(priceEstimation, dealPricePercentage) {
  if (priceEstimation == null || priceEstimation === "") return null;
  const n = Number(priceEstimation);
  if (!Number.isFinite(n) || n < 0) return null;
  const pct =
    dealPricePercentage != null && Number.isFinite(Number(dealPricePercentage))
      ? Number(dealPricePercentage)
      : DEFAULTS.deal_price_percentage;
  return Math.round(n * (pct / 100) * 100) / 100;
}

module.exports = { computeDealPriceFromEstimation };
