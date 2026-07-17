"use strict";

/**
 * Growth-only cross-branch comparison dashboard (set-based aggregates).
 * No per-branch query loops. Giving requires HQ can_view_finance.
 */

const hqAdminsRepo = require("../../db/pg/church/hqAdminsRepo");
const {
  CROSS_BRANCH_KPI_DEFINITIONS,
  CROSS_BRANCH_RANKING_KPI_ORDER,
  DEMO_TEST_BRANCH_EXCLUSION_SQL,
} = require("../../church/crossBranchKpiDefinitions");
const { hasEntitlement, getOrganisationPlan } = require("./churchEntitlementService");
const { givingGrandTotal } = require("../../church/givingValidation");

const OVERDUE_DAYS = CROSS_BRANCH_KPI_DEFINITIONS.overdue_pastoral_cases.overdue_days || 7;
const OPEN_CASE_STATUSES = `('open', 'in_follow_up', 'paused', 'pending_supervisor_ack', 'escalated')`;

function wrapPoolWithQueryCounter(pool) {
  let queryCount = 0;
  return {
    queryCount: () => queryCount,
    query(...args) {
      queryCount += 1;
      return pool.query(...args);
    },
  };
}

function parseDateOnly(raw, fallback) {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return fallback;
}

function defaultDateRange(at = new Date()) {
  const y = at.getUTCFullYear();
  const m = at.getUTCMonth() + 1;
  const dateFrom = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const dateTo = `${y}-${String(m).padStart(2, "0")}-${String(last.getUTCDate()).padStart(2, "0")}`;
  return { dateFrom, dateTo };
}

function parseFilters(query = {}, at = new Date()) {
  const defaults = defaultDateRange(at);
  const dateFrom = parseDateOnly(query.date_from || query.dateFrom, defaults.dateFrom);
  const dateTo = parseDateOnly(query.date_to || query.dateTo, defaults.dateTo);
  const branchId = Number(query.branch_id || query.branchId);
  const ministryId = Number(query.ministry_id || query.ministryId);
  const departmentId = Number(query.department_id || query.departmentId);
  const groupId = Number(query.group_id || query.groupId);
  const serviceType = String(query.service || query.attendance_type || "").trim().slice(0, 80);
  return {
    dateFrom: dateFrom <= dateTo ? dateFrom : dateTo,
    dateTo: dateTo >= dateFrom ? dateTo : dateFrom,
    branchId: Number.isFinite(branchId) && branchId > 0 ? branchId : null,
    ministryId: Number.isFinite(ministryId) && ministryId > 0 ? ministryId : null,
    departmentId: Number.isFinite(departmentId) && departmentId > 0 ? departmentId : null,
    groupId: Number.isFinite(groupId) && groupId > 0 ? groupId : null,
    serviceType: serviceType || null,
    includeInactive: String(query.include_inactive || "") === "1",
  };
}

async function assertCrossBranchAccess(pool, organizationId, opts = {}) {
  const plan =
    opts.plan || (await getOrganisationPlan(pool, organizationId, { at: opts.at }));
  if (!plan) {
    const err = new Error("Organisation not found.");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }
  if (!hasEntitlement(plan, "reports.cross_branch")) {
    const err = new Error("Cross-branch comparison requires Growth.");
    err.code = "FOUNDATION_CROSS_BRANCH_FORBIDDEN";
    throw err;
  }
  const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
  await churchPilotFeatureFlagService.assertPilotFeatureAvailable(pool, {
    organizationId,
    flagKey: "reports_cross_branch",
    plan,
  });
  return plan;
}

async function hqAdminCanViewFinance(pool, hqAdminId, organizationId) {
  const admin = await hqAdminsRepo.findHqAdminById(pool, hqAdminId);
  if (!admin || Number(admin.organization_id) !== Number(organizationId) || admin.status !== "active") {
    return false;
  }
  return Boolean(admin.can_view_finance);
}

function buildBranchRankings(rows, canViewFinance) {
  const rankings = {};
  for (const kpiId of CROSS_BRANCH_RANKING_KPI_ORDER) {
    if (kpiId === "giving_totals" && !canViewFinance) continue;
    const valueKey = kpiId === "giving_totals" ? "giving_total" : kpiId;
    const sorted = [...rows].sort((a, b) => {
      const diff = Number(b[valueKey] || 0) - Number(a[valueKey] || 0);
      if (diff !== 0) return diff;
      return a.branch_id - b.branch_id;
    });
    rankings[kpiId] = sorted.map((row, index) => ({
      rank: index + 1,
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      value: Number(row[valueKey] || 0),
    }));
  }
  return rankings;
}

