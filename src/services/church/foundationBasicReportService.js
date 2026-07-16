"use strict";

/**
 * Foundation branch basic reporting — single-branch KPIs, trends, drill-down, export guards.
 * Uses documented KPI definitions; no cross-branch or scheduled report automation.
 */

const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const { givingGrandTotal } = require("../../church/givingValidation");
const {
  FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS,
  FOUNDATION_BASIC_REPORT_KPI_ORDER,
} = require("../../church/foundationBasicReportKpiDefinitions");
const { getOrganisationPlan, getNumericLimit } = require("./churchEntitlementService");
const { CROSS_BRANCH_KPI_DEFINITIONS } = require("../../church/crossBranchKpiDefinitions");

const OVERDUE_DAYS = CROSS_BRANCH_KPI_DEFINITIONS.overdue_pastoral_cases.overdue_days || 7;

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
  const serviceType = String(query.service || query.attendance_type || "").trim().slice(0, 80);
  const ministryId = Number(query.ministry_id || query.ministryId);
  return {
    dateFrom: dateFrom <= dateTo ? dateFrom : dateTo,
    dateTo: dateTo >= dateFrom ? dateTo : dateFrom,
    serviceType: serviceType || null,
    ministryId: Number.isFinite(ministryId) && ministryId > 0 ? ministryId : null,
  };
}

async function branchAdminCanViewFinance(pool, adminId, organizationId, branchId) {
  const admin = await branchAdminsRepo.findBranchAdminById(pool, adminId);
  if (
    !admin ||
    Number(admin.organization_id) !== Number(organizationId) ||
    Number(admin.branch_id) !== Number(branchId) ||
    admin.status !== "active"
  ) {
    return false;
  }
  return Boolean(admin.can_view_finance);
}

async function branchAdminCanExportReports(pool, adminId, organizationId, branchId) {
  const admin = await branchAdminsRepo.findBranchAdminById(pool, adminId);
  if (
    !admin ||
    Number(admin.organization_id) !== Number(organizationId) ||
    Number(admin.branch_id) !== Number(branchId) ||
    admin.status !== "active"
  ) {
    return false;
  }
  return admin.can_export_reports !== false;
}

function getReportExportMaxRows(plan) {
  const limit = getNumericLimit(plan, "reports.export_max_rows");
  if (limit == null || !Number.isFinite(limit) || limit <= 0) return 500;
  return Math.floor(limit);
}

