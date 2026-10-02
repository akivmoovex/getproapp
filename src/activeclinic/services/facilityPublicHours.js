"use strict";

/**
 * Public facility hours for ActiveClinic websites / location pages.
 * Canonical JSON matches existing demo/public contract:
 *   { Mon: "08:00–17:00", Tue: "Closed", ... }
 * Times are wall-clock in the facility timezone. No conversion.
 */

const WEEKDAYS = Object.freeze([
  { key: "Mon", label: "Monday", aliases: ["mon", "monday"] },
  { key: "Tue", label: "Tuesday", aliases: ["tue", "tues", "tuesday"] },
  { key: "Wed", label: "Wednesday", aliases: ["wed", "wednesday"] },
  { key: "Thu", label: "Thursday", aliases: ["thu", "thur", "thurs", "thursday"] },
  { key: "Fri", label: "Friday", aliases: ["fri", "friday"] },
  { key: "Sat", label: "Saturday", aliases: ["sat", "saturday"] },
  { key: "Sun", label: "Sunday", aliases: ["sun", "sunday"] },
]);

const WEEKDAY_KEYS = Object.freeze(WEEKDAYS.map((d) => d.key));
const RANGE_SEPARATOR = "–";
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const CLOSED_RE = /^(closed|close|--|—|–)$/i;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_HOURS: "invalid_public_hours",
});

function weekdayLookup() {
  const map = new Map();
  for (const day of WEEKDAYS) {
    map.set(day.key.toLowerCase(), day.key);
    for (const alias of day.aliases) map.set(alias, day.key);
  }
  return map;
}

const WEEKDAY_LOOKUP = weekdayLookup();

function parseTimeToken(raw) {
  const text = String(raw == null ? "" : raw).trim();
  if (!text) return null;
  const match = text.match(TIME_RE);
  if (!match) return null;
  return `${match[1]}:${match[2]}`;
}

function minutesOf(hhmm) {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  return h * 60 + m;
}

function displayRange(start, end) {
  return `${start}${RANGE_SEPARATOR}${end}`;
}

function parseDisplayValue(raw) {
  if (raw == null) return { closed: true, start: "", end: "" };
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const closed =
      raw.closed === true ||
      raw.open === false ||
      String(raw.status || "").toLowerCase() === "closed";
    if (closed) return { closed: true, start: "", end: "" };
    const start = parseTimeToken(raw.start || raw.open || raw.from);
    const end = parseTimeToken(raw.end || raw.close || raw.to);
    if (!start || !end) return null;
    return { closed: false, start, end };
  }
  const text = String(raw).trim();
  if (!text || CLOSED_RE.test(text)) {
    return { closed: true, start: "", end: "" };
  }
  const parts = text.split(/\s*[–—-]\s*/);
  if (parts.length !== 2) return null;
  const start = parseTimeToken(parts[0]);
  const end = parseTimeToken(parts[1]);
  if (!start || !end) return null;
  if (minutesOf(start) >= minutesOf(end)) return null;
  return { closed: false, start, end };
}

function normalizeStoredPublicHours(raw) {
  if (raw == null || raw === "") {
    return { ok: true, json: null, days: blankEditorDays() };
  }
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, code: RESULT.INVALID_HOURS, json: null, days: blankEditorDays() };
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, code: RESULT.INVALID_HOURS, json: null, days: blankEditorDays() };
  }
  const days = blankEditorDays();
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = WEEKDAY_LOOKUP.get(String(rawKey).trim().toLowerCase());
    if (!key) continue;
    const parsed = parseDisplayValue(rawValue);
    if (!parsed) {
      return { ok: false, code: RESULT.INVALID_HOURS, json: null, days: blankEditorDays() };
    }
    const slot = days.find((d) => d.key === key);
    slot.closed = parsed.closed;
    slot.start = parsed.start;
    slot.end = parsed.end;
  }
  return { ok: true, json: serializeEditorDays(days), days };
}

function blankEditorDays() {
  return WEEKDAYS.map((day) => ({
    key: day.key,
    label: day.label,
    closed: true,
    start: "",
    end: "",
  }));
}

function serializeEditorDays(days) {
  const json = {};
  for (const day of days) {
    json[day.key] = day.closed ? "Closed" : displayRange(day.start, day.end);
  }
  return json;
}

function formIncludesPublicHours(body) {
  return Object.keys(body || {}).some((key) => String(key).startsWith("hours_"));
}

function parsePublicHoursFromForm(body) {
  if (!formIncludesPublicHours(body)) {
    return { ok: true, omitted: true, json: undefined, days: blankEditorDays() };
  }
  const days = [];
  let errorMessage = null;
  for (const day of WEEKDAYS) {
    const closedRaw = body[`hours_${day.key}_closed`];
    const closed = closedRaw === "1" || closedRaw === "on" || closedRaw === true;
    const start = parseTimeToken(body[`hours_${day.key}_start`]);
    const end = parseTimeToken(body[`hours_${day.key}_end`]);
    if (closed) {
      days.push({ key: day.key, label: day.label, closed: true, start: "", end: "" });
      continue;
    }
    if (!start || !end) {
      errorMessage =
        errorMessage ||
        `Enter opening and closing times for ${day.label}, or mark it closed.`;
      days.push({
        key: day.key,
        label: day.label,
        closed: false,
        start: String(body[`hours_${day.key}_start`] || "").trim(),
        end: String(body[`hours_${day.key}_end`] || "").trim(),
      });
      continue;
    }
    if (minutesOf(start) >= minutesOf(end)) {
      errorMessage =
        errorMessage || `${day.label} closing time must be after opening time.`;
      days.push({ key: day.key, label: day.label, closed: false, start, end });
      continue;
    }
    days.push({ key: day.key, label: day.label, closed: false, start, end });
  }
  if (errorMessage) {
    return {
      ok: false,
      code: RESULT.INVALID_HOURS,
      omitted: false,
      json: null,
      days,
      message: errorMessage,
    };
  }
  return { ok: true, omitted: false, json: serializeEditorDays(days), days };
}

function editorDaysFromStored(raw) {
  const normalized = normalizeStoredPublicHours(raw);
  if (!normalized.ok) return blankEditorDays();
  return normalized.days;
}

module.exports = {
  WEEKDAYS,
  WEEKDAY_KEYS,
  RANGE_SEPARATOR,
  RESULT,
  formIncludesPublicHours,
  parsePublicHoursFromForm,
  normalizeStoredPublicHours,
  editorDaysFromStored,
  blankEditorDays,
  serializeEditorDays,
};