/**
 * Single set-based load of per-branch comparison rows (+ org totals + rankings).
 * @returns {Promise<object>}
 */
async function loadCrossBranchComparison(pool, opts) {
  const organizationId = Number(opts.organizationId);
  await assertCrossBranchAccess(pool, organizationId, { plan: opts.plan, at: opts.at });

  const filters = opts.filters || parseFilters(opts.query || {}, opts.at);
  const canViewFinance = opts.canViewFinance === true;
  const counted = wrapPoolWithQueryCounter(pool);

  const branchStatusSql = filters.includeInactive
    ? `AND b.status IN ('active', 'suspended', 'archived')`
    : DEMO_TEST_BRANCH_EXCLUSION_SQL;

  const params = [organizationId, filters.dateFrom, filters.dateTo, String(OVERDUE_DAYS)];
  // $1 org, $2 from, $3 to, $4 overdue days

  let branchFilterSql = "";
  if (filters.branchId) {
    params.push(filters.branchId);
    branchFilterSql = ` AND b.id = $${params.length}`;
  }

  let attendanceFilterSql = `
    AND a.organization_id = $1
    AND a.service_date >= $2::date
    AND a.service_date <= $3::date
    AND a.status IN ('submitted', 'synced_to_monthly_report')
  `;
  if (filters.serviceType) {
    params.push(filters.serviceType);
    attendanceFilterSql += ` AND a.attendance_type = $${params.length}`;
  }
  if (filters.ministryId) {
    params.push(filters.ministryId);
    attendanceFilterSql += ` AND a.ministry_id = $${params.length}`;
  }

  let departmentJoinSql = "";
  if (filters.departmentId) {
    params.push(filters.departmentId);
    departmentJoinSql = `
      AND EXISTS (
        SELECT 1 FROM public.church_departments d
        WHERE d.id = $${params.length}
          AND d.organization_id = $1
          AND d.branch_id = b.id
      )
    `;
  }

  let groupFilterSql = "";
  if (filters.groupId) {
    params.push(filters.groupId);
    groupFilterSql = ` AND ga.group_id = $${params.length}`;
  }

  const sql = `
    WITH branches AS (
      SELECT b.id AS branch_id, b.name AS branch_name, b.status AS branch_status, b.host_slug, b.slug
      FROM public.church_branches b
      WHERE b.organization_id = $1
        ${branchStatusSql}
        ${branchFilterSql}
        ${departmentJoinSql}
    ),
    members AS (
      SELECT m.branch_id, COUNT(*)::int AS active_members
      FROM public.church_members m
      INNER JOIN branches b ON b.branch_id = m.branch_id
      WHERE m.organization_id = $1 AND m.status = 'verified'
      GROUP BY m.branch_id
    ),
    attendance AS (
      SELECT a.branch_id,
             COALESCE(SUM(COALESCE(a.adults_count, 0) + COALESCE(a.youth_count, 0) + COALESCE(a.children_count, 0)), 0)::int
               AS monthly_attendance,
             COALESCE(SUM(COALESCE(a.first_time_visitors_count, 0)), 0)::int AS visitors
      FROM public.church_attendance_records a
      INNER JOIN branches b ON b.branch_id = a.branch_id
      WHERE 1=1 ${attendanceFilterSql}
      GROUP BY a.branch_id
    ),
    group_att AS (
      SELECT ga.branch_id, COUNT(*)::int AS group_attendance
      FROM public.church_group_attendance ga
      INNER JOIN public.church_group_meetings gm ON gm.id = ga.meeting_id
      INNER JOIN branches b ON b.branch_id = ga.branch_id
      WHERE ga.organization_id = $1
        AND ga.present = true
        AND gm.starts_at::date >= $2::date
        AND gm.starts_at::date <= $3::date
        ${groupFilterSql}
      GROUP BY ga.branch_id
    ),
    event_regs AS (
      SELECT e.branch_id, COUNT(r.id)::int AS event_registrations
      FROM public.church_events e
      INNER JOIN branches b ON b.branch_id = e.branch_id
      LEFT JOIN public.church_event_registrations r
        ON r.event_id = e.id
       AND r.organization_id = $1
       AND r.status <> 'cancelled'
      WHERE e.organization_id = $1
        AND e.status = 'published'
        AND e.event_date >= $2::date
        AND e.event_date <= $3::date
      GROUP BY e.branch_id
    ),
    event_checkins AS (
      SELECT e.branch_id, COUNT(c.id)::int AS event_attendance
      FROM public.church_events e
      INNER JOIN branches b ON b.branch_id = e.branch_id
      LEFT JOIN public.church_event_check_ins c
        ON c.event_id = e.id
       AND c.organization_id = $1
      WHERE e.organization_id = $1
        AND e.status = 'published'
        AND e.event_date >= $2::date
        AND e.event_date <= $3::date
      GROUP BY e.branch_id
    ),
    visitor_fu AS (
      SELECT f.branch_id, COUNT(*)::int AS visitor_retention
      FROM public.church_event_visitor_follow_ups f
      INNER JOIN branches b ON b.branch_id = f.branch_id
      WHERE f.organization_id = $1
        AND f.status = 'closed'
        AND f.created_at::date >= $2::date
        AND f.created_at::date <= $3::date
      GROUP BY f.branch_id
    ),
    absence_fu AS (
      SELECT w.branch_id, COUNT(*)::int AS absence_follow_ups
      FROM public.church_pastoral_automation_work_items w
      INNER JOIN branches b ON b.branch_id = w.branch_id
      WHERE w.organization_id = $1
        AND w.trigger_type = 'missed_service'
        AND w.status IN ('pending', 'accepted', 'converted')
        AND w.created_at::date >= $2::date
        AND w.created_at::date <= $3::date
      GROUP BY w.branch_id
    ),
    pastoral_cases AS (
      SELECT c.branch_id,
             COUNT(*) FILTER (WHERE c.status IN ${OPEN_CASE_STATUSES})::int AS open_cases,
             COUNT(*) FILTER (
               WHERE c.status IN ${OPEN_CASE_STATUSES}
                 AND c.assigned_admin_id IS NOT NULL
             )::int AS pastoral_workload,
             COUNT(*) FILTER (
               WHERE c.status IN ${OPEN_CASE_STATUSES}
                 AND (
                   (c.due_date IS NOT NULL AND c.due_date < CURRENT_DATE)
                   OR (c.due_date IS NULL AND c.updated_at < (now() - ($4::text || ' days')::interval))
                 )
             )::int AS overdue_pastoral_cases
      FROM public.church_pastoral_cases c
      INNER JOIN branches b ON b.branch_id = c.branch_id
      WHERE c.organization_id = $1
      GROUP BY c.branch_id
    ),
    pastoral_notes AS (
      SELECT n.branch_id,
             COUNT(*) FILTER (WHERE n.review_status = 'follow_up_requested')::int AS open_notes
      FROM public.church_ministry_activity_notes n
      INNER JOIN branches b ON b.branch_id = n.branch_id
      WHERE n.organization_id = $1
      GROUP BY n.branch_id
    ),
    surveys AS (
      SELECT s.branch_id,
             COUNT(*) FILTER (
               WHERE s.status = 'submitted'
                 AND s.submitted_at::date >= $2::date
                 AND s.submitted_at::date <= $3::date
             )::int AS survey_completions,
             COUNT(*) FILTER (
               WHERE s.status = 'submitted'
                 AND s.submitted_at::date >= $2::date
                 AND s.submitted_at::date <= $3::date
             )::int AS survey_submitted,
             COUNT(*) FILTER (
               WHERE s.status = 'in_progress'
                 AND s.created_at::date >= $2::date
                 AND s.created_at::date <= $3::date
             )::int AS survey_in_progress
      FROM public.church_survey_response_sessions s
      INNER JOIN branches b ON b.branch_id = s.branch_id
      WHERE s.organization_id = $1
      GROUP BY s.branch_id
    ),
    giving AS (
      SELECT g.branch_id,
             COALESCE(SUM(COALESCE(g.tithes_total, 0)), 0)::numeric AS tithes_total,
             COALESCE(SUM(COALESCE(g.offerings_total, 0)), 0)::numeric AS offerings_total,
             COALESCE(SUM(COALESCE(g.building_fund_total, 0)), 0)::numeric AS building_fund_total,
             COALESCE(SUM(COALESCE(g.missions_fund_total, 0)), 0)::numeric AS missions_fund_total,
             COALESCE(SUM(COALESCE(g.special_offerings_total, 0)), 0)::numeric AS special_offerings_total,
             COALESCE(SUM(COALESCE(g.other_giving_total, 0)), 0)::numeric AS other_giving_total,
             COALESCE(SUM(
               COALESCE(g.tithes_total, 0) + COALESCE(g.offerings_total, 0) + COALESCE(g.building_fund_total, 0)
               + COALESCE(g.missions_fund_total, 0) + COALESCE(g.special_offerings_total, 0)
               + COALESCE(g.other_giving_total, 0)
             ), 0)::numeric AS giving_total
      FROM public.church_giving_summaries g
      INNER JOIN branches b ON b.branch_id = g.branch_id
      WHERE g.organization_id = $1
        AND make_date(g.period_year, g.period_month, 1) <= $3::date
        AND (make_date(g.period_year, g.period_month, 1) + interval '1 month' - interval '1 day') >= $2::date
      GROUP BY g.branch_id
    )
    SELECT b.branch_id,
           b.branch_name,
           b.branch_status,
           COALESCE(m.active_members, 0)::int AS active_members,
           COALESCE(a.monthly_attendance, 0)::int AS monthly_attendance,
           COALESCE(ga.group_attendance, 0)::int AS group_attendance,
           COALESCE(a.visitors, 0)::int AS visitors,
           COALESCE(vf.visitor_retention, 0)::int AS visitor_retention,
           COALESCE(af.absence_follow_ups, 0)::int AS absence_follow_ups,
           COALESCE(er.event_registrations, 0)::int AS event_registrations,
           COALESCE(ec.event_attendance, 0)::int AS event_attendance,
           (COALESCE(pc.open_cases, 0) + COALESCE(pn.open_notes, 0))::int AS open_pastoral_follow_ups,
           COALESCE(pc.pastoral_workload, 0)::int AS pastoral_workload,
           COALESCE(pc.overdue_pastoral_cases, 0)::int AS overdue_pastoral_cases,
           COALESCE(sv.survey_completions, 0)::int AS survey_completions,
           CASE
             WHEN (COALESCE(sv.survey_submitted, 0) + COALESCE(sv.survey_in_progress, 0)) = 0 THEN 0
             ELSE ROUND(
               100.0 * COALESCE(sv.survey_submitted, 0)
               / (COALESCE(sv.survey_submitted, 0) + COALESCE(sv.survey_in_progress, 0))
             )::int
           END AS survey_completion_rate,
           COALESCE(g.tithes_total, 0)::numeric AS tithes_total,
           COALESCE(g.offerings_total, 0)::numeric AS offerings_total,
           COALESCE(g.building_fund_total, 0)::numeric AS building_fund_total,
           COALESCE(g.missions_fund_total, 0)::numeric AS missions_fund_total,
           COALESCE(g.special_offerings_total, 0)::numeric AS special_offerings_total,
           COALESCE(g.other_giving_total, 0)::numeric AS other_giving_total,
           COALESCE(g.giving_total, 0)::numeric AS giving_total
    FROM branches b
    LEFT JOIN members m ON m.branch_id = b.branch_id
    LEFT JOIN attendance a ON a.branch_id = b.branch_id
    LEFT JOIN group_att ga ON ga.branch_id = b.branch_id
    LEFT JOIN event_regs er ON er.branch_id = b.branch_id
    LEFT JOIN event_checkins ec ON ec.branch_id = b.branch_id
    LEFT JOIN visitor_fu vf ON vf.branch_id = b.branch_id
    LEFT JOIN absence_fu af ON af.branch_id = b.branch_id
    LEFT JOIN pastoral_cases pc ON pc.branch_id = b.branch_id
    LEFT JOIN pastoral_notes pn ON pn.branch_id = b.branch_id
    LEFT JOIN surveys sv ON sv.branch_id = b.branch_id
    LEFT JOIN giving g ON g.branch_id = b.branch_id
    ORDER BY b.branch_name ASC, b.branch_id ASC
  `;

  const result = await counted.query(sql, params);
  const rows = result.rows.map((row) => {
    const base = {
      branch_id: Number(row.branch_id),
      branch_name: row.branch_name,
      branch_status: row.branch_status,
      active_members: Number(row.active_members) || 0,
      monthly_attendance: Number(row.monthly_attendance) || 0,
      group_attendance: Number(row.group_attendance) || 0,
      visitors: Number(row.visitors) || 0,
      visitor_retention: Number(row.visitor_retention) || 0,
      absence_follow_ups: Number(row.absence_follow_ups) || 0,
      event_registrations: Number(row.event_registrations) || 0,
      event_attendance: Number(row.event_attendance) || 0,
      open_pastoral_follow_ups: Number(row.open_pastoral_follow_ups) || 0,
      pastoral_workload: Number(row.pastoral_workload) || 0,
      overdue_pastoral_cases: Number(row.overdue_pastoral_cases) || 0,
      survey_completions: Number(row.survey_completions) || 0,
      survey_completion_rate: Number(row.survey_completion_rate) || 0,
    };
    if (canViewFinance) {
      base.giving_total = Number(row.giving_total) || 0;
      base.giving_by_fund = {
        tithes_total: Number(row.tithes_total) || 0,
        offerings_total: Number(row.offerings_total) || 0,
        building_fund_total: Number(row.building_fund_total) || 0,
        missions_fund_total: Number(row.missions_fund_total) || 0,
        special_offerings_total: Number(row.special_offerings_total) || 0,
        other_giving_total: Number(row.other_giving_total) || 0,
      };
    }
    return base;
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.active_members += row.active_members;
      acc.monthly_attendance += row.monthly_attendance;
      acc.group_attendance += row.group_attendance;
      acc.visitors += row.visitors;
      acc.visitor_retention += row.visitor_retention;
      acc.absence_follow_ups += row.absence_follow_ups;
      acc.event_registrations += row.event_registrations;
      acc.event_attendance += row.event_attendance;
      acc.open_pastoral_follow_ups += row.open_pastoral_follow_ups;
      acc.pastoral_workload += row.pastoral_workload;
      acc.overdue_pastoral_cases += row.overdue_pastoral_cases;
      acc.survey_completions += row.survey_completions;
      if (canViewFinance) {
        acc.giving_total += row.giving_total || 0;
        for (const k of Object.keys(acc.giving_by_fund)) {
          acc.giving_by_fund[k] += (row.giving_by_fund && row.giving_by_fund[k]) || 0;
        }
      }
      return acc;
    },
    {
      active_members: 0,
      monthly_attendance: 0,
      group_attendance: 0,
      visitors: 0,
      visitor_retention: 0,
      absence_follow_ups: 0,
      event_registrations: 0,
      event_attendance: 0,
      open_pastoral_follow_ups: 0,
      pastoral_workload: 0,
      overdue_pastoral_cases: 0,
      survey_completions: 0,
      survey_completion_rate: 0,
      giving_total: canViewFinance ? 0 : null,
      giving_by_fund: canViewFinance
        ? {
            tithes_total: 0,
            offerings_total: 0,
            building_fund_total: 0,
            missions_fund_total: 0,
            special_offerings_total: 0,
            other_giving_total: 0,
          }
        : null,
      branch_count: rows.length,
    }
  );

  const surveyDenom = rows.reduce(
    (s, r) => s + (r.survey_completions > 0 || r.survey_completion_rate > 0 ? 1 : 0),
    0
  );
  // Org-level rate: recompute from sum of completions is insufficient; leave weighted average of rates when any row has activity.
  if (rows.length) {
    const rates = rows.map((r) => r.survey_completion_rate).filter((n) => n > 0);
    totals.survey_completion_rate = rates.length
      ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length)
      : 0;
  }
  void surveyDenom;

  const rankings = buildBranchRankings(rows, canViewFinance);

  const chart = {
    labels: rows.map((r) => r.branch_name),
    active_members: rows.map((r) => r.active_members),
    monthly_attendance: rows.map((r) => r.monthly_attendance),
    visitors: rows.map((r) => r.visitors),
    event_registrations: rows.map((r) => r.event_registrations),
    event_attendance: rows.map((r) => r.event_attendance),
  };

  return {
    filters,
    canViewFinance,
    kpiDefinitions: CROSS_BRANCH_KPI_DEFINITIONS,
    rows,
    totals,
    rankings,
    chart,
    queryCount: counted.queryCount(),
  };
}

