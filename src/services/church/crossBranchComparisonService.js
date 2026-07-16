"use strict";

/**
 * Growth-only cross-branch comparison dashboard (set-based aggregates).
 * No per-branch query loops. Giving requires HQ can_view_finance.
 */

const hqAdminsRepo = require("../../db/pg/church/hqAdminsRepo");
const {
  CROSS_BRANCH_KPI_DEFINITIONS,
  DEMO_TEST_BRANCH_EXCLUSION_SQL,
} = require("../../church/crossBranchKpiDefinitions");
const { hasEntitlement, getOrganisationPlan } = require("./churchEntitlementService");
const { givingGrandTotal } = require("../../church/givingValidation");

const OVERDUE_DAYS = CROSS_BRANCH_KPI_DEFINITIONS.overdue_pastoral_cases.overdue_days || 7;

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
  const serviceType = String(query.service || query.attendance_type || "").trim().slice(0, 80);
  return {
    dateFrom: dateFrom <= dateTo ? dateFrom : dateTo,
    dateTo: dateTo >= dateFrom ? dateTo : dateFrom,
    branchId: Number.isFinite(branchId) && branchId > 0 ? branchId : null,
    ministryId: Number.isFinite(ministryId) && ministryId > 0 ? ministryId : null,
    departmentId: Number.isFinite(departmentId) && departmentId > 0 ? departmentId : null,
    serviceType: serviceType || null,
    includeInactive: String(query.include_inactive || "") === "1",
  };
}

