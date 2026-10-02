"use strict";

/**
 * Add N calendar days in UTC (same clock-face time), clamping month overflow
 * via Date.UTC (e.g. Jan 31 + 1 day → Feb 1).
 *
 * @param {Date | string | number} input
 * @param {number} days integer; may be negative
 * @returns {Date}
 */
function addCalendarDaysUtc(input, days) {
  const start = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(start.getTime())) {
    throw new TypeError("addCalendarDaysUtc: invalid date");
  }
  const n = Number(days);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new TypeError("addCalendarDaysUtc: days must be an integer");
  }
  return new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate() + n,
      start.getUTCHours(),
      start.getUTCMinutes(),
      start.getUTCSeconds(),
      start.getUTCMilliseconds()
    )
  );
}

module.exports = {
  addCalendarDaysUtc,
};