/**
 * Drill-down for one branch — respects org scope + finance permission.
 * Does not expose prayer request details.
 */
async function loadBranchDrillDown(pool, opts) {
  const organizationId = Number(opts.organizationId);
  const branchId = Number(opts.branchId);
  await assertCrossBranchAccess(pool, organizationId, { plan: opts.plan, at: opts.at });
  const canViewFinance = opts.canViewFinance === true;
  const filters = opts.filters || parseFilters(opts.query || {}, opts.at);

  const counted = wrapPoolWithQueryCounter(pool);
  const branch = await counted.query(
    `SELECT id, name, status, organization_id, host_slug, slug
     FROM public.church_branches
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [branchId, organizationId]
  );
  if (!branch.rows[0]) {
    const err = new Error("Branch not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const comparison = await loadCrossBranchComparison(pool, {
    organizationId,
    canViewFinance,
    filters: { ...filters, branchId },
    at: opts.at,
  });
  const row = comparison.rows[0] || null;

  const attendanceRows = await counted.query(
    `SELECT id, service_date, attendance_type,
            COALESCE(adults_count,0)+COALESCE(youth_count,0)+COALESCE(children_count,0) AS headcount,
            first_time_visitors_count, status, ministry_id
     FROM public.church_attendance_records
     WHERE organization_id = $1 AND branch_id = $2
       AND service_date >= $3::date AND service_date <= $4::date
       AND status IN ('submitted', 'synced_to_monthly_report')
     ORDER BY service_date DESC, id DESC
     LIMIT 50`,
    [organizationId, branchId, filters.dateFrom, filters.dateTo]
  );

  let givingRows = [];
  if (canViewFinance) {
    const g = await counted.query(
      `SELECT id, period_year, period_month, status,
              tithes_total, offerings_total, building_fund_total,
              missions_fund_total, special_offerings_total, other_giving_total
       FROM public.church_giving_summaries
       WHERE organization_id = $1 AND branch_id = $2
         AND make_date(period_year, period_month, 1) <= $4::date
         AND (make_date(period_year, period_month, 1) + interval '1 month' - interval '1 day') >= $3::date
       ORDER BY period_year DESC, period_month DESC
       LIMIT 24`,
      [organizationId, branchId, filters.dateFrom, filters.dateTo]
    );
    givingRows = g.rows.map((r) => ({
      ...r,
      grand_total: givingGrandTotal(r),
    }));
  }

  const pastoral = await counted.query(
    `SELECT 'pastoral_case' AS kind, id, title AS label, status, updated_at AS at
     FROM public.church_pastoral_cases
     WHERE organization_id = $1 AND branch_id = $2
       AND status IN ${OPEN_CASE_STATUSES}
     UNION ALL
     SELECT 'ministry_note' AS kind, id, title AS label, review_status AS status, updated_at AS at
     FROM public.church_ministry_activity_notes
     WHERE organization_id = $1 AND branch_id = $2 AND review_status = 'follow_up_requested'
     ORDER BY at DESC
     LIMIT 40`,
    [organizationId, branchId]
  );

  const sumAttendance = attendanceRows.rows.reduce((s, r) => s + Number(r.headcount || 0), 0);
  const sumVisitors = attendanceRows.rows.reduce(
    (s, r) => s + Number(r.first_time_visitors_count || 0),
    0
  );

  return {
    branch: branch.rows[0],
    filters,
    canViewFinance,
    summary: row,
    attendanceRecords: attendanceRows.rows,
    givingSummaries: givingRows,
    pastoralItems: pastoral.rows,
    reconciliation: {
      table_monthly_attendance: row ? row.monthly_attendance : 0,
      drilldown_attendance_sum: sumAttendance,
      attendance_matches: row ? row.monthly_attendance === sumAttendance : true,
      table_visitors: row ? row.visitors : 0,
      drilldown_visitors_sum: sumVisitors,
      visitors_matches: row ? row.visitors === sumVisitors : true,
    },
    queryCount: counted.queryCount() + comparison.queryCount,
    kpiDefinitions: CROSS_BRANCH_KPI_DEFINITIONS,
    rankings: comparison.rankings,
  };
}

module.exports = {
  CROSS_BRANCH_KPI_DEFINITIONS,
  parseFilters,
  defaultDateRange,
  assertCrossBranchAccess,
  hqAdminCanViewFinance,
  loadCrossBranchComparison,
  loadBranchDrillDown,
  buildBranchRankings,
  wrapPoolWithQueryCounter,
};
