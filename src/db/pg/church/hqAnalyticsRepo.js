"use strict";

const branchesRepo = require("./branchesRepo");
const attendanceRepo = require("./attendanceRepo");
const givingSummariesRepo = require("./givingSummariesRepo");
const monthlyReportsRepo = require("./monthlyReportsRepo");
const ministriesRepo = require("./ministriesRepo");
const departmentsRepo = require("./departmentsRepo");
const memberRequestsRepo = require("./memberRequestsRepo");
const prayerRequestsRepo = require("./prayerRequestsRepo");
const ministryActivityNotesRepo = require("./ministryActivityNotesRepo");
const {
  parseJsonField,
  computeBranchHealthFlags,
  computeBranchHealthLabel,
} = require("../../../church/hqAnalyticsValidation");

async function listOrgBranches(pool, organizationId) {
  return branchesRepo.listBranchesForOrganization(pool, organizationId);
}

async function getOrganizationMemberAnalytics(pool, organizationId, period) {
  const { year, month } = period;
  const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const r = await pool.query(
    `SELECT b.id AS branch_id,
            b.name AS branch_name,
            b.status AS branch_status,
            COUNT(m.id) FILTER (WHERE m.status = 'verified')::int AS active,
            COUNT(m.id) FILTER (WHERE m.status = 'pending')::int AS pending,
            COUNT(m.id) FILTER (WHERE m.status = 'suspended')::int AS suspended,
            COUNT(m.id) FILTER (
              WHERE m.created_at >= $2::date
                AND m.created_at < ($2::date + interval '1 month')
            )::int AS new_this_month
     FROM public.church_branches b
     LEFT JOIN public.church_members m ON m.branch_id = b.id
     WHERE b.organization_id = $1
     GROUP BY b.id, b.name, b.status
     ORDER BY b.name ASC`,
    [organizationId, periodStart]
  );
  const byBranch = r.rows;
  const totals = byBranch.reduce(
    (acc, row) => {
      acc.active += row.active || 0;
      acc.pending += row.pending || 0;
      acc.suspended += row.suspended || 0;
      acc.newThisMonth += row.new_this_month || 0;
      return acc;
    },
    { active: 0, pending: 0, suspended: 0, newThisMonth: 0 }
  );
  const highPendingBranches = byBranch
    .filter((row) => (row.pending || 0) > 0)
    .sort((a, b) => (b.pending || 0) - (a.pending || 0));
  return { totals, byBranch, highPendingBranches };
}

async function getOrganizationAttendanceAnalytics(pool, organizationId, period) {
  const branches = await listOrgBranches(pool, organizationId);
  const byBranch = await Promise.all(
    branches.map(async (branch) => {
      const [attendanceSummary, currentReport, latestDateRow] = await Promise.all([
        attendanceRepo.getAttendanceSummaryForBranchPeriod(pool, branch.id, period.year, period.month),
        monthlyReportsRepo.findReportByPeriodForBranch(pool, branch.id, period.year, period.month),
        pool.query(
          `SELECT MAX(service_date) AS latest_date
           FROM public.church_attendance_records
           WHERE branch_id = $1`,
          [branch.id]
        ),
      ]);
      const fromReport =
        currentReport &&
        ["submitted", "approved", "changes_requested"].includes(currentReport.status)
          ? {
              sundayAverage: currentReport.sunday_average,
              youthAverage: currentReport.youth_average,
              childrenAverage: currentReport.children_average,
              visitorsTotal: currentReport.visitors_total,
            }
          : null;
      return {
        branch_id: branch.id,
        branch_name: branch.name,
        recordCount: attendanceSummary.record_count || 0,
        sundayAverage: fromReport ? fromReport.sundayAverage : null,
        youthAverage: fromReport ? fromReport.youthAverage : attendanceSummary.youth_total || 0,
        childrenAverage: fromReport ? fromReport.childrenAverage : attendanceSummary.children_total || 0,
        visitorsTotal: fromReport ? fromReport.visitorsTotal : attendanceSummary.visitors_total || 0,
        latestAttendanceDate: latestDateRow.rows[0]?.latest_date || null,
        source: fromReport ? "monthly_report" : "attendance_records",
      };
    })
  );
  const totals = byBranch.reduce(
    (acc, row) => {
      acc.recordCount += row.recordCount || 0;
      acc.visitorsTotal += row.visitorsTotal || 0;
      return acc;
    },
    { recordCount: 0, visitorsTotal: 0 }
  );
  return { totals, byBranch };
}

