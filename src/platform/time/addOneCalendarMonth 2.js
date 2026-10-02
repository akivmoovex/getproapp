"use strict";

/**
 * Add exactly one calendar month in UTC.
 *
 * Rule: keep year/month/day/hour/minute/second/ms in UTC; advance the month by 1.
 * If the original day does not exist in the target month, clamp to that month's
 * last valid day (e.g. Jan 31 → Feb 28/29, Mar 31 → Apr 30).
 * December rolls into the next year.
 *
 * @param {Date | string | number} input
 * @returns {Date}
 */
function addOneCalendarMonthUtc(input) {
  const start = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(start.getTime())) {
    throw new TypeError("addOneCalendarMonthUtc: invalid date");
  }

  const year = start.getUTCFullYear();
  const month = start.getUTCMonth(); // 0–11
  const day = start.getUTCDate();
  const hours = start.getUTCHours();
  const minutes = start.getUTCMinutes();
  const seconds = start.getUTCSeconds();
  const ms = start.getUTCMilliseconds();

  const targetMonthIndex = month + 1; // may be 12 → rolls via Date.UTC
  const lastDayOfTarget = daysInUtcMonth(year, targetMonthIndex);
  const clampedDay = Math.min(day, lastDayOfTarget);

  return new Date(Date.UTC(year, targetMonthIndex, clampedDay, hours, minutes, seconds, ms));
}

/**
 * @param {number} year UTC year of the start date (before month advance)
 * @param {number} monthIndex 0–12 where 12 means January of year+1
 * @returns {number}
 */
function daysInUtcMonth(year, monthIndex) {
  // Day 0 of the following month = last day of monthIndex.
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

module.exports = {
  addOneCalendarMonthUtc,
  daysInUtcMonth,
};
