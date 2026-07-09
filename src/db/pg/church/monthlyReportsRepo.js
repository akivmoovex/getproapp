"use strict";

const { formatReportPeriod } = require("../../../church/monthlyReportValidation");

function rowWithPeriodLabel(row) {
  if (!row) return row;
  return {
    ...row,
    period_month_label: formatReportPeriod(row.period_year, row.period_month),
  };
}

const REPORT_FIELDS = `
  starting_members, new_members, transferred_members, inactive_members, ending_members,
  sunday_average, midweek_average, children_average, youth_average, visitors_total,
  services_held, ministry_meetings_held, department_meetings_held,
  outreach_activities, special_events, ministry_activity_notes,
  main_challenges, support_needed_from_hq,
  giving_summary_id, giving_snapshot_json, attendance_snapshot_json
`;

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createOrUpdateDraftReportForBranchPeriod(pool, fields) {
  const existing = await findReportByPeriodForBranch(
    pool,
    fields.branch_id,
    fields.period_year,
    fields.period_month
  );
  if (existing && existing.status !== "draft" && existing.status !== "changes_requested") {
    const err = new Error("Report already submitted and cannot be edited.");
    err.code = "REPORT_LOCKED";
    throw err;
  }

  const values = [
    fields.organization_id,
    fields.branch_id,
    fields.period_year,
    fields.period_month,
    fields.starting_members ?? 0,
    fields.new_members ?? 0,
    fields.transferred_members ?? 0,
    fields.inactive_members ?? 0,
    fields.ending_members ?? 0,
    fields.sunday_average ?? 0,
    fields.midweek_average ?? 0,
    fields.children_average ?? 0,
    fields.youth_average ?? 0,
    fields.visitors_total ?? 0,
    fields.services_held ?? 0,
    fields.ministry_meetings_held ?? 0,
    fields.department_meetings_held ?? 0,
    fields.outreach_activities ?? 0,
    fields.special_events ?? 0,
    fields.ministry_activity_notes ?? "",
    fields.main_challenges ?? "",
    fields.support_needed_from_hq ?? "",
    fields.giving_summary_id ?? null,
    JSON.stringify(fields.giving_snapshot_json || {}),
    JSON.stringify(fields.attendance_snapshot_json || {}),
  ];

  const r = await pool.query(
    `INSERT INTO public.church_monthly_reports (
       organization_id, branch_id, period_year, period_month, status,
       ${REPORT_FIELDS}
     ) VALUES (
       $1, $2, $3, $4, 'draft',
       $5, $6, $7, $8, $9,
       $10, $11, $12, $13, $14,
       $15, $16, $17, $18, $19,
       $20, $21, $22,
       $23::jsonb, $24::jsonb
     )
     ON CONFLICT (branch_id, period_year, period_month)
     DO UPDATE SET
       starting_members = EXCLUDED.starting_members,
       new_members = EXCLUDED.new_members,
       transferred_members = EXCLUDED.transferred_members,
       inactive_members = EXCLUDED.inactive_members,
       ending_members = EXCLUDED.ending_members,
       sunday_average = EXCLUDED.sunday_average,
       midweek_average = EXCLUDED.midweek_average,
       children_average = EXCLUDED.children_average,
       youth_average = EXCLUDED.youth_average,
       visitors_total = EXCLUDED.visitors_total,
       services_held = EXCLUDED.services_held,
       ministry_meetings_held = EXCLUDED.ministry_meetings_held,
       department_meetings_held = EXCLUDED.department_meetings_held,
       outreach_activities = EXCLUDED.outreach_activities,
       special_events = EXCLUDED.special_events,
       ministry_activity_notes = EXCLUDED.ministry_activity_notes,
       main_challenges = EXCLUDED.main_challenges,
       support_needed_from_hq = EXCLUDED.support_needed_from_hq,
       giving_summary_id = EXCLUDED.giving_summary_id,
       giving_snapshot_json = EXCLUDED.giving_snapshot_json,
       attendance_snapshot_json = EXCLUDED.attendance_snapshot_json,
       status = CASE
         WHEN public.church_monthly_reports.status = 'changes_requested' THEN 'draft'
         ELSE public.church_monthly_reports.status
       END,
       updated_at = now()
     WHERE public.church_monthly_reports.status IN ('draft', 'changes_requested')
     RETURNING *`,
    values
  );

  if (r.rows.length === 0 && existing) {
    const err = new Error("Report already submitted and cannot be edited.");
    err.code = "REPORT_LOCKED";
    throw err;
  }

  return rowWithPeriodLabel(r.rows[0]);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} reportId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findReportByIdForBranch(pool, reportId, branchId) {
  const r = await pool.query(
    `SELECT r.*, ba.full_name AS submitted_by_name
     FROM public.church_monthly_reports r
     LEFT JOIN public.church_branch_admins ba ON ba.id = r.submitted_by_admin_id
     WHERE r.id = $1 AND r.branch_id = $2
     LIMIT 1`,
    [reportId, branchId]
  );
  return rowWithPeriodLabel(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<object | null>}
 */
async function findReportByPeriodForBranch(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT r.*, ba.full_name AS submitted_by_name
     FROM public.church_monthly_reports r
     LEFT JOIN public.church_branch_admins ba ON ba.id = r.submitted_by_admin_id
     WHERE r.branch_id = $1 AND r.period_year = $2 AND r.period_month = $3
     LIMIT 1`,
    [branchId, year, month]
  );
  return rowWithPeriodLabel(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listReportsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT r.*, ba.full_name AS submitted_by_name
     FROM public.church_monthly_reports r
     LEFT JOIN public.church_branch_admins ba ON ba.id = r.submitted_by_admin_id
     WHERE r.branch_id = $1
     ORDER BY r.period_year DESC, r.period_month DESC, r.id DESC`,
    [branchId]
  );
  return r.rows.map(rowWithPeriodLabel);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} reportId
 * @param {number} branchId
 * @param {number} adminId
 * @param {object} snapshots
 * @returns {Promise<object | null>}
 */
