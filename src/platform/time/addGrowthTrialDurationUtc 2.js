"use strict";

/**
 * Canonical BlessBoard V5 Growth trial duration.
 * Exactly 30 × 24 hours in UTC (same clock face), not calendar-month arithmetic.
 * Do not use for V4 church package trials.
 */

const { addCalendarDaysUtc } = require("./addCalendarDaysUtc");

const GROWTH_TRIAL_DURATION_DAYS = 30;

/**
 * @param {Date | string | number} startsAt
 * @returns {Date}
 */
function addGrowthTrialDurationUtc(startsAt) {
  return addCalendarDaysUtc(startsAt, GROWTH_TRIAL_DURATION_DAYS);
}

/**
 * @param {Date | string | number} startsAt
 * @returns {string} ISO-8601
 */
function growthTrialEndsAtIso(startsAt) {
  return addGrowthTrialDurationUtc(startsAt).toISOString();
}

module.exports = {
  GROWTH_TRIAL_DURATION_DAYS,
  addGrowthTrialDurationUtc,
  growthTrialEndsAtIso,
};
