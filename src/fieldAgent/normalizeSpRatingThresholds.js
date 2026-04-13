"use strict";

/** Runtime defaults when tenant columns are null (backward compatible with prior hardcoded behavior). */
const DEFAULT_SP_RATING_LOW_THRESHOLD = 2.5;
const DEFAULT_SP_RATING_HIGH_THRESHOLD = 4.0;

function clampStarRating0To5(n) {
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(0, n));
}

/**
 * Single source for SP_Rating (30d) low/high thresholds: dashboard banding, holdback, bonus eligibility.
 * Null/missing stored values → defaults; invalid ordering (high < low) after clamp → defaults.
 *
 * @param {Record<string, unknown> | null | undefined} commerce normalized commerce row (e.g. from getCommerceSettingsForTenant)
 * @returns {{ low: number, high: number }}
 */
function normalizeSpRatingThresholdsForTenant(commerce) {
  const rawLow = commerce && commerce.field_agent_sp_rating_low_threshold;
  const rawHigh = commerce && commerce.field_agent_sp_rating_high_threshold;
  const low =
    rawLow != null && Number.isFinite(Number(rawLow))
      ? clampStarRating0To5(Number(rawLow))
      : DEFAULT_SP_RATING_LOW_THRESHOLD;
  const high =
    rawHigh != null && Number.isFinite(Number(rawHigh))
      ? clampStarRating0To5(Number(rawHigh))
      : DEFAULT_SP_RATING_HIGH_THRESHOLD;
  if (high < low) {
    return { low: DEFAULT_SP_RATING_LOW_THRESHOLD, high: DEFAULT_SP_RATING_HIGH_THRESHOLD };
  }
  return { low, high };
}

module.exports = {
  DEFAULT_SP_RATING_LOW_THRESHOLD,
  DEFAULT_SP_RATING_HIGH_THRESHOLD,
  normalizeSpRatingThresholdsForTenant,
};
