"use strict";

const { parseNonNegativeMoney } = require("./attendanceValidation");

/**
 * @param {string} periodMonth - YYYY-MM
 * @returns {{ year: number, month: number } | null}
 */
function parsePeriodMonth(periodMonth) {
  const s = String(periodMonth || "").trim();
  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function formatPeriodMonth(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function givingGrandTotal(row) {
  return (
    Number(row.tithes_total || 0) +
    Number(row.offerings_total || 0) +
    Number(row.building_fund_total || 0) +
    Number(row.missions_fund_total || 0) +
    Number(row.special_offerings_total || 0) +
    Number(row.other_giving_total || 0)
  );
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, data: object, status: string } | { ok: false, error: string, form: object }}
 */
function validateGivingSummaryBody(body) {
  const submitAction = String(body.submit_action || "save_draft").trim();
  const status = submitAction === "submit" ? "submitted" : "draft";
  const periodMonth = String(body.period_month || "").trim();
  const notes = String(body.notes || "").trim().slice(0, 2000);
  const parsedPeriod = parsePeriodMonth(periodMonth);

  const form = { period_month: periodMonth, notes };

  if (!parsedPeriod) {
    return { ok: false, error: "Please select a valid month (YYYY-MM).", form };
  }

  const amounts = {};
  for (const [key, label] of [
    ["tithes_total", "Tithes"],
    ["offerings_total", "Offerings"],
    ["building_fund_total", "Building fund"],
    ["missions_fund_total", "Missions fund"],
    ["special_offerings_total", "Special offerings"],
    ["other_giving_total", "Other giving"],
  ]) {
    const parsed = parseNonNegativeMoney(body[key], label);
    if (!parsed.ok) return { ok: false, error: parsed.error, form: { ...form, ...amounts } };
    amounts[key] = parsed.value;
    form[key] = parsed.value;
  }

  return {
    ok: true,
    status,
    data: {
      period_year: parsedPeriod.year,
      period_month: parsedPeriod.month,
      period_month_label: periodMonth,
      notes,
      ...amounts,
    },
  };
}

module.exports = {
  parsePeriodMonth,
  formatPeriodMonth,
  givingGrandTotal,
  validateGivingSummaryBody,
};
