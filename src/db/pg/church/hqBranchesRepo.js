"use strict";

const branchesRepo = require("./branchesRepo");
const membersRepo = require("./membersRepo");
const attendanceRepo = require("./attendanceRepo");
const givingSummariesRepo = require("./givingSummariesRepo");
const monthlyReportsRepo = require("./monthlyReportsRepo");
const ministriesRepo = require("./ministriesRepo");
const departmentsRepo = require("./departmentsRepo");
const memberRequestsRepo = require("./memberRequestsRepo");
const prayerRequestsRepo = require("./prayerRequestsRepo");
const ministryActivityNotesRepo = require("./ministryActivityNotesRepo");
const {
  formatBranchLocation,
  formatBranchContact,
  computeAttentionItems,
  branchNeedsAttention,
  matchesRegistryFilter,
  matchesRegistrySearch,
} = require("../../../church/hqBranchRegistryValidation");

function parseJsonField(val) {
  if (!val) return {};
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return {};
  }
}

async function findPrimaryBranchAdmin(pool, branchId) {
  const r = await pool.query(
    `SELECT full_name, email, phone
     FROM public.church_branch_admins
     WHERE branch_id = $1 AND status = 'active'
     ORDER BY id ASC
     LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} organizationId
 * @returns {Promise<object | null>}
 */
async function findBranchByIdForOrganization(pool, branchId, organizationId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_branches
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [branchId, organizationId]
  );
  return r.rows[0] ?? null;
}

async function listBranchesForOrganization(pool, organizationId) {
  return branchesRepo.listBranchesForOrganization(pool, organizationId);
}

async function getBranchMemberSummary(pool, branchId, latestReport) {
  const counts = await membersRepo.countMembersByStatusForBranch(pool, branchId);
  const newMembers = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_members
     WHERE branch_id = $1
       AND created_at >= date_trunc('month', now())`,
    [branchId]
  );
  return {
    active: counts.verified || 0,
    pending: counts.pending || 0,
    suspended: counts.suspended || 0,
    rejected: counts.rejected || 0,
    newThisMonth: newMembers.rows[0]?.count ?? 0,
    growthFromReport: latestReport ? latestReport.new_members ?? 0 : null,
    endingMembersFromReport: latestReport ? latestReport.ending_members ?? null : null,
  };
}

async function getBranchAttendanceSummary(pool, branchId, year, month, currentReport) {
  const [attendanceSummary, latestRecords] = await Promise.all([
    attendanceRepo.getAttendanceSummaryForBranchPeriod(pool, branchId, year, month),
    pool.query(
      `SELECT id, service_name, service_date, adults_count, youth_count, children_count,
              first_time_visitors_count, status
       FROM public.church_attendance_records
       WHERE branch_id = $1
       ORDER BY service_date DESC, id DESC
       LIMIT 5`,
      [branchId]
    ),
  ]);

  const fromReport = currentReport &&
    ["submitted", "approved", "changes_requested"].includes(currentReport.status)
    ? {
        sundayAverage: currentReport.sunday_average,
        youthAverage: currentReport.youth_average,
        childrenAverage: currentReport.children_average,
        visitorsTotal: currentReport.visitors_total,
        source: "monthly_report",
      }
    : null;

  return {
    periodYear: year,
    periodMonth: month,
    fromReport,
    recordCount: attendanceSummary.record_count || 0,
    adultsTotal: attendanceSummary.adults_total || 0,
    youthTotal: attendanceSummary.youth_total || 0,
    childrenTotal: attendanceSummary.children_total || 0,
    visitorsTotal: attendanceSummary.visitors_total || 0,
    latestRecords: latestRecords.rows,
  };
}

async function getBranchGivingSummary(pool, branchId, year, month, currentReport) {
  const giving = await givingSummariesRepo.getGivingSummaryForBranchPeriod(pool, branchId, year, month);
  const snapshot = currentReport ? parseJsonField(currentReport.giving_snapshot_json) : {};
  const totalFromSnapshot = Number(snapshot.total_giving || 0);
  return {
    periodYear: year,
    periodMonth: month,
    status: giving ? giving.status : currentReport && currentReport.giving_summary_id ? "linked_in_report" : "not_started",
    grandTotal: giving ? giving.grand_total : totalFromSnapshot,
    currencyCode: giving ? giving.currency_code : "ZMW",
    breakdown: giving
      ? {
          tithes: giving.tithes_total,
          offerings: giving.offerings_total,
          building: giving.building_fund_total,
          missions: giving.missions_fund_total,
          special: giving.special_offerings_total,
          other: giving.other_giving_total,
        }
      : snapshot,
    reportingOnly: true,
  };
}

