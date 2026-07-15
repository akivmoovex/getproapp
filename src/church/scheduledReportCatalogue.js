"use strict";

/**
 * Existing runnable report types available for Growth scheduled delivery.
 * No custom report builder / Network executive reports / API export.
 */

const monthlyReportsService = require("../services/church/monthlyReportsService");
const givingSummariesRepo = require("../db/pg/church/givingSummariesRepo");
const { givingGrandTotal } = require("./givingValidation");
const { parsePeriodMonth, formatPeriodMonth } = require("./givingValidation");

const SUPPORTED_SCHEDULED_REPORTS = Object.freeze({
  branch_monthly_summary: {
    id: "branch_monthly_summary",
    label: "Branch monthly report summary",
    description: "Attendance, giving, and ministry activity snapshot for a report period.",
    portals: ["branch"],
    requiredPermission: "branch_reports_read",
  },
  branch_attendance_summary: {
    id: "branch_attendance_summary",
    label: "Branch attendance summary",
    description: "Submitted attendance totals for a period.",
    portals: ["branch"],
    requiredPermission: "branch_reports_read",
  },
  branch_giving_summary: {
    id: "branch_giving_summary",
    label: "Branch giving summary",
    description: "Giving totals recorded for a period.",
    portals: ["branch"],
    requiredPermission: "branch_reports_read",
  },
});

function listSupportedScheduledReports(portal) {
  return Object.values(SUPPORTED_SCHEDULED_REPORTS).filter((r) =>
    (r.portals || []).includes(portal || "branch")
  );
}

function getSupportedScheduledReport(reportType) {
  return SUPPORTED_SCHEDULED_REPORTS[String(reportType || "").trim()] || null;
}

function periodFromFilters(filters) {
  const raw = filters && filters.period_month;
  if (raw) {
    const parsed = parsePeriodMonth(raw);
    if (parsed) return parsed;
  }
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/**
 * Build report rows for export (tenant/branch scoped by caller).
 */
async function buildScheduledReportPayload(pool, reportType, ctx) {
  const def = getSupportedScheduledReport(reportType);
  if (!def) {
    const err = new Error("Unsupported report type.");
    err.code = "UNSUPPORTED_REPORT";
    throw err;
  }
  const filters = ctx.filters || {};
  const period = periodFromFilters(filters);
  const periodLabel = formatPeriodMonth(period.year, period.month);

  if (reportType === "branch_monthly_summary") {
    const reportCtx = await monthlyReportsService.loadReportPeriodContext(pool, {
      branchId: ctx.branchId,
      organizationId: ctx.organizationId,
      year: period.year,
      month: period.month,
    });
    return {
      title: `Monthly report summary — ${periodLabel}`,
      periodLabel,
      columns: ["metric", "value"],
      rows: [
        ["period", periodLabel],
        ["branch_id", String(ctx.branchId)],
        ["sunday_average", String(reportCtx.attendance?.snapshot?.sunday_average ?? "")],
        ["midweek_average", String(reportCtx.attendance?.snapshot?.midweek_average ?? "")],
        ["visitors_total", String(reportCtx.attendance?.snapshot?.visitors_total ?? "")],
        ["total_giving", String(reportCtx.giving?.snapshot?.total_giving ?? "")],
        ["draft_attendance_records", String(reportCtx.attendance?.draftCount ?? "")],
        ["existing_report_status", String(reportCtx.existingReport?.status || "none")],
      ],
    };
  }

  if (reportType === "branch_attendance_summary") {
    const att = await monthlyReportsService.buildAttendanceSnapshot(
      pool,
      ctx.branchId,
      period.year,
      period.month
    );
    return {
      title: `Attendance summary — ${periodLabel}`,
      periodLabel,
      columns: ["metric", "value"],
      rows: [
        ["period", periodLabel],
        ["sunday_average", String(att.snapshot.sunday_average)],
        ["midweek_average", String(att.snapshot.midweek_average)],
        ["children_average", String(att.snapshot.children_average)],
        ["youth_average", String(att.snapshot.youth_average)],
        ["visitors_total", String(att.snapshot.visitors_total)],
        ["submitted_records", String(att.submittedCount)],
        ["draft_records", String(att.draftCount)],
      ],
    };
  }

  if (reportType === "branch_giving_summary") {
    const giving = await givingSummariesRepo.getGivingSummaryForBranchPeriod(
      pool,
      ctx.branchId,
      period.year,
      period.month
    );
    const total = giving ? givingGrandTotal(giving) : 0;
    return {
      title: `Giving summary — ${periodLabel}`,
      periodLabel,
      columns: ["metric", "value"],
      rows: [
        ["period", periodLabel],
        ["tithes_total", String(giving?.tithes_total ?? 0)],
        ["offerings_total", String(giving?.offerings_total ?? 0)],
        ["building_fund_total", String(giving?.building_fund_total ?? 0)],
        ["missions_fund_total", String(giving?.missions_fund_total ?? 0)],
        ["special_offerings_total", String(giving?.special_offerings_total ?? 0)],
        ["other_giving_total", String(giving?.other_giving_total ?? 0)],
        ["total_giving", String(total)],
        ["status", String(giving?.status || "none")],
      ],
    };
  }

  const err = new Error("Unsupported report type.");
  err.code = "UNSUPPORTED_REPORT";
  throw err;
}

function escapeCsv(value) {
  const s = String(value == null ? "" : value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function payloadToCsv(payload) {
  const lines = [];
  lines.push(escapeCsv(payload.title));
  lines.push(payload.columns.map(escapeCsv).join(","));
  for (const row of payload.rows || []) {
    lines.push(row.map(escapeCsv).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/** Minimal single-page PDF text document (no external PDF library). */
function payloadToPdf(payload) {
  const textLines = [payload.title, ""].concat(
    (payload.rows || []).map((r) => `${r[0]}: ${r[1]}`)
  );
  const escaped = textLines
    .map((line) =>
      String(line)
        .replace(/\\/g, "\\\\")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
    )
    .join("\\n");
  const stream = `BT /F1 10 Tf 50 750 Td 14 TL (${escaped}) Tj ET`;
  const objects = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj\n"
  );
  objects.push(`4 0 obj<< /Length ${stream.length} >>stream\n${stream}\nendstream\nendobj\n`);
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefPos = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return pdf;
}

function renderScheduledReportExport(payload, format) {
  if (format === "pdf") return payloadToPdf(payload);
  return payloadToCsv(payload);
}

module.exports = {
  SUPPORTED_SCHEDULED_REPORTS,
  listSupportedScheduledReports,
  getSupportedScheduledReport,
  buildScheduledReportPayload,
  renderScheduledReportExport,
  payloadToCsv,
  payloadToPdf,
};