function assertBranchScope(organizationId, branchId, ctxOrgId, ctxBranchId) {
  if (
    Number(organizationId) !== Number(ctxOrgId) ||
    Number(branchId) !== Number(ctxBranchId)
  ) {
    const err = new Error("Branch not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ organizationId: number, branchId: number, filters?: object, query?: object, canViewFinance?: boolean, at?: Date }} opts
 */
async function loadFoundationBasicReport(pool, opts) {
  const organizationId = Number(opts.organizationId);
  const branchId = Number(opts.branchId);
  const filters = opts.filters || parseFilters(opts.query || {}, opts.at);
  const canViewFinance = opts.canViewFinance === true;

  const branchCheck = await pool.query(
    `SELECT id, name FROM public.church_branches
     WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [branchId, organizationId]
  );
  if (!branchCheck.rows[0]) {
    const err = new Error("Branch not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const params = [organizationId, branchId, filters.dateFrom, filters.dateTo];
  let attendanceExtra = "";
  if (filters.serviceType) {
    params.push(filters.serviceType);
    attendanceExtra += ` AND a.attendance_type = $${params.length}`;
  }
  if (filters.ministryId) {
    params.push(filters.ministryId);
    attendanceExtra += ` AND a.ministry_id = $${params.length}`;
  }

  const memberCounts = await pool.query(
    `SELECT
       COUNT(*)::int AS total_members,
       COUNT(*) FILTER (WHERE status = 'verified')::int AS active_members,
       COUNT(*) FILTER (WHERE status IN ('suspended', 'rejected'))::int AS inactive_members
     FROM public.church_members
     WHERE organization_id = $1 AND branch_id = $2`,
    [organizationId, branchId]
  );
  const mc = memberCounts.rows[0] || {};

  const attendance = await pool.query(
    `SELECT
       COALESCE(SUM(COALESCE(a.adults_count, 0) + COALESCE(a.youth_count, 0) + COALESCE(a.children_count, 0)), 0)::int
         AS monthly_attendance,
       COALESCE(SUM(COALESCE(a.first_time_visitors_count, 0)), 0)::int AS visitors
     FROM public.church_attendance_records a
     WHERE a.organization_id = $1 AND a.branch_id = $2
       AND a.service_date >= $3::date AND a.service_date <= $4::date
       AND a.status IN ('submitted', 'synced_to_monthly_report')
       ${attendanceExtra}`,
    params
  );
  const att = attendance.rows[0] || {};

  const events = await pool.query(
    `SELECT COUNT(r.id)::int AS event_registrations
     FROM public.church_events e
     LEFT JOIN public.church_event_registrations r
       ON r.event_id = e.id AND r.organization_id = $1 AND r.status <> 'cancelled'
     WHERE e.organization_id = $1 AND e.branch_id = $2
       AND e.status = 'published'
       AND e.event_date >= $3::date AND e.event_date <= $4::date`,
    [organizationId, branchId, filters.dateFrom, filters.dateTo]
  );

  const eventAttendance = await pool.query(
    `SELECT COUNT(c.id)::int AS event_attendance
     FROM public.church_events e
     LEFT JOIN public.church_event_check_ins c
       ON c.event_id = e.id AND c.organization_id = $1
     WHERE e.organization_id = $1 AND e.branch_id = $2
       AND e.status = 'published'
       AND e.event_date >= $3::date AND e.event_date <= $4::date`,
    [organizationId, branchId, filters.dateFrom, filters.dateTo]
  );

  const prayer = await pool.query(
    `SELECT COUNT(*)::int AS open_prayer_requests
     FROM public.church_prayer_requests
     WHERE organization_id = $1 AND branch_id = $2
       AND status IN ('submitted', 'reviewed')`,
    [organizationId, branchId]
  );

  const pastoral = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM public.church_pastoral_cases c
        WHERE c.organization_id = $1 AND c.branch_id = $2
          AND c.status IN ('open', 'in_follow_up', 'paused', 'pending_supervisor_ack', 'escalated'))
       +
       (SELECT COUNT(*)::int FROM public.church_ministry_activity_notes n
        WHERE n.organization_id = $1 AND n.branch_id = $2
          AND n.review_status = 'follow_up_requested')
       AS open_pastoral_follow_ups`,
    [organizationId, branchId]
  );

  const ministry = await pool.query(
    `SELECT COUNT(*)::int AS ministry_participation
     FROM public.church_member_ministries mm
     INNER JOIN public.church_ministries m ON m.id = mm.ministry_id
     WHERE mm.organization_id = $1 AND mm.branch_id = $2
       AND mm.status = 'active' AND m.status = 'published'`,
    [organizationId, branchId]
  );

  let givingTotal = null;
  if (canViewFinance) {
    const giving = await pool.query(
      `SELECT COALESCE(SUM(
         COALESCE(g.tithes_total, 0) + COALESCE(g.offerings_total, 0) + COALESCE(g.building_fund_total, 0)
         + COALESCE(g.missions_fund_total, 0) + COALESCE(g.special_offerings_total, 0)
         + COALESCE(g.other_giving_total, 0)
       ), 0)::numeric AS giving_total
       FROM public.church_giving_summaries g
       WHERE g.organization_id = $1 AND g.branch_id = $2
         AND make_date(g.period_year, g.period_month, 1) <= $4::date
         AND (make_date(g.period_year, g.period_month, 1) + interval '1 month' - interval '1 day') >= $3::date`,
      [organizationId, branchId, filters.dateFrom, filters.dateTo]
    );
    givingTotal = Number(giving.rows[0]?.giving_total) || 0;
  }

  const kpis = {
    total_members: Number(mc.total_members) || 0,
    active_members: Number(mc.active_members) || 0,
    inactive_members: Number(mc.inactive_members) || 0,
    monthly_attendance: Number(att.monthly_attendance) || 0,
    visitors: Number(att.visitors) || 0,
    event_registrations: Number(events.rows[0]?.event_registrations) || 0,
    event_attendance: Number(eventAttendance.rows[0]?.event_attendance) || 0,
    open_prayer_requests: Number(prayer.rows[0]?.open_prayer_requests) || 0,
    open_pastoral_follow_ups: Number(pastoral.rows[0]?.open_pastoral_follow_ups) || 0,
    ministry_participation: Number(ministry.rows[0]?.ministry_participation) || 0,
  };
  if (canViewFinance) {
    kpis.giving_totals = givingTotal;
  }

  const trend = await pool.query(
    `SELECT
       to_char(date_trunc('month', a.service_date), 'YYYY-MM') AS period_label,
       date_trunc('month', a.service_date)::date AS month_start,
       COALESCE(SUM(
         COALESCE(a.adults_count, 0) + COALESCE(a.youth_count, 0) + COALESCE(a.children_count, 0)
       ), 0)::int AS attendance_total,
       COALESCE(SUM(COALESCE(a.first_time_visitors_count, 0)), 0)::int AS visitors_total
     FROM public.church_attendance_records a
     WHERE a.organization_id = $1 AND a.branch_id = $2
       AND a.service_date >= $3::date AND a.service_date <= $4::date
       AND a.status IN ('submitted', 'synced_to_monthly_report')
       ${attendanceExtra}
     GROUP BY date_trunc('month', a.service_date)
     ORDER BY month_start ASC`,
    params
  );

  return {
    branchName: branchCheck.rows[0].name,
    filters,
    kpis,
    kpiOrder: FOUNDATION_BASIC_REPORT_KPI_ORDER,
    kpiDefinitions: FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS,
    attendanceTrend: trend.rows.map((row) => ({
      period_label: row.period_label,
      month_start: row.month_start,
      attendance_total: Number(row.attendance_total) || 0,
      visitors_total: Number(row.visitors_total) || 0,
    })),
    canViewFinance,
  };
}

/**
 * Drill-down rows for one KPI — capped by exportMaxRows.
 */
async function loadKpiDrillDown(pool, opts) {
  const organizationId = Number(opts.organizationId);
  const branchId = Number(opts.branchId);
  const kpiId = String(opts.kpiId || "").trim();
  const def = FOUNDATION_BASIC_REPORT_KPI_DEFINITIONS[kpiId];
  if (!def || !def.drillDown) {
    const err = new Error("Unknown report metric.");
    err.code = "UNKNOWN_KPI";
    throw err;
  }

  const filters = opts.filters || parseFilters(opts.query || {}, opts.at);
  const canViewFinance = opts.canViewFinance === true;
  if (kpiId === "giving_totals" && !canViewFinance) {
    const err = new Error("Giving data requires finance permission.");
    err.code = "FINANCE_FORBIDDEN";
    throw err;
  }

  const exportMaxRows = Math.max(1, Number(opts.exportMaxRows) || 500);
  const limit = exportMaxRows + 1;

  let rows = [];
  let totalCount = 0;

  if (kpiId === "total_members" || kpiId === "active_members" || kpiId === "inactive_members") {
    let statusSql = "";
    if (kpiId === "active_members") statusSql = ` AND m.status = 'verified'`;
    if (kpiId === "inactive_members") statusSql = ` AND m.status IN ('suspended', 'rejected')`;
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.church_members m
       WHERE m.organization_id = $1 AND m.branch_id = $2 ${statusSql}`,
      [organizationId, branchId]
    );
    totalCount = countR.rows[0]?.c || 0;
    const r = await pool.query(
      `SELECT m.id, m.full_name, m.email, m.status, m.created_at
       FROM public.church_members m
       WHERE m.organization_id = $1 AND m.branch_id = $2 ${statusSql}
       ORDER BY m.full_name ASC, m.id ASC
       LIMIT $3`,
      [organizationId, branchId, limit]
    );
    rows = r.rows;
  } else if (kpiId === "monthly_attendance" || kpiId === "visitors") {
    const params = [organizationId, branchId, filters.dateFrom, filters.dateTo];
    let extra = "";
    if (filters.serviceType) {
      params.push(filters.serviceType);
      extra += ` AND a.attendance_type = $${params.length}`;
    }
    if (filters.ministryId) {
      params.push(filters.ministryId);
      extra += ` AND a.ministry_id = $${params.length}`;
    }
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_attendance_records a
       WHERE a.organization_id = $1 AND a.branch_id = $2
         AND a.service_date >= $3::date AND a.service_date <= $4::date
         AND a.status IN ('submitted', 'synced_to_monthly_report')
         ${extra}`,
      params
    );
    totalCount = countR.rows[0]?.c || 0;
    const r = await pool.query(
      `SELECT a.id, a.service_date, a.attendance_type,
              COALESCE(a.adults_count,0)+COALESCE(a.youth_count,0)+COALESCE(a.children_count,0) AS headcount,
              a.first_time_visitors_count, a.status
       FROM public.church_attendance_records a
       WHERE a.organization_id = $1 AND a.branch_id = $2
         AND a.service_date >= $3::date AND a.service_date <= $4::date
         AND a.status IN ('submitted', 'synced_to_monthly_report')
         ${extra}
       ORDER BY a.service_date DESC, a.id DESC
       LIMIT $${params.length + 1}`,
      [...params, limit]
    );
    rows = r.rows;
  } else if (kpiId === "event_attendance") {
    const countR = await pool.query(
      `SELECT COUNT(c.id)::int AS c
       FROM public.church_event_check_ins c
       INNER JOIN public.church_events e ON e.id = c.event_id
       WHERE c.organization_id = $1 AND c.branch_id = $2
         AND e.status = 'published'
         AND e.event_date >= $3::date AND e.event_date <= $4::date`,
      [organizationId, branchId, filters.dateFrom, filters.dateTo]
    );
    totalCount = countR.rows[0]?.c || 0;
    const r = await pool.query(
      `SELECT c.id, e.title, e.event_date, c.method, c.checked_in_at
       FROM public.church_event_check_ins c
       INNER JOIN public.church_events e ON e.id = c.event_id
       WHERE c.organization_id = $1 AND c.branch_id = $2
         AND e.status = 'published'
         AND e.event_date >= $3::date AND e.event_date <= $4::date
       ORDER BY c.checked_in_at DESC, c.id DESC
       LIMIT $5`,
      [organizationId, branchId, filters.dateFrom, filters.dateTo, limit]
    );
    rows = r.rows;
  } else if (kpiId === "event_registrations") {
    const countR = await pool.query(
      `SELECT COUNT(r.id)::int AS c
       FROM public.church_event_registrations r
       INNER JOIN public.church_events e ON e.id = r.event_id
       WHERE r.organization_id = $1 AND r.branch_id = $2
         AND r.status <> 'cancelled'
         AND e.status = 'published'
         AND e.event_date >= $3::date AND e.event_date <= $4::date`,
      [organizationId, branchId, filters.dateFrom, filters.dateTo]
    );
    totalCount = countR.rows[0]?.c || 0;
    const r = await pool.query(
      `SELECT r.id, e.title, e.event_date, r.status, r.party_size, r.created_at
       FROM public.church_event_registrations r
       INNER JOIN public.church_events e ON e.id = r.event_id
       WHERE r.organization_id = $1 AND r.branch_id = $2
         AND r.status <> 'cancelled'
         AND e.status = 'published'
         AND e.event_date >= $3::date AND e.event_date <= $4::date
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT $5`,
      [organizationId, branchId, filters.dateFrom, filters.dateTo, limit]
    );
    rows = r.rows;
  } else if (kpiId === "open_prayer_requests") {
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.church_prayer_requests
       WHERE organization_id = $1 AND branch_id = $2
         AND status IN ('submitted', 'reviewed')`,
      [organizationId, branchId]
    );
    totalCount = countR.rows[0]?.c || 0;
    const r = await pool.query(
      `SELECT id, prayer_topic, status, urgency, privacy_level, created_at
       FROM public.church_prayer_requests
       WHERE organization_id = $1 AND branch_id = $2
         AND status IN ('submitted', 'reviewed')
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [organizationId, branchId, limit]
    );
    rows = r.rows;
  } else if (kpiId === "open_pastoral_follow_ups") {
    const countR = await pool.query(
      `SELECT (
         (SELECT COUNT(*)::int FROM public.church_pastoral_cases c
          WHERE c.organization_id = $1 AND c.branch_id = $2
            AND c.status IN ('open', 'in_follow_up', 'paused', 'pending_supervisor_ack', 'escalated'))
         +
         (SELECT COUNT(*)::int FROM public.church_ministry_activity_notes n
          WHERE n.organization_id = $1 AND n.branch_id = $2 AND n.review_status = 'follow_up_requested')
       ) AS c`,
      [organizationId, branchId]
    );
    totalCount = countR.rows[0]?.c || 0;
    const r = await pool.query(
      `(
         SELECT 'pastoral_case'::text AS source_type, c.id, c.status,
                c.title AS label, c.updated_at AS sort_at
         FROM public.church_pastoral_cases c
         WHERE c.organization_id = $1 AND c.branch_id = $2
           AND c.status IN ('open', 'in_follow_up', 'paused', 'pending_supervisor_ack', 'escalated')
       )
       UNION ALL
       (
         SELECT 'ministry_note'::text, n.id, n.review_status,
                n.activity_summary, n.updated_at
         FROM public.church_ministry_activity_notes n
         WHERE n.organization_id = $1 AND n.branch_id = $2
           AND n.review_status = 'follow_up_requested'
       )
       ORDER BY sort_at DESC
       LIMIT $3`,
      [organizationId, branchId, limit]
    );
    rows = r.rows;
  } else if (kpiId === "giving_totals") {
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.church_giving_summaries g
       WHERE g.organization_id = $1 AND g.branch_id = $2
         AND make_date(g.period_year, g.period_month, 1) <= $4::date
         AND (make_date(g.period_year, g.period_month, 1) + interval '1 month' - interval '1 day') >= $3::date`,
      [organizationId, branchId, filters.dateFrom, filters.dateTo]
    );
    totalCount = countR.rows[0]?.c || 0;
    const r = await pool.query(
      `SELECT g.id, g.period_year, g.period_month, g.status,
              g.tithes_total, g.offerings_total, g.building_fund_total,
              g.missions_fund_total, g.special_offerings_total, g.other_giving_total
       FROM public.church_giving_summaries g
       WHERE g.organization_id = $1 AND g.branch_id = $2
         AND make_date(g.period_year, g.period_month, 1) <= $4::date
         AND (make_date(g.period_year, g.period_month, 1) + interval '1 month' - interval '1 day') >= $3::date
       ORDER BY g.period_year DESC, g.period_month DESC
       LIMIT $5`,
      [organizationId, branchId, filters.dateFrom, filters.dateTo, limit]
    );
    rows = r.rows.map((row) => ({
      ...row,
      period_total: givingGrandTotal(row),
    }));
  } else if (kpiId === "ministry_participation") {
    const countR = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM public.church_member_ministries mm
       INNER JOIN public.church_ministries m ON m.id = mm.ministry_id
       WHERE mm.organization_id = $1 AND mm.branch_id = $2
         AND mm.status = 'active' AND m.status = 'published'`,
      [organizationId, branchId]
    );
    totalCount = countR.rows[0]?.c || 0;
    const r = await pool.query(
      `SELECT mm.id, m.name AS ministry_name, mm.role, mm.status, mm.joined_at,
              mem.full_name AS member_name
       FROM public.church_member_ministries mm
       INNER JOIN public.church_ministries m ON m.id = mm.ministry_id
       INNER JOIN public.church_members mem ON mem.id = mm.member_id
       WHERE mm.organization_id = $1 AND mm.branch_id = $2
         AND mm.status = 'active' AND m.status = 'published'
       ORDER BY m.name ASC, mem.full_name ASC
       LIMIT $3`,
      [organizationId, branchId, limit]
    );
    rows = r.rows;
  }

  const truncated = rows.length > exportMaxRows;
  if (truncated) rows = rows.slice(0, exportMaxRows);

  return {
    kpiId,
    definition: def,
    filters,
    rows,
    totalCount,
    truncated,
    exportMaxRows,
  };
}

async function resolveReportPermissions(pool, opts) {
  const plan = await getOrganisationPlan(pool, opts.organizationId);
  const exportMaxRows = getReportExportMaxRows(plan);
  const canViewFinance = await branchAdminCanViewFinance(
    pool,
    opts.adminId,
    opts.organizationId,
    opts.branchId
  );
  const canExportReports = await branchAdminCanExportReports(
    pool,
    opts.adminId,
    opts.organizationId,
    opts.branchId
  );
  return { plan, exportMaxRows, canViewFinance, canExportReports };
}

module.exports = {
  parseFilters,
  defaultDateRange,
  branchAdminCanViewFinance,
  branchAdminCanExportReports,
  getReportExportMaxRows,
  assertBranchScope,
  loadFoundationBasicReport,
  loadKpiDrillDown,
  resolveReportPermissions,
  OVERDUE_DAYS,
};
