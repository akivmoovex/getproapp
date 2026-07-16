"use strict";

const {
  payloadToCsv,
  payloadToPdf,
} = require("../church/scheduledReportCatalogue");
const { FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS } = require("./foundationBasicReportKpiDefinitions");

function buildSummaryRows(report, canViewFinance) {
  const rows = [
    ["date_from", report.filters.dateFrom],
    ["date_to", report.filters.dateTo],
    ["branch", report.branchName || ""],
  ];
  for (const [key, value] of Object.entries(report.kpis || {})) {
    if (key === "giving_totals" && !canViewFinance) continue;
    const def = FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS[key];
    rows.push([def ? def.label : key, String(value)]);
  }
  for (const point of report.attendanceTrend || []) {
    rows.push([
      `attendance_trend_${point.period_label}`,
      String(point.attendance_total),
    ]);
    rows.push([`visitors_trend_${point.period_label}`, String(point.visitors_total)]);
  }
  return rows;
}

function buildExportPayload(report, drillDowns, canViewFinance) {
  const rows = buildSummaryRows(report, canViewFinance);
  for (const block of drillDowns || []) {
    rows.push(["", ""]);
    rows.push([`detail_${block.kpiId}`, block.definition?.label || block.kpiId]);
    for (const row of block.rows || []) {
      rows.push([`detail_${block.kpiId}`, JSON.stringify(row)]);
    }
  }
  return {
    title: `Foundation basic report — ${report.filters.dateFrom} to ${report.filters.dateTo}`,
    periodLabel: `${report.filters.dateFrom} — ${report.filters.dateTo}`,
    columns: ["metric", "value"],
    rows,
  };
}

function renderFoundationBasicReportExport(payload, format) {
  if (format === "pdf") return payloadToPdf(payload);
  return payloadToCsv(payload);
}

module.exports = {
  buildExportPayload,
  renderFoundationBasicReportExport,
  buildSummaryRows,
};
