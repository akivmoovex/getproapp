"use strict";

const {
  DEFAULT_SP_RATING_LOW_THRESHOLD,
  DEFAULT_SP_RATING_HIGH_THRESHOLD,
} = require("./normalizeSpRatingThresholds");

/**
 * Read-only derived payable layer for SP_Commission (30d) from rolling SP_Rating (30d).
 * Does not change earned commission; no persistence.
 *
 * @param {{
 *   earnedSpCommission30: number,
 *   avgRating30: number | null,
 *   bonusPercent?: number | null,
 *   lowThreshold?: number,
 *   highThreshold?: number,
 * }} input
 * @returns {{
 *   earnedSpCommission30: number,
 *   highRatingBonusSpCommission30: number,
 *   payableSpCommission30: number,
 *   qualityAdjustmentSpCommission30: number,
 *   withheldSpCommission30: number,
 *   qualityEligibilityLabel: string,
 * }}
 */
function computeSpCommissionQualityPayable(input) {
  const raw = input && input.earnedSpCommission30;
  const earned =
    raw != null && Number.isFinite(Number(raw)) ? Math.round(Number(raw) * 100) / 100 : 0;
  const bpRaw = input && input.bonusPercent;
  const bonusPct =
    bpRaw != null && Number.isFinite(Number(bpRaw)) ? Math.min(100, Math.max(0, Number(bpRaw))) : 0;
  const lowTh =
    input && input.lowThreshold != null && Number.isFinite(Number(input.lowThreshold))
      ? Number(input.lowThreshold)
      : DEFAULT_SP_RATING_LOW_THRESHOLD;
  const highTh =
    input && input.highThreshold != null && Number.isFinite(Number(input.highThreshold))
      ? Number(input.highThreshold)
      : DEFAULT_SP_RATING_HIGH_THRESHOLD;
  const avg = input && input.avgRating30;
  const hasRating = avg != null && Number.isFinite(Number(avg));
  const rating = hasRating ? Number(avg) : null;

  if (!hasRating) {
    return {
      earnedSpCommission30: earned,
      highRatingBonusSpCommission30: 0,
      payableSpCommission30: earned,
      qualityAdjustmentSpCommission30: 0,
      withheldSpCommission30: 0,
      qualityEligibilityLabel: "No quality adjustment this period",
    };
  }

  if (rating < lowTh) {
    return {
      earnedSpCommission30: earned,
      highRatingBonusSpCommission30: 0,
      payableSpCommission30: 0,
      qualityAdjustmentSpCommission30: Math.round(-earned * 100) / 100,
      withheldSpCommission30: earned,
      qualityEligibilityLabel: "Withheld pending quality",
    };
  }

  let highRatingBonus = 0;
  if (rating >= highTh) {
    highRatingBonus = Math.round(earned * (bonusPct / 100) * 100) / 100;
  }

  const withheld = 0;
  const payable = Math.round((earned + highRatingBonus - withheld) * 100) / 100;

  return {
    earnedSpCommission30: earned,
    highRatingBonusSpCommission30: highRatingBonus,
    payableSpCommission30: payable,
    qualityAdjustmentSpCommission30: 0,
    withheldSpCommission30: withheld,
    qualityEligibilityLabel: "Eligible this period",
  };
}

/**
 * @param {number} amount
 * @param {string} [currencySymbol]
 * @param {string} [currencyCode]
 */
function formatFieldAgentMoneyAmount(amount, currencySymbol, currencyCode) {
  const n = amount != null && Number.isFinite(Number(amount)) ? Math.round(Number(amount) * 100) / 100 : 0;
  const neg = n < 0;
  const absStr = Math.abs(n).toFixed(2);
  const sym = currencySymbol != null && String(currencySymbol).trim() ? String(currencySymbol).trim() : "";
  if (sym) return `${neg ? "-" : ""}${sym} ${absStr}`;
  const code = currencyCode != null && String(currencyCode).trim() ? String(currencyCode).trim() : "";
  if (code) return `${neg ? "-" : ""}${code} ${absStr}`;
  return `${neg ? "-" : ""}${absStr}`;
}

module.exports = {
  LOW_RATING_THRESHOLD: DEFAULT_SP_RATING_LOW_THRESHOLD,
  HIGH_RATING_THRESHOLD: DEFAULT_SP_RATING_HIGH_THRESHOLD,
  computeSpCommissionQualityPayable,
  formatFieldAgentMoneyAmount,
};
