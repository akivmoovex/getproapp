"use strict";

const { parsePeriodMonth } = require("./hqBranchRegistryValidation");

function previousCalendarMonth(year, month) {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function periodLabel(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseAnalyticsPeriods(query) {
  const period = parsePeriodMonth(query && query.period_month);
  const compareRaw = String((query && query.compare_month) || "").trim().slice(0, 7);
  let compare;
  if (/^\d{4}-\d{2}$/.test(compareRaw)) {
    const match = /^(\d{4})-(\d{2})$/.exec(compareRaw);
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
      compare = { year, month, label: periodLabel(year, month) };
    }
  }
  if (!compare) {
    const prev = previousCalendarMonth(period.year, period.month);
    compare = { year: prev.year, month: prev.month, label: periodLabel(prev.year, prev.month) };
  }
  return { period, compare };
}

function parseJsonField(val) {
  if (!val) return {};
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return {};
  }
}

function givingStatusLabel(status) {
  const map = {
    draft: "Draft",
    submitted: "Submitted",
    included_in_monthly_report: "Included in report",
    not_started: "Not started",
  };
  return map[status] || status || "Not started";
}

function reportStatusLabel(status) {
  const map = {
    draft: "Draft",
    submitted: "Submitted",
    approved: "Approved",
    changes_requested: "Changes requested",
    missing: "Missing",
  };
  return map[status] || status;
}

function computeBranchHealthFlags(row) {
  return {
    missingCurrentMonthReport: !!row.missingCurrentMonthReport,
    changesRequested: !!row.changesRequested,
    pendingMembers: (row.pendingMembers || 0) > 0,
    openRequests: (row.openRequests || 0) > 0,
    ministryFollowUp: (row.ministryFollowUpCount || 0) > 0,
    noAttendanceThisMonth: !!row.noAttendanceThisMonth,
    noGivingSummaryThisMonth: !!row.noGivingSummaryThisMonth,
  };
}

function computeBranchHealthLabel(flags) {
  if (
    flags.missingCurrentMonthReport ||
    flags.changesRequested ||
    flags.ministryFollowUp
  ) {
    return "Needs Attention";
  }
  if (
    flags.pendingMembers ||
    flags.openRequests ||
    flags.noAttendanceThisMonth ||
    flags.noGivingSummaryThisMonth
  ) {
    return "Watch";
  }
  return "Healthy";
}

function healthBadgeClass(label) {
  if (label === "Needs Attention") return "pending";
  if (label === "Watch") return "pending";
  return "verified";
}

function formatMoney(amount) {
  const n = Number(amount || 0);
  return n.toLocaleString("en-ZM", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = {
  parseAnalyticsPeriods,
  parsePeriodMonth,
  previousCalendarMonth,
  periodLabel,
  parseJsonField,
  givingStatusLabel,
  reportStatusLabel,
  computeBranchHealthFlags,
  computeBranchHealthLabel,
  healthBadgeClass,
  formatMoney,
};
