"use strict";

/**
 * Quiet-hour helpers for Growth scheduled email broadcasts.
 * Uses org IANA timezone (church_organizations.timezone).
 */

const { normalizeTimezone, zonedParts, zonedLocalToUtc, parseDeliveryTime } = require("./scheduledReportTiming");

/**
 * @param {Date} at
 * @param {{ quiet_hours_enabled?: boolean, quiet_hours_start?: string, quiet_hours_end?: string }} policy
 * @param {string} timezone
 * @returns {boolean}
 */
function isInQuietHours(at, policy, timezone) {
  if (!policy || !policy.quiet_hours_enabled) return false;
  const tz = normalizeTimezone(timezone);
  const local = zonedParts(at instanceof Date ? at : new Date(at), tz);
  const start = parseDeliveryTime(policy.quiet_hours_start || "21:00");
  const end = parseDeliveryTime(policy.quiet_hours_end || "07:00");
  const mins = local.hour * 60 + local.minute;
  const startMins = start.hour * 60 + start.minute;
  const endMins = end.hour * 60 + end.minute;

  if (startMins === endMins) return false;
  if (startMins < endMins) {
    // Same-day window e.g. 12:00–14:00
    return mins >= startMins && mins < endMins;
  }
  // Overnight window e.g. 21:00–07:00
  return mins >= startMins || mins < endMins;
}

/**
 * Next UTC instant when quiet hours end (for deferral).
 * @returns {Date|null}
 */
function nextQuietHoursEnd(at, policy, timezone) {
  if (!policy || !policy.quiet_hours_enabled) return null;
  if (!isInQuietHours(at, policy, timezone)) return null;

  const tz = normalizeTimezone(timezone);
  const from = at instanceof Date ? at : new Date(at);
  const local = zonedParts(from, tz);
  const end = parseDeliveryTime(policy.quiet_hours_end || "07:00");
  const start = parseDeliveryTime(policy.quiet_hours_start || "21:00");
  const startMins = start.hour * 60 + start.minute;
  const endMins = end.hour * 60 + end.minute;
  const mins = local.hour * 60 + local.minute;

  let dayOffset = 0;
  if (startMins > endMins) {
    // Overnight: if currently after start, end is tomorrow; if before end, end is today
    if (mins >= startMins) dayOffset = 1;
  } else if (mins >= endMins) {
    dayOffset = 1;
  }

  return zonedLocalToUtc(
    {
      year: local.year,
      month: local.month,
      day: local.day + dayOffset,
      hour: end.hour,
      minute: end.minute,
    },
    tz
  );
}

function parseQuietTime(raw, fallback) {
  const parsed = parseDeliveryTime(raw || fallback);
  return parsed.text;
}

/**
 * @param {object} body
 * @returns {{ ok: true, data: object } | { ok: false, error: string }}
 */
function validateQuietHoursPolicyBody(body = {}) {
  const quiet_hours_enabled =
    body.quiet_hours_enabled === true ||
    body.quiet_hours_enabled === "1" ||
    body.quiet_hours_enabled === "on" ||
    body.quiet_hours_enabled === "true";
  const quiet_hours_start = parseQuietTime(body.quiet_hours_start, "21:00");
  const quiet_hours_end = parseQuietTime(body.quiet_hours_end, "07:00");
  if (quiet_hours_start === quiet_hours_end) {
    return { ok: false, error: "Quiet-hour start and end must differ." };
  }
  return {
    ok: true,
    data: {
      quiet_hours_enabled,
      quiet_hours_start,
      quiet_hours_end,
    },
  };
}

module.exports = {
  isInQuietHours,
  nextQuietHoursEnd,
  validateQuietHoursPolicyBody,
  parseQuietTime,
};