async function assertCrossBranchAccess(pool, organizationId) {
  const plan = await getOrganisationPlan(pool, organizationId);
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

/**
 * Single set-based load of per-branch comparison rows (+ org totals).
 * @returns {Promise<object>}
 */
async function loadCrossBranchComparison(pool, opts) {
  const organizationId = Number(opts.organizationId);
  await assertCrossBranchAccess(pool, organizationId);

  const filters = opts.filters || parseFilters(opts.query || {}, opts.at);
  const canViewFinance = opts.canViewFinance === true;
  const counted = wrapPoolWithQueryCounter(pool);

  const branchStatusSql = filters.includeInactive
    ? `AND b.status IN ('active', 'suspended', 'archived')`
    : DEMO_TEST_BRANCH_EXCLUSION_SQL;

  const params = [organizationId, filters.dateFrom, filters.dateTo];
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

  // Department/group filter: attendance from campuses that host the department.
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
    events AS (
      SELECT e.branch_id, COUNT(*)::int AS event_registrations
      FROM public.church_events e
      INNER JOIN branches b ON b.branch_id = e.branch_id
      WHERE e.organization_id = $1
        AND e.status = 'published'
        AND e.event_date >= $2::date
        AND e.event_date <= $3::date
      GROUP BY e.branch_id
    ),
    event_attendance AS (
      SELECT a.branch_id,
             COALESCE(SUM(COALESCE(a.adults_count, 0) + COALESCE(a.youth_count, 0) + COALESCE(a.children_count, 0)), 0)::int
               AS event_attendance
      FROM public.church_attendance_records a
      INNER JOIN branches b ON b.branch_id = a.branch_id
      INNER JOIN public.church_events e
        ON e.branch_id = a.branch_id
       AND e.organization_id = $1
       AND e.status = 'published'
       AND e.event_date = a.service_date
      WHERE a.organization_id = $1
        AND a.service_date >= $2::date
        AND a.service_date <= $3::date
        AND a.status IN ('submitted', 'synced_to_monthly_report')
      GROUP BY a.branch_id
    ),
    pastoral_notes AS (
      SELECT n.branch_id,
             COUNT(*) FILTER (WHERE n.review_status = 'follow_up_requested')::int AS open_notes,
             COUNT(*) FILTER (
               WHERE n.review_status = 'follow_up_requested'
                 AND n.updated_at < (now() - ($4::text || ' days')::interval)
             )::int AS overdue_notes
      FROM public.church_ministry_activity_notes n
      INNER JOIN branches b ON b.branch_id = n.branch_id
      WHERE n.organization_id = $1
      GROUP BY n.branch_id
    ),
    pastoral_requests AS (
      SELECT r.branch_id,
             COUNT(*) FILTER (
               WHERE r.status IN ('submitted', 'in_review', 'more_info_needed')
             )::int AS open_requests,
             COUNT(*) FILTER (
               WHERE r.status IN ('submitted', 'in_review', 'more_info_needed')
                 AND r.created_at < (now() - ($4::text || ' days')::interval)
             )::int AS overdue_requests
      FROM public.church_member_requests r
      INNER JOIN branches b ON b.branch_id = r.branch_id
      WHERE r.organization_id = $1
      GROUP BY r.branch_id
    ),
    giving AS (
      SELECT g.branch_id,
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
           COALESCE(a.visitors, 0)::int AS visitors,
           COALESCE(e.event_registrations, 0)::int AS event_registrations,
           COALESCE(ea.event_attendance, 0)::int AS event_attendance,
           (COALESCE(pn.open_notes, 0) + COALESCE(pr.open_requests, 0))::int AS open_pastoral_follow_ups,
           (COALESCE(pn.overdue_notes, 0) + COALESCE(pr.overdue_requests, 0))::int AS overdue_pastoral_cases,
           COALESCE(g.giving_total, 0)::numeric AS giving_total
    FROM branches b
    LEFT JOIN members m ON m.branch_id = b.branch_id
    LEFT JOIN attendance a ON a.branch_id = b.branch_id
    LEFT JOIN events e ON e.branch_id = b.branch_id
    LEFT JOIN event_attendance ea ON ea.branch_id = b.branch_id
    LEFT JOIN pastoral_notes pn ON pn.branch_id = b.branch_id
    LEFT JOIN pastoral_requests pr ON pr.branch_id = b.branch_id
    LEFT JOIN giving g ON g.branch_id = b.branch_id
    ORDER BY b.branch_name ASC, b.branch_id ASC
  `;

  // $4 = overdue days
  const queryParams = [...params];
  // Insert overdue days after date params — currently params are org, from, to, [branch], [service], [ministry], [dept]
  // Rewrite: use fixed positions. Simpler to append overdue as last and reference by number.

  // Fix SQL to use last param for overdue days
  const overdueParamIndex = params.length + 1;
  const sqlFixed = sql.replace(/\$4::text/g, `$${overdueParamIndex}::text`);
  queryParams.push(String(OVERDUE_DAYS));

  const result = await counted.query(sqlFixed, queryParams);
  const rows = result.rows.map((row) => {
    const base = {
      branch_id: Number(row.branch_id),
      branch_name: row.branch_name,
      branch_status: row.branch_status,
      active_members: Number(row.active_members) || 0,
      monthly_attendance: Number(row.monthly_attendance) || 0,
      visitors: Number(row.visitors) || 0,
      event_registrations: Number(row.event_registrations) || 0,
      event_attendance: Number(row.event_attendance) || 0,
      open_pastoral_follow_ups: Number(row.open_pastoral_follow_ups) || 0,
      overdue_pastoral_cases: Number(row.overdue_pastoral_cases) || 0,
    };
    if (canViewFinance) {
      base.giving_total = Number(row.giving_total) || 0;
    }
    return base;
  });

  const totals = rows.reduce(
    (acc, row) => {
      acc.active_members += row.active_members;
      acc.monthly_attendance += row.monthly_attendance;
      acc.visitors += row.visitors;
      acc.event_registrations += row.event_registrations;
      acc.event_attendance += row.event_attendance;
      acc.open_pastoral_follow_ups += row.open_pastoral_follow_ups;
      acc.overdue_pastoral_cases += row.overdue_pastoral_cases;
      if (canViewFinance) acc.giving_total += row.giving_total || 0;
      return acc;
    },
    {
      active_members: 0,
      monthly_attendance: 0,
      visitors: 0,
      event_registrations: 0,
      event_attendance: 0,
      open_pastoral_follow_ups: 0,
      overdue_pastoral_cases: 0,
      giving_total: canViewFinance ? 0 : null,
      branch_count: rows.length,
    }
  );

  // Chart series from same rows (table is source of truth)
  const chart = {
    labels: rows.map((r) => r.branch_name),
    active_members: rows.map((r) => r.active_members),
    monthly_attendance: rows.map((r) => r.monthly_attendance),
    visitors: rows.map((r) => r.visitors),
  };

  return {
    filters,
    canViewFinance,
    kpiDefinitions: CROSS_BRANCH_KPI_DEFINITIONS,
    rows,
    totals,
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
  await assertCrossBranchAccess(pool, organizationId);
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

  // Pastoral drill-down: counts + non-sensitive request subjects only (no prayer bodies)
  const pastoral = await counted.query(
    `SELECT 'ministry_note' AS kind, id, title AS label, review_status AS status, updated_at AS at
     FROM public.church_ministry_activity_notes
     WHERE organization_id = $1 AND branch_id = $2 AND review_status = 'follow_up_requested'
     UNION ALL
     SELECT 'member_request' AS kind, id, subject AS label, status, created_at AS at
     FROM public.church_member_requests
     WHERE organization_id = $1 AND branch_id = $2
       AND status IN ('submitted', 'in_review', 'more_info_needed')
     ORDER BY at DESC
     LIMIT 40`,
    [organizationId, branchId]
  );

  const sumAttendance = attendanceRows.rows.reduce(
    (s, r) => s + Number(r.headcount || 0),
    0
  );
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
  wrapPoolWithQueryCounter,
};