async function getOrganizationReportAnalytics(pool, organizationId, period) {
  const branches = await listOrgBranches(pool, organizationId);
  const branchReports = await Promise.all(
    branches.map(async (branch) => {
      const [currentReport, latestReportRow] = await Promise.all([
        monthlyReportsRepo.findReportByPeriodForBranch(pool, branch.id, period.year, period.month),
        pool.query(
          `SELECT status, period_year, period_month
           FROM public.church_monthly_reports
           WHERE branch_id = $1
           ORDER BY period_year DESC, period_month DESC, id DESC
           LIMIT 1`,
          [branch.id]
        ),
      ]);
      const latest = latestReportRow.rows[0] ?? null;
      const currentStatus = currentReport ? currentReport.status : "missing";
      const missing =
        !currentReport || !["submitted", "approved", "changes_requested"].includes(currentReport.status);
      return {
        branch_id: branch.id,
        branch_name: branch.name,
        currentStatus,
        missing,
        changesRequested: latest && latest.status === "changes_requested",
        submitted: currentStatus === "submitted",
        approved: currentStatus === "approved",
      };
    })
  );
  const submitted = branchReports.filter((r) => r.submitted).length;
  const approved = branchReports.filter((r) => r.approved).length;
  const changesRequested = branchReports.filter((r) => r.changesRequested).length;
  const missing = branchReports.filter((r) => r.missing).length;
  const totalBranches = branches.length;
  const submissionRate =
    totalBranches > 0 ? Math.round((submitted / totalBranches) * 100) : 0;
  return {
    totals: { submitted, approved, changesRequested, missing, totalBranches, submissionRate },
    byBranch: branchReports,
    missingBranches: branchReports.filter((r) => r.missing),
  };
}

async function getOrganizationGivingAnalytics(pool, organizationId, period) {
  const branches = await listOrgBranches(pool, organizationId);
  const byBranch = await Promise.all(
    branches.map(async (branch) => {
      const [giving, currentReport] = await Promise.all([
        givingSummariesRepo.getGivingSummaryForBranchPeriod(pool, branch.id, period.year, period.month),
        monthlyReportsRepo.findReportByPeriodForBranch(pool, branch.id, period.year, period.month),
      ]);
      const snapshot = currentReport ? parseJsonField(currentReport.giving_snapshot_json) : {};
      const total = giving
        ? giving.grand_total
        : Number(snapshot.total_giving || 0);
      const status = giving
        ? giving.status
        : currentReport && currentReport.giving_summary_id
          ? "linked_in_report"
          : total > 0
            ? "submitted"
            : "not_started";
      return {
        branch_id: branch.id,
        branch_name: branch.name,
        status,
        grandTotal: total,
        breakdown: giving
          ? {
              tithes: giving.tithes_total || 0,
              offerings: giving.offerings_total || 0,
              building: giving.building_fund_total || 0,
              missions: giving.missions_fund_total || 0,
              special: giving.special_offerings_total || 0,
              other: giving.other_giving_total || 0,
            }
          : null,
      };
    })
  );
  const breakdown = byBranch.reduce(
    (acc, row) => {
      if (!row.breakdown) return acc;
      acc.tithes += Number(row.breakdown.tithes || 0);
      acc.offerings += Number(row.breakdown.offerings || 0);
      acc.building += Number(row.breakdown.building || 0);
      acc.missions += Number(row.breakdown.missions || 0);
      acc.special += Number(row.breakdown.special || 0);
      acc.other += Number(row.breakdown.other || 0);
      return acc;
    },
    { tithes: 0, offerings: 0, building: 0, missions: 0, special: 0, other: 0 }
  );
  const grandTotal = byBranch.reduce((sum, row) => sum + Number(row.grandTotal || 0), 0);
  return { totals: { grandTotal, breakdown }, byBranch };
}

async function getOrganizationMinistryAnalytics(pool, organizationId) {
  const branches = await listOrgBranches(pool, organizationId);
  const byBranch = await Promise.all(
    branches.map(async (branch) => {
      const [ministryCounts, departmentCounts, activityCounts] = await Promise.all([
        ministriesRepo.countMinistriesByStatusForBranch(pool, branch.id),
        departmentsRepo.countDepartmentsByStatusForBranch(pool, branch.id),
        ministryActivityNotesRepo.countActivityNotesByReviewStatusForBranch(pool, branch.id),
      ]);
      return {
        branch_id: branch.id,
        branch_name: branch.name,
        publishedMinistries: ministryCounts.published || 0,
        activeDepartments: departmentCounts.active || 0,
        notesSubmitted: activityCounts.submitted || 0,
        notesReviewed: activityCounts.reviewed || 0,
        followUpRequested: activityCounts.follow_up_requested || 0,
      };
    })
  );
  const totals = byBranch.reduce(
    (acc, row) => {
      acc.publishedMinistries += row.publishedMinistries || 0;
      acc.activeDepartments += row.activeDepartments || 0;
      acc.notesSubmitted += row.notesSubmitted || 0;
      acc.notesReviewed += row.notesReviewed || 0;
      acc.followUpRequested += row.followUpRequested || 0;
      return acc;
    },
    {
      publishedMinistries: 0,
      activeDepartments: 0,
      notesSubmitted: 0,
      notesReviewed: 0,
      followUpRequested: 0,
    }
  );
  const followUpBranches = byBranch.filter((row) => (row.followUpRequested || 0) > 0);
  return { totals, byBranch, followUpBranches };
}