async function submitReportForBranch(pool, reportId, branchId, adminId, snapshots) {
  const r = await pool.query(
    `UPDATE public.church_monthly_reports
     SET status = 'submitted',
         submitted_at = now(),
         submitted_by_admin_id = $1,
         sunday_average = $2,
         midweek_average = $3,
         children_average = $4,
         youth_average = $5,
         visitors_total = $6,
         giving_summary_id = $7,
         giving_snapshot_json = $8::jsonb,
         attendance_snapshot_json = $9::jsonb,
         ministry_activity_snapshot_json = $10::jsonb,
         updated_at = now()
     WHERE id = $11 AND branch_id = $12 AND status IN ('draft', 'changes_requested')
     RETURNING *`,
    [
      adminId,
      snapshots.sunday_average ?? 0,
      snapshots.midweek_average ?? 0,
      snapshots.children_average ?? 0,
      snapshots.youth_average ?? 0,
      snapshots.visitors_total ?? 0,
      snapshots.giving_summary_id ?? null,
      JSON.stringify(snapshots.giving_snapshot_json || {}),
      JSON.stringify(snapshots.attendance_snapshot_json || {}),
      JSON.stringify(snapshots.ministry_activity_snapshot_json || {}),
      reportId,
      branchId,
    ]
  );
  return rowWithPeriodLabel(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countReportsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_monthly_reports
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const out = { draft: 0, submitted: 0, approved: 0, changes_requested: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function getCurrentMonthReportForBranch(pool, branchId) {
  const now = new Date();
  return findReportByPeriodForBranch(pool, branchId, now.getFullYear(), now.getMonth() + 1);
}

const ORG_REPORT_SELECT = `
  SELECT r.*,
         b.name AS branch_name,
         ba.full_name AS submitted_by_name
  FROM public.church_monthly_reports r
  INNER JOIN public.church_branches b ON b.id = r.branch_id
  LEFT JOIN public.church_branch_admins ba ON ba.id = r.submitted_by_admin_id
`;

function mapOrgReportRows(rows) {
  return rows.map((row) => {
    const mapped = rowWithPeriodLabel(row);
    const giving =
      typeof row.giving_snapshot_json === "object"
        ? row.giving_snapshot_json
        : {};
    mapped.giving_included = Boolean(row.giving_summary_id) || Number(giving.total_giving || 0) > 0;
    return mapped;
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<object[]>}
 */
async function listSubmittedReportsForOrganization(pool, organizationId) {
  const r = await pool.query(
    `${ORG_REPORT_SELECT}
     WHERE r.organization_id = $1 AND r.status = 'submitted'
     ORDER BY r.submitted_at DESC NULLS LAST, r.id DESC`,
    [organizationId]
  );
  return mapOrgReportRows(r.rows);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listReportsForOrganization(pool, organizationId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  const r = await pool.query(
    `${ORG_REPORT_SELECT}
     WHERE r.organization_id = $1
       AND r.status IN ('submitted', 'approved', 'changes_requested')
     ORDER BY r.submitted_at DESC NULLS LAST, r.period_year DESC, r.period_month DESC
     LIMIT $2`,
    [organizationId, limit]
  );
  return mapOrgReportRows(r.rows);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} reportId
 * @param {number} organizationId
 * @returns {Promise<object | null>}
 */
async function findReportByIdForOrganization(pool, reportId, organizationId) {
  const r = await pool.query(
    `${ORG_REPORT_SELECT}
     WHERE r.id = $1 AND r.organization_id = $2
     LIMIT 1`,
    [reportId, organizationId]
  );
  const row = r.rows[0];
  return row ? mapOrgReportRows([row])[0] : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} reportId
 * @param {number} organizationId
 * @param {string} comment
 * @returns {Promise<object | null>}
 */
async function approveReportForOrganization(pool, reportId, organizationId, comment) {
  const r = await pool.query(
    `UPDATE public.church_monthly_reports
     SET status = 'approved',
         hq_review_comment = $1,
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $2 AND organization_id = $3 AND status = 'submitted'
     RETURNING *`,
    [comment || "", reportId, organizationId]
  );
  if (!r.rows[0]) return null;
  return findReportByIdForOrganization(pool, reportId, organizationId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} reportId
 * @param {number} organizationId
 * @param {string} comment
 * @returns {Promise<object | null>}
 */
async function requestChangesForOrganization(pool, reportId, organizationId, comment) {
  const r = await pool.query(
    `UPDATE public.church_monthly_reports
     SET status = 'changes_requested',
         hq_review_comment = $1,
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $2 AND organization_id = $3 AND status = 'submitted'
     RETURNING *`,
    [comment, reportId, organizationId]
  );
  if (!r.rows[0]) return null;
  return findReportByIdForOrganization(pool, reportId, organizationId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<Record<string, number>>}
 */
async function countReportsByStatusForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_monthly_reports
     WHERE organization_id = $1
     GROUP BY status`,
    [organizationId]
  );
  const out = { draft: 0, submitted: 0, approved: 0, changes_requested: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

module.exports = {
  createOrUpdateDraftReportForBranchPeriod,
  findReportByIdForBranch,
  findReportByPeriodForBranch,
  listReportsForBranch,
  submitReportForBranch,
  countReportsByStatusForBranch,
  getCurrentMonthReportForBranch,
  listSubmittedReportsForOrganization,
  listReportsForOrganization,
  findReportByIdForOrganization,
  approveReportForOrganization,
  requestChangesForOrganization,
  countReportsByStatusForOrganization,
  formatReportPeriod,
};
