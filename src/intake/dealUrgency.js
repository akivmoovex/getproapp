"use strict";

/** Stored enum values (snake_case). */
const URGENCY_VALUES = Object.freeze(["today", "this_week", "two_weeks", "four_weeks", "not_urgent"]);

const LABEL_BY_VALUE = Object.freeze({
  today: "Today",
  this_week: "This week",
  two_weeks: "2 weeks",
  four_weeks: "4 weeks",
  not_urgent: "Not urgent",
});

function normalizeUrgency(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (s === "2_weeks") return "two_weeks";
  if (s === "4_weeks") return "four_weeks";
  if (URGENCY_VALUES.includes(s)) return s;
  return "not_urgent";
}

function urgencyLabel(value) {
  const v = normalizeUrgency(value);
  return LABEL_BY_VALUE[v] || LABEL_BY_VALUE.not_urgent;
}

/** Options for HTML selects: { value, label }[] */
function listUrgencySelectOptions() {
  return URGENCY_VALUES.map((value) => ({ value, label: LABEL_BY_VALUE[value] }));
}

module.exports = {
  URGENCY_VALUES,
  normalizeUrgency,
  urgencyLabel,
  listUrgencySelectOptions,
};
