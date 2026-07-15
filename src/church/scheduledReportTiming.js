"use strict";

/**
 * Timezone-aware next-run helpers for scheduled reports (Intl only).
 */

function normalizeTimezone(timezone) {
  let tz = String(timezone || "UTC").trim() || "UTC";
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    tz = "UTC";
  }
  return tz;
}

function zonedParts(date, timezone) {
  const tz = normalizeTimezone(timezone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdayMap[get("weekday")] ?? 0,
    timezone: tz,
  };
}

function zonedLocalToUtc({ year, month, day, hour, minute }, timezone) {
  const tz = normalizeTimezone(timezone);
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  for (let i = 0; i < 4; i++) {
    const parts = zonedParts(guess, tz);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess = new Date(guess.getTime() + (wanted - asUtc));
  }
  return guess;
}

function parseDeliveryTime(raw) {
  const s = String(raw || "09:00").trim();
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return { hour: 9, minute: 0, display: "09:00" };
  const hour = Math.min(23, Math.max(0, Number(m[1])));
  const minute = Math.min(59, Math.max(0, Number(m[2])));
  return {
    hour,
    minute,
    text: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

/**
 * Next run strictly after `fromDate`.
 * @returns {Date}
 */
function computeNextRunAt(schedule, fromDate = new Date()) {
  const tz = normalizeTimezone(schedule.timezone);
  const { hour, minute } = parseDeliveryTime(schedule.delivery_time_local);
  const frequency = String(schedule.frequency || "daily");
  const from = fromDate instanceof Date ? fromDate : new Date(fromDate);
  const startLocal = zonedParts(from, tz);

  for (let dayOffset = 0; dayOffset < 400; dayOffset++) {
    const probeUtc = new Date(
      Date.UTC(startLocal.year, startLocal.month - 1, startLocal.day + dayOffset, 12, 0, 0)
    );
    const noonParts = zonedParts(probeUtc, tz);

    if (frequency === "weekly") {
      const wantDow = Number(schedule.day_of_week);
      if (!Number.isFinite(wantDow) || noonParts.weekday !== wantDow) continue;
    } else if (frequency === "monthly") {
      const wantDom = Number(schedule.day_of_month) || 1;
      if (noonParts.day !== wantDom) continue;
    }

    const candidate = zonedLocalToUtc(
      {
        year: noonParts.year,
        month: noonParts.month,
        day: noonParts.day,
        hour,
        minute,
      },
      tz
    );
    if (candidate.getTime() > from.getTime()) return candidate;
  }
  return new Date(from.getTime() + 24 * 3600 * 1000);
}

function jobKeyForScheduleRun(scheduleId, scheduledFor) {
  const when = scheduledFor instanceof Date ? scheduledFor : new Date(scheduledFor);
  return `sched_report:${scheduleId}:${when.toISOString()}`;
}

module.exports = {
  normalizeTimezone,
  zonedParts,
  zonedLocalToUtc,
  parseDeliveryTime,
  computeNextRunAt,
  jobKeyForScheduleRun,
};