async function getOrganizationRequestAnalytics(pool, organizationId) {
  const branches = await listOrgBranches(pool, organizationId);
  const byBranch = await Promise.all(
    branches.map(async (branch) => {
      const [requestCounts, prayerCounts] = await Promise.all([
        memberRequestsRepo.countMemberRequestsByStatusForBranch(pool, branch.id),
        prayerRequestsRepo.countPrayerRequestsByStatusForBranch(pool, branch.id),
      ]);
      const openRequests =
        (requestCounts.submitted || 0) +
        (requestCounts.in_review || 0) +
        (requestCounts.more_info_needed || 0);
      return {
        branch_id: branch.id,
        branch_name: branch.name,
        openRequests,
        completedRequests: requestCounts.completed || 0,
        prayerSubmitted: prayerCounts.submitted || 0,
        prayerReviewed: prayerCounts.reviewed || 0,
        prayerClosed: prayerCounts.closed || 0,
      };
    })
  );
  const totals = byBranch.reduce(
    (acc, row) => {
      acc.openRequests += row.openRequests || 0;
      acc.completedRequests += row.completedRequests || 0;
      acc.prayerSubmitted += row.prayerSubmitted || 0;
      acc.prayerReviewed += row.prayerReviewed || 0;
      acc.prayerClosed += row.prayerClosed || 0;
      return acc;
    },
    {
      openRequests: 0,
      completedRequests: 0,
      prayerSubmitted: 0,
      prayerReviewed: 0,
      prayerClosed: 0,
    }
  );
  return { totals, byBranch };
}

async function getBranchComparisonAnalytics(pool, organizationId, period) {
  const [members, attendance, reports, giving, ministry, requests] = await Promise.all([
    getOrganizationMemberAnalytics(pool, organizationId, period),
    getOrganizationAttendanceAnalytics(pool, organizationId, period),
    getOrganizationReportAnalytics(pool, organizationId, period),
    getOrganizationGivingAnalytics(pool, organizationId, period),
    getOrganizationMinistryAnalytics(pool, organizationId),
    getOrganizationRequestAnalytics(pool, organizationId),
  ]);
  const branchMap = new Map();
  for (const row of members.byBranch) {
    branchMap.set(row.branch_id, {
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      branch_status: row.branch_status,
      activeMembers: row.active || 0,
      pendingMembers: row.pending || 0,
      newMembers: row.new_this_month || 0,
    });
  }
  for (const row of attendance.byBranch) {
    const item = branchMap.get(row.branch_id) || { branch_id: row.branch_id, branch_name: row.branch_name };
    Object.assign(item, {
      attendanceRecords: row.recordCount,
      sundayAverage: row.sundayAverage,
      visitorsTotal: row.visitorsTotal,
      latestAttendanceDate: row.latestAttendanceDate,
    });
    branchMap.set(row.branch_id, item);
  }
  for (const row of reports.byBranch) {
    const item = branchMap.get(row.branch_id) || { branch_id: row.branch_id, branch_name: row.branch_name };
    Object.assign(item, {
      reportStatus: row.currentStatus,
      missingReport: row.missing,
      changesRequested: row.changesRequested,
    });
    branchMap.set(row.branch_id, item);
  }
  for (const row of giving.byBranch) {
    const item = branchMap.get(row.branch_id) || { branch_id: row.branch_id, branch_name: row.branch_name };
    Object.assign(item, {
      givingStatus: row.status,
      givingTotal: row.grandTotal,
    });
    branchMap.set(row.branch_id, item);
  }
  for (const row of ministry.byBranch) {
    const item = branchMap.get(row.branch_id) || { branch_id: row.branch_id, branch_name: row.branch_name };
    Object.assign(item, {
      publishedMinistries: row.publishedMinistries,
      ministryFollowUpCount: row.followUpRequested,
    });
    branchMap.set(row.branch_id, item);
  }
  for (const row of requests.byBranch) {
    const item = branchMap.get(row.branch_id) || { branch_id: row.branch_id, branch_name: row.branch_name };
    Object.assign(item, { openRequests: row.openRequests });
    branchMap.set(row.branch_id, item);
  }
  return Array.from(branchMap.values()).sort((a, b) =>
    String(a.branch_name).localeCompare(String(b.branch_name))
  );
}

