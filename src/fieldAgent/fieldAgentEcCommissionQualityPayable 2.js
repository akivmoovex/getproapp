"use strict";

const { DEFAULT_SP_RATING_LOW_THRESHOLD } = require("./normalizeSpRatingThresholds");

/**
 * Read-only derived payable layer for EC_Commission (30d): holdback when SP_Rating (30d) is below
 * the tenant low threshold only. No bonus. Does not change earned EC; no persistence.
 *
 * @param {{
 *   earnedEcCommission30: number,
 *   avgRating30: number | null,
 *   lowThreshold?: number,
 * }} input
 * @returns {{
 *   earnedEcCommission30: number,
 *   payableEcCommission30: number,
 *   withheldEcCommission30: number,
 *   qualityEligibilityLabel: string,
 * }}
 */
function computeEcCommissionQualityPayableHoldbackOnly(input) {
  const raw = input && input.earnedEcCommission30;
  const earned =
    raw != null && Number.isFinite(Number(raw)) ? Math.round(Number(raw) * 100) / 100 : 0;
  const lowTh =
    input && input.lowThreshold != null && Number.isFinite(Number(input.lowThreshold))
      ? Number(input.lowThreshold)
      : DEFAULT_SP_RATING_LOW_THRESHOLD;
  const avg = input && input.avgRating30;
  const hasRating = avg != null && Number.isFinite(Number(avg));
  const rating = hasRating ? Number(avg) : null;

  if (!hasRating) {
    return {
      earnedEcCommission30: earned,
      payableEcCommission30: earned,
      withheldEcCommission30: 0,
      qualityEligibilityLabel: "No quality adjustment this period",
    };
  }

  if (rating < lowTh) {
    return {
      earnedEcCommission30: earned,
      payableEcCommission30: 0,
      withheldEcCommission30: earned,
      qualityEligibilityLabel: "Withheld pending quality",
    };
  }

  return {
    earnedEcCommission30: earned,
    payableEcCommission30: earned,
    withheldEcCommission30: 0,
    qualityEligibilityLabel: "Eligible this period",
  };
}

module.exports = {
  computeEcCommissionQualityPayableHoldbackOnly,
};