async function getBranchReportSummary(pool, branchId, year, month) {
  const [currentReport, latestReportRow, history] = await Promise.all([
    monthlyReportsRepo.findReportByPeriodForBranch(pool, branchId, year, month),
    pool.query(
      `SELECT *
       FROM public.church_monthly_reports
       WHERE branch_id = $1
       ORDER BY period_year DESC, period_month DESC, id DESC
       LIMIT 1`,
      [branchId]
    ),
    monthlyReportsRepo.listReportsForBranch(pool, branchId),
  ]);
  const latestReport = latestReportRow.rows[0] ?? null;
  return {
    currentReport,
    latestReport,
    history: history.slice(0, 12),
    missingCurrentMonthReport: !currentReport || currentReport.status === "draft",
    changesRequested: latestReport && latestReport.status === "changes_requested",
  };
}

async function getBranchMinistrySummary(pool, branchId) {
  const [ministryCounts, departmentCounts, activityCounts] = await Promise.all([
    ministriesRepo.countMinistriesByStatusForBranch(pool, branchId),
    departmentsRepo.countDepartmentsByStatusForBranch(pool, branchId),
    ministryActivityNotesRepo.countActivityNotesByReviewStatusForBranch(pool, branchId),
  ]);
  return {
    publishedMinistries: ministryCounts.published || 0,
    draftMinistries: ministryCounts.draft || 0,
    activeDepartments: departmentCounts.active || 0,
    activityNotesSubmitted:
      (activityCounts.submitted || 0) +
      (activityCounts.reviewed || 0) +
      (activityCounts.follow_up_requested || 0),
    activityNotesReviewed: activityCounts.reviewed || 0,
    followUpRequestedCount: activityCounts.follow_up_requested || 0,
  };
}

async function getBranchRequestSummary(pool, branchId) {
  const [requestCounts, prayerCounts] = await Promise.all([
    memberRequestsRepo.countMemberRequestsByStatusForBranch(pool, branchId),
    prayerRequestsRepo.countPrayerRequestsByStatusForBranch(pool, branchId),
  ]);
  const openRequests =
    (requestCounts.submitted || 0) +
    (requestCounts.in_review || 0) +
    (requestCounts.more_info_needed || 0);
  return {
    openRequests,
    completedRequests: requestCounts.completed || 0,
    approvedRequests: requestCounts.approved || 0,
    prayerSubmitted: prayerCounts.submitted || 0,
    prayerReviewed: prayerCounts.reviewed || 0,
    prayerClosed: prayerCounts.closed || 0,
  };
}

async function buildBranchFlags(pool, branchId, year, month, reportSummary, memberSummary, ministrySummary, requestSummary) {
  const flags = {
    missingCurrentMonthReport: reportSummary.missingCurrentMonthReport,
    changesRequested: reportSummary.changesRequested,
    followUpRequestedCount: ministrySummary.followUpRequestedCount,
    pendingMembers: memberSummary.pending,
    openRequests: requestSummary.openRequests,
  };
  return {
    ...flags,
    attentionItems: computeAttentionItems(flags),
    needsAttention: branchNeedsAttention(flags),
  };
}

