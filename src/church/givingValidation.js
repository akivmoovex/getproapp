"use strict";

const { parseNonNegativeMoney } = require("./attendanceValidation");

const GIVING_STATUS_FILTERS = ["all", "draft", "submitted", "included_in_monthly_report"];
const GIVING_RANGE_FILTERS = ["all", "ytd", "current_month"];

const GIVING_FUND_FIELDS = Object.freeze([
  { key: "tithes_total", label: "Tithes" },
  { key: "offerings_total", label: "Offerings" },
  { key: "building_fund_total", label: "Building fund" },
  { key: "missions_fund_total", label: "Missions fund" },
  { key: "special_offerings_total", label: "Special offerings" },
  { key: "other_giving_total", label: "Other giving" },
]);

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

function givingStatusLabel(status) {
  const s = String(status || "").trim();
  if (s === "draft") return "Draft";
  if (s === "submitted") return "Submitted";
  if (s === "included_in_monthly_report") return "In monthly report";
  return s || "—";
}

/**
 * Format money with an ISO currency code. Does not convert currencies.
 * @param {unknown} amount
 * @param {string} [currencyCode]
 */
function formatGivingMoney(amount, currencyCode) {
  const code = String(currencyCode || "ZMW").trim().toUpperCase() || "ZMW";
  const n = Number(amount || 0);
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat("en-ZM", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${code} ${safe.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

/**
 * Allowlisted query parse for giving summary list.
 * @param {Record<string, unknown>} query
 */
function parseGivingSummaryQuery(query) {
  const raw = query && typeof query === "object" ? query : {};
  const statusRaw = String(raw.status || "all").trim().toLowerCase();
  const status = GIVING_STATUS_FILTERS.includes(statusRaw) ? statusRaw : "all";
  const rangeRaw = String(raw.range || "all").trim().toLowerCase();
  const range = GIVING_RANGE_FILTERS.includes(rangeRaw) ? rangeRaw : "all";
  const monthRaw = String(raw.month || raw.period_month || "").trim();
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : "";
  const q = String(raw.q || "").trim().slice(0, 200);
  const branchRaw = String(raw.branch_id || raw.branchId || "").trim();
  let branchId = null;
  if (branchRaw !== "") {
    const n = Number(branchRaw);
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) branchId = n;
  }
  const showForm = String(raw.new || "").trim() === "1" || String(raw.compose || "").trim() === "1";
  return { status, range, month, q, branchId, showForm };
}

/**
 * @param {{ q?: string, status?: string, range?: string, month?: string, branchId?: number | null }} filters
 * @param {unknown[]} rows
 * @param {{ hasSummariesInScope?: boolean }} [opts]
 */
function resolveGivingListState(filters, rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length > 0) return "results";
  const f = filters || {};
  const hasFilter =
    Boolean(f.q) ||
    (f.status && f.status !== "all") ||
    (f.range && f.range !== "all") ||
    Boolean(f.month) ||
    f.branchId != null;
  if (hasFilter) return "no_results";
  if (opts.hasSummariesInScope === false) return "empty";
  return "empty";
}

/**
 * Sum fund columns for rows that share one currency. Mixed currencies are not combined.
 * @param {object[]} rows
 */
function buildGivingOverviewFromSummaries(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const currencies = [
    ...new Set(list.map((r) => String(r.currency_code || "ZMW").trim().toUpperCase() || "ZMW")),
  ];
  const mixedCurrency = currencies.length > 1;
  const currencyCode = currencies[0] || "ZMW";
  const sameCurrencyRows = mixedCurrency
    ? list.filter((r) => (String(r.currency_code || "ZMW").trim().toUpperCase() || "ZMW") === currencyCode)
    : list;

  const totalsByFund = {};
  for (const fund of GIVING_FUND_FIELDS) totalsByFund[fund.key] = 0;
  let grandTotal = 0;
  for (const row of sameCurrencyRows) {
    for (const fund of GIVING_FUND_FIELDS) {
      totalsByFund[fund.key] += Number(row[fund.key] || 0);
    }
    grandTotal += givingGrandTotal(row);
  }
  return {
    currencyCode,
    totalsByFund,
    grandTotal,
    summaryCount: sameCurrencyRows.length,
    mixedCurrency,
    currencies,
  };
}

/**
 * Year-over-year change for the same calendar month when both periods exist (same currency).
 * @param {object[]} allRows
 * @param {number} year
 * @param {number} month
 */
function computeSameMonthYoYChange(allRows, year, month) {
  const list = Array.isArray(allRows) ? allRows : [];
  const current = list.find(
    (r) => Number(r.period_year) === year && Number(r.period_month) === month
  );
  const prior = list.find(
    (r) => Number(r.period_year) === year - 1 && Number(r.period_month) === month
  );
  if (!current || !prior) return null;
  const curCode = String(current.currency_code || "ZMW").trim().toUpperCase() || "ZMW";
  const priorCode = String(prior.currency_code || "ZMW").trim().toUpperCase() || "ZMW";
  if (curCode !== priorCode) return null;
  const currentTotal = givingGrandTotal(current);
  const priorTotal = givingGrandTotal(prior);
  if (priorTotal === 0) {
    return { priorTotal, currentTotal, percentChange: null, currencyCode: curCode };
  }
  const percentChange = Math.round(((currentTotal - priorTotal) / priorTotal) * 1000) / 10;
  return { priorTotal, currentTotal, percentChange, currencyCode: curCode };
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
  GIVING_STATUS_FILTERS,
  GIVING_RANGE_FILTERS,
  GIVING_FUND_FIELDS,
  parsePeriodMonth,
  formatPeriodMonth,
  givingGrandTotal,
  givingStatusLabel,
  formatGivingMoney,
  parseGivingSummaryQuery,
  resolveGivingListState,
  buildGivingOverviewFromSummaries,
  computeSameMonthYoYChange,
  validateGivingSummaryBody,
};
