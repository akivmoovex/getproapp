"use strict";

const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const givingSummariesRepo = require("../../db/pg/church/givingSummariesRepo");
const monthlyReportsRepo = require("../../db/pg/church/monthlyReportsRepo");
const ministryActivityNotesRepo = require("../../db/pg/church/ministryActivityNotesRepo");
const { givingGrandTotal } = require("../../church/givingValidation");
const { formatReportPeriod } = require("../../church/monthlyReportValidation");

function roundAverage(values) {
  if (!values.length) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.round((sum / values.length) * 100) / 100;
}

function buildGivingSnapshot(giving) {
  if (!giving) {
    return { linked: false, snapshot: {}, giving_summary_id: null };
  }
  const total = givingGrandTotal(giving);
  return {
    linked: true,
    giving_summary_id: giving.id,
    snapshot: {
      tithes_total: Number(giving.tithes_total || 0),
      offerings_total: Number(giving.offerings_total || 0),
      building_fund_total: Number(giving.building_fund_total || 0),
      missions_fund_total: Number(giving.missions_fund_total || 0),
      special_offerings_total: Number(giving.special_offerings_total || 0),
      other_giving_total: Number(giving.other_giving_total || 0),
      total_giving: total,
      giving_notes: giving.notes || "",
      status: giving.status,
    },
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 */
async function buildAttendanceSnapshot(pool, branchId, year, month) {
  const submitted = await attendanceRepo.listSubmittedAttendanceForBranchPeriod(pool, branchId, year, month);
  const draftCount = await attendanceRepo.countDraftAttendanceForBranchPeriod(pool, branchId, year, month);

  const sundayTotals = [];
  const midweekTotals = [];
  const childrenCounts = [];
  const youthCounts = [];
  let visitorsTotal = 0;

  for (const row of submitted) {
    const total = attendanceRepo.totalAttendance(row);
    if (row.attendance_type === "Sunday service") sundayTotals.push(total);
    if (row.attendance_type === "Midweek service") midweekTotals.push(total);
    childrenCounts.push(Number(row.children_count || 0));
    youthCounts.push(Number(row.youth_count || 0));
    visitorsTotal += Number(row.first_time_visitors_count || 0);
  }

  const snapshot = {
    sunday_average: roundAverage(sundayTotals),
    midweek_average: roundAverage(midweekTotals),
    children_average: roundAverage(childrenCounts),
    youth_average: roundAverage(youthCounts),
    visitors_total: visitorsTotal,
    submitted_record_count: submitted.length,
    draft_record_count: draftCount,
    included_record_ids: submitted.map((r) => r.id),
  };

  return { snapshot, draftCount, submittedCount: submitted.length };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 */
async function buildMinistryActivitySnapshot(pool, branchId, year, month) {
  const summary = await ministryActivityNotesRepo.getMinistryActivitySummaryForBranchPeriod(
    pool,
    branchId,
    year,
    month
  );
  const notes = await ministryActivityNotesRepo.listSubmittedActivityNotesForBranchPeriod(
    pool,
    branchId,
    summary.period_month
  );
  const reviewedNotes = notes.filter((n) => n.review_status === "reviewed");
  const pendingNotes = notes.filter((n) => n.review_status === "submitted");
  const followUpNotes = notes.filter((n) => n.review_status === "follow_up_requested");
  return { summary, notes, reviewedNotes, pendingNotes, followUpNotes };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 */
async function loadReportPeriodContext(pool, ctx) {
  const { branchId, organizationId, year, month } = ctx;
  const attendance = await buildAttendanceSnapshot(pool, branchId, year, month);
  const giving = await givingSummariesRepo.getGivingSummaryForBranchPeriod(pool, branchId, year, month);
  const givingData = buildGivingSnapshot(giving);
  const ministryActivity = await buildMinistryActivitySnapshot(pool, branchId, year, month);
  const existingReport = await monthlyReportsRepo.findReportByPeriodForBranch(pool, branchId, year, month);

  return {
    period_month_label: formatReportPeriod(year, month),
    attendance,
    giving: givingData,
    ministryActivity,
    existingReport,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} params
 */
async function saveDraftReport(pool, params) {
  const attendance = await buildAttendanceSnapshot(
    pool,
    params.branch_id,
    params.period_year,
    params.period_month
  );
  const giving = await givingSummariesRepo.getGivingSummaryForBranchPeriod(
    pool,
    params.branch_id,
    params.period_year,
    params.period_month
  );
  const givingData = buildGivingSnapshot(giving);

  return monthlyReportsRepo.createOrUpdateDraftReportForBranchPeriod(pool, {
    organization_id: params.organization_id,
    branch_id: params.branch_id,
    period_year: params.period_year,
    period_month: params.period_month,
    starting_members: params.starting_members,
    new_members: params.new_members,
    transferred_members: params.transferred_members,
    inactive_members: params.inactive_members,
    ending_members: params.ending_members,
    sunday_average: attendance.snapshot.sunday_average,
    midweek_average: attendance.snapshot.midweek_average,
    children_average: attendance.snapshot.children_average,
    youth_average: attendance.snapshot.youth_average,
    visitors_total: attendance.snapshot.visitors_total,
    services_held: params.services_held,
    ministry_meetings_held: params.ministry_meetings_held,
    department_meetings_held: params.department_meetings_held,
    outreach_activities: params.outreach_activities,
    special_events: params.special_events,
    ministry_activity_notes: params.ministry_activity_notes,
    main_challenges: params.main_challenges,
    support_needed_from_hq: params.support_needed_from_hq,
    giving_summary_id: givingData.giving_summary_id,
    giving_snapshot_json: givingData.snapshot,
    attendance_snapshot_json: attendance.snapshot,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} params
 */
async function submitMonthlyReport(pool, params) {
  const { reportId, branchId, organizationId, adminId, formData } = params;

  const existing = await monthlyReportsRepo.findReportByIdForBranch(pool, reportId, branchId);
  if (!existing) {
    const err = new Error("Report not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (existing.status !== "draft") {
    const err = new Error("Submitted reports cannot be edited.");
    err.code = "REPORT_LOCKED";
    throw err;
  }

  await saveDraftReport(pool, {
    organization_id: organizationId,
    branch_id: branchId,
    period_year: existing.period_year,
    period_month: existing.period_month,
    ...formData,
  });

  const attendance = await buildAttendanceSnapshot(pool, branchId, existing.period_year, existing.period_month);
  const giving = await givingSummariesRepo.getGivingSummaryForBranchPeriod(
    pool,
    branchId,
    existing.period_year,
    existing.period_month
  );
  const givingData = buildGivingSnapshot(giving);

  const ministryActivity = await buildMinistryActivitySnapshot(
    pool,
    branchId,
    existing.period_year,
    existing.period_month
  );

  const submitted = await monthlyReportsRepo.submitReportForBranch(pool, reportId, branchId, adminId, {
    sunday_average: attendance.snapshot.sunday_average,
    midweek_average: attendance.snapshot.midweek_average,
    children_average: attendance.snapshot.children_average,
    youth_average: attendance.snapshot.youth_average,
    visitors_total: attendance.snapshot.visitors_total,
    giving_summary_id: givingData.giving_summary_id,
    giving_snapshot_json: givingData.snapshot,
    attendance_snapshot_json: attendance.snapshot,
    ministry_activity_snapshot_json: ministryActivity,
  });

  if (!submitted) {
    const err = new Error("Report could not be submitted.");
    err.code = "SUBMIT_FAILED";
    throw err;
  }

  await attendanceRepo.syncSubmittedAttendanceToMonthlyReport(
    pool,
    branchId,
    existing.period_year,
    existing.period_month
  );

  if (givingData.giving_summary_id) {
    await givingSummariesRepo.markGivingSummaryIncludedInMonthlyReport(
      pool,
      givingData.giving_summary_id,
      branchId
    );
  }

  return submitted;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function getReportsDashboardData(pool, branchId) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const prevDate = new Date(currentYear, currentMonth - 2, 1);
  const prevYear = prevDate.getFullYear();
  const prevMonth = prevDate.getMonth() + 1;

  const [
    currentReport,
    previousReport,
    statusCounts,
    reports,
    currentAttendance,
    currentGiving,
  ] = await Promise.all([
    monthlyReportsRepo.getCurrentMonthReportForBranch(pool, branchId),
    monthlyReportsRepo.findReportByPeriodForBranch(pool, branchId, prevYear, prevMonth),
    monthlyReportsRepo.countReportsByStatusForBranch(pool, branchId),
    monthlyReportsRepo.listReportsForBranch(pool, branchId),
    buildAttendanceSnapshot(pool, branchId, currentYear, currentMonth),
    givingSummariesRepo.getGivingSummaryForBranchPeriod(pool, branchId, currentYear, currentMonth),
  ]);

  const previousMonthMissing =
    !previousReport || (previousReport.status !== "submitted" && previousReport.status !== "approved");

  let currentMonthStatus = "Not started";
  if (currentReport) {
    currentMonthStatus =
      currentReport.status === "draft"
        ? "Draft in progress"
        : currentReport.status === "submitted"
          ? "Submitted — awaiting HQ review"
          : currentReport.status === "approved"
            ? "Approved"
            : "Changes requested";
  }

  let givingStatus = "Not started";
  if (currentGiving) {
    givingStatus =
      currentGiving.status === "included_in_monthly_report"
        ? "Included in report"
        : currentGiving.status === "submitted"
          ? "Submitted"
          : "Draft";
  }

  return {
    currentReport,
    currentMonthStatus,
    previousMonthMissing,
    previousMonthLabel: formatReportPeriod(prevYear, prevMonth),
    statusCounts,
    reports,
    attendancePreview: currentAttendance.snapshot,
    draftAttendanceCount: currentAttendance.draftCount,
    givingStatus,
    currentPeriodLabel: formatReportPeriod(currentYear, currentMonth),
  };
}

module.exports = {
  buildAttendanceSnapshot,
  buildGivingSnapshot,
  buildMinistryActivitySnapshot,
  loadReportPeriodContext,
  saveDraftReport,
  submitMonthlyReport,
  getReportsDashboardData,
  givingGrandTotal,
};