async function buildRegistryRow(pool, branch, year, month) {
  const reportSummary = await getBranchReportSummary(pool, branch.id, year, month);
  const memberSummary = await getBranchMemberSummary(pool, branch.id, reportSummary.latestReport);
  const ministrySummary = await getBranchMinistrySummary(pool, branch.id);
  const requestSummary = await getBranchRequestSummary(pool, branch.id);
  const givingSummary = await getBranchGivingSummary(
    pool,
    branch.id,
    year,
    month,
    reportSummary.currentReport
  );
  const branchAdmin = await findPrimaryBranchAdmin(pool, branch.id);
  const contact = formatBranchContact(branch, branchAdmin);
  const flags = await buildBranchFlags(
    pool,
    branch.id,
    year,
    month,
    reportSummary,
    memberSummary,
    ministrySummary,
    requestSummary
  );

  const currentReport = reportSummary.currentReport;
  const latestReport = reportSummary.latestReport;
  const attendanceFromReport =
    currentReport && currentReport.sunday_average != null ? currentReport.sunday_average : null;

  return {
    ...branch,
    location: formatBranchLocation(branch),
    contactName: contact.name,
    contactPhone: contact.phone,
    contactEmail: contact.email,
    activeMembers: memberSummary.active,
    pendingMembers: memberSummary.pending,
    latestReportPeriod: latestReport
      ? `${latestReport.period_year}-${String(latestReport.period_month).padStart(2, "0")}`
      : null,
    latestReportStatus: latestReport ? latestReport.status : null,
    currentMonthReportStatus: currentReport ? currentReport.status : "missing",
    lastAttendanceAverage: attendanceFromReport,
    givingSummaryStatus: givingSummary.status,
    ...flags,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ year: number, month: number, filter?: string, q?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listBranchRegistryForOrganization(pool, organizationId, opts = {}) {
  const branches = await listBranchesForOrganization(pool, organizationId);
  const rows = await Promise.all(
    branches.map((branch) => buildRegistryRow(pool, branch, opts.year, opts.month))
  );
  return rows.filter(
    (row) => matchesRegistryFilter(row, opts.filter) && matchesRegistrySearch(row, opts.q)
  );
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ year: number, month: number }} period
 * @returns {Promise<object>}
 */
async function getOrganizationRegistryStats(pool, organizationId, period) {
  const rows = await Promise.all(
    (await listBranchesForOrganization(pool, organizationId)).map((branch) =>
      buildRegistryRow(pool, branch, period.year, period.month)
    )
  );
  return {
    totalBranches: rows.length,
    branchesWithSubmittedReports: rows.filter((r) => r.currentMonthReportStatus === "submitted").length,
    branchesMissingCurrentReport: rows.filter((r) => r.missingCurrentMonthReport).length,
    branchesNeedingAttention: rows.filter((r) => r.needsAttention).length,
    branchesChangesRequested: rows.filter((r) => r.latestReportStatus === "changes_requested").length,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {number} branchId
 * @param {{ year: number, month: number }} period
 * @returns {Promise<object | null>}
 */
async function getBranchPerformanceSummary(pool, organizationId, branchId, period) {
  const branch = await findBranchByIdForOrganization(pool, branchId, organizationId);
  if (!branch) return null;

  const reportSummary = await getBranchReportSummary(pool, branchId, period.year, period.month);
  const memberSummary = await getBranchMemberSummary(pool, branchId, reportSummary.latestReport);
  const attendanceSummary = await getBranchAttendanceSummary(
    pool,
    branchId,
    period.year,
    period.month,
    reportSummary.currentReport
  );
  const givingSummary = await getBranchGivingSummary(
    pool,
    branchId,
    period.year,
    period.month,
    reportSummary.currentReport
  );
  const ministrySummary = await getBranchMinistrySummary(pool, branchId);
  const requestSummary = await getBranchRequestSummary(pool, branchId);
  const branchAdmin = await findPrimaryBranchAdmin(pool, branch.id);
  const contact = formatBranchContact(branch, branchAdmin);
  const flags = await buildBranchFlags(
    pool,
    branchId,
    period.year,
    period.month,
    reportSummary,
    memberSummary,
    ministrySummary,
    requestSummary
  );

  return {
    branch,
    organizationId,
    period,
    location: formatBranchLocation(branch),
    contact,
    memberSummary,
    attendanceSummary,
    givingSummary,
    reportSummary,
    ministrySummary,
    requestSummary,
    attentionItems: flags.attentionItems,
    needsAttention: flags.needsAttention,
  };
}

module.exports = {
  findBranchByIdForOrganization,
  listBranchesForOrganization,
  listBranchRegistryForOrganization,
  getOrganizationRegistryStats,
  getBranchPerformanceSummary,
  getBranchMemberSummary,
  getBranchAttendanceSummary,
  getBranchGivingSummary,
  getBranchReportSummary,
  getBranchMinistrySummary,
  getBranchRequestSummary,
};
