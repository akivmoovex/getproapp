"use strict";

const { parsePeriodMonth } = require("./givingValidation");
const { parseNonNegativeInt } = require("./attendanceValidation");

function parseTextField(value, maxLen) {
  return String(value || "").trim().slice(0, maxLen);
}

/**
 * @param {Record<string, unknown>} body
 * @param {{ forSubmit?: boolean }} opts
 */
function validateMonthlyReportBody(body, opts = {}) {
  const forSubmit = Boolean(opts.forSubmit);
  const periodMonth = String(body.period_month || "").trim();
  const parsedPeriod = parsePeriodMonth(periodMonth);

  const form = { period_month: periodMonth };

  if (!parsedPeriod) {
    return { ok: false, error: "Please select a valid report month (YYYY-MM).", form };
  }

  const counts = {};
  for (const [key, label] of [
    ["starting_members", "Starting members"],
    ["new_members", "New members"],
    ["transferred_members", "Transferred members"],
    ["inactive_members", "Inactive members"],
    ["ending_members", "Ending members"],
    ["services_held", "Services held"],
    ["ministry_meetings_held", "Ministry meetings held"],
    ["department_meetings_held", "Department meetings held"],
    ["outreach_activities", "Outreach activities"],
    ["special_events", "Special events"],
  ]) {
    const parsed = parseNonNegativeInt(body[key], label);
    if (!parsed.ok) return { ok: false, error: parsed.error, form: { ...form, ...counts } };
    counts[key] = parsed.value;
    form[key] = parsed.value;
  }

  form.ministry_activity_notes = parseTextField(body.ministry_activity_notes, 4000);
  form.main_challenges = parseTextField(body.main_challenges, 4000);
  form.support_needed_from_hq = parseTextField(body.support_needed_from_hq, 4000);

  if (forSubmit) {
    if (!form.main_challenges) {
      return { ok: false, error: "Please describe the main challenges before submitting.", form };
    }
    if (!form.support_needed_from_hq) {
      return { ok: false, error: "Please describe support needed from HQ before submitting.", form };
    }
  }

  return {
    ok: true,
    data: {
      period_year: parsedPeriod.year,
      period_month: parsedPeriod.month,
      period_month_label: periodMonth,
      ...counts,
      ministry_activity_notes: form.ministry_activity_notes,
      main_challenges: form.main_challenges,
      support_needed_from_hq: form.support_needed_from_hq,
    },
    form,
  };
}

function formatReportPeriod(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function reportStatusLabel(status) {
  const map = {
    draft: "Draft",
    submitted: "Submitted to HQ",
    approved: "Approved",
    changes_requested: "Changes requested",
  };
  return map[status] || status;
}

module.exports = {
  validateMonthlyReportBody,
  formatReportPeriod,
  reportStatusLabel,
};