async function getBranchesNeedingAttention(pool, organizationId, period) {
  const comparison = await getBranchComparisonAnalytics(pool, organizationId, period);
  return comparison.map((row) => {
    const flags = computeBranchHealthFlags({
      missingCurrentMonthReport: row.missingReport,
      changesRequested: row.changesRequested,
      pendingMembers: row.pendingMembers,
      openRequests: row.openRequests,
      ministryFollowUpCount: row.ministryFollowUpCount,
      noAttendanceThisMonth: (row.attendanceRecords || 0) === 0,
      noGivingSummaryThisMonth:
        !row.givingStatus || row.givingStatus === "not_started" || row.givingStatus === "draft",
    });
    const healthLabel = computeBranchHealthLabel(flags);
    return {
      ...row,
      flags,
      healthLabel,
      attentionCount: Object.values(flags).filter(Boolean).length,
    };
  });
}

async function getOrganizationSummaryAnalytics(pool, organizationId, period) {
  const branches = await listOrgBranches(pool, organizationId);
  const [members, attendance, reports, giving, ministry, requests] = await Promise.all([
    getOrganizationMemberAnalytics(pool, organizationId, period),
    getOrganizationAttendanceAnalytics(pool, organizationId, period),
    getOrganizationReportAnalytics(pool, organizationId, period),
    getOrganizationGivingAnalytics(pool, organizationId, period),
    getOrganizationMinistryAnalytics(pool, organizationId),
    getOrganizationRequestAnalytics(pool, organizationId),
  ]);
  const activeBranches = branches.filter((b) => b.status === "active").length;
  const activityNotesSubmitted =
    (ministry.totals.notesSubmitted || 0) +
    (ministry.totals.notesReviewed || 0) +
    (ministry.totals.followUpRequested || 0);
  return {
    totalBranches: branches.length,
    activeBranches,
    activeMembers: members.totals.active,
    newMembersThisMonth: members.totals.newThisMonth,
    pendingMembers: members.totals.pending,
    submittedReportsThisMonth: reports.totals.submitted,
    missingReportsThisMonth: reports.totals.missing,
    totalAttendanceRecords: attendance.totals.recordCount,
    totalGivingAmount: giving.totals.grandTotal,
    openMemberRequests: requests.totals.openRequests,
    ministryActivityNotesSubmitted: activityNotesSubmitted,
  };
}

async function getConsolidatedAnalytics(pool, organizationId, period, comparePeriod) {
  const [
    summary,
    members,
    attendance,
    reports,
    giving,
    ministry,
    requests,
    branchComparison,
    branchHealth,
  ] = await Promise.all([
    getOrganizationSummaryAnalytics(pool, organizationId, period),
    getOrganizationMemberAnalytics(pool, organizationId, period),
    getOrganizationAttendanceAnalytics(pool, organizationId, period),
    getOrganizationReportAnalytics(pool, organizationId, period),
    getOrganizationGivingAnalytics(pool, organizationId, period),
    getOrganizationMinistryAnalytics(pool, organizationId),
    getOrganizationRequestAnalytics(pool, organizationId),
    getBranchComparisonAnalytics(pool, organizationId, period),
    getBranchesNeedingAttention(pool, organizationId, period),
  ]);

  let compareSummary = null;
  if (comparePeriod) {
    compareSummary = await getOrganizationSummaryAnalytics(pool, organizationId, comparePeriod);
  }

  return {
    period,
    comparePeriod,
    summary,
    compareSummary,
    members,
    attendance,
    reports,
    giving,
    ministry,
    requests,
    branchComparison,
    branchHealth,
  };
}

module.exports = {
  getOrganizationMemberAnalytics,
  getOrganizationAttendanceAnalytics,
  getOrganizationReportAnalytics,
  getOrganizationGivingAnalytics,
  getOrganizationMinistryAnalytics,
  getOrganizationRequestAnalytics,
  getBranchComparisonAnalytics,
  getBranchesNeedingAttention,
  getOrganizationSummaryAnalytics,
  getConsolidatedAnalytics,
};
