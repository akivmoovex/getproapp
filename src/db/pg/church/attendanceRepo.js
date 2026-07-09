"use strict";

function totalAttendance(row) {
  return (
    Number(row.adults_count || 0) +
    Number(row.youth_count || 0) +
    Number(row.children_count || 0)
  );
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createAttendanceRecord(pool, fields) {
  const headcount = totalAttendance(fields);
  const r = await pool.query(
    `INSERT INTO public.church_attendance_records (
       organization_id, branch_id, service_date, service_label,
       attendance_type, service_name,
       adults_count, youth_count, children_count,
       first_time_visitors_count, new_members_count, volunteers_count,
       headcount, notes, status, created_by_admin_id,
       ministry_id, created_by_leader_id
     ) VALUES (
       $1, $2, $3::date, $4,
       $5, $6,
       $7, $8, $9,
       $10, $11, $12,
       $13, $14, $15, $16,
       $17, $18
     )
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.attendance_date,
      fields.service_name,
      fields.attendance_type,
      fields.service_name,
      fields.adults_count,
      fields.youth_count,
      fields.children_count,
      fields.first_time_visitors_count,
      fields.new_members_count,
      fields.volunteers_count,
      headcount,
      fields.notes || "",
      fields.status || "draft",
      fields.created_by_admin_id ?? null,
      fields.ministry_id ?? null,
      fields.created_by_leader_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listAttendanceRecordsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT a.*, ba.full_name AS created_by_name
     FROM public.church_attendance_records a
     LEFT JOIN public.church_branch_admins ba ON ba.id = a.created_by_admin_id
     WHERE a.branch_id = $1
     ORDER BY a.service_date DESC, a.id DESC`,
    [branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} recordId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findAttendanceRecordByIdForBranch(pool, recordId, branchId) {
  const r = await pool.query(
    `SELECT a.*, ba.full_name AS created_by_name
     FROM public.church_attendance_records a
     LEFT JOIN public.church_branch_admins ba ON ba.id = a.created_by_admin_id
     WHERE a.id = $1 AND a.branch_id = $2
     LIMIT 1`,
    [recordId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} recordId
 * @param {number} branchId
 * @param {string} status
 * @returns {Promise<object | null>}
 */
async function updateAttendanceStatusForBranch(pool, recordId, branchId, status) {
  const r = await pool.query(
    `UPDATE public.church_attendance_records
     SET status = $1, updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING *`,
    [status, recordId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<number>}
 */
async function countAttendancePendingForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_attendance_records
     WHERE branch_id = $1 AND status = 'draft'`,
    [branchId]
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<object>}
 */
async function getAttendanceSummaryForBranchPeriod(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT
       COUNT(*)::int AS record_count,
       COALESCE(SUM(adults_count), 0)::int AS adults_total,
       COALESCE(SUM(youth_count), 0)::int AS youth_total,
       COALESCE(SUM(children_count), 0)::int AS children_total,
       COALESCE(SUM(first_time_visitors_count), 0)::int AS visitors_total,
       COALESCE(SUM(new_members_count), 0)::int AS new_members_total,
       COALESCE(SUM(volunteers_count), 0)::int AS volunteers_total
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3`,
    [branchId, year, month]
  );
  return r.rows[0] ?? {};
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<object[]>}
 */
async function listSubmittedAttendanceForBranchPeriod(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3
       AND status = 'submitted'
     ORDER BY service_date ASC, id ASC`,
    [branchId, year, month]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<number>}
 */
async function countDraftAttendanceForBranchPeriod(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3
       AND status = 'draft'`,
    [branchId, year, month]
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<number>}
 */
async function syncSubmittedAttendanceToMonthlyReport(pool, branchId, year, month) {
  const r = await pool.query(
    `UPDATE public.church_attendance_records
     SET status = 'synced_to_monthly_report', updated_at = now()
     WHERE branch_id = $1
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3
       AND status = 'submitted'`,
    [branchId, year, month]
  );
  return r.rowCount ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} ministryId
 * @param {number} leaderId
 * @returns {Promise<object[]>}
 */
async function listAttendanceRecordsForLeaderMinistry(pool, branchId, ministryId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_attendance_records
     WHERE branch_id = $1 AND ministry_id = $2
     ORDER BY service_date DESC, id DESC`,
    [branchId, ministryId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} ministryId
 * @param {number} leaderId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<number>}
 */
async function countAttendanceRecordsForLeaderMinistryMonth(
  pool,
  branchId,
  ministryId,
  leaderId,
  year,
  month
) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND ministry_id = $2
       AND created_by_leader_id = $3
       AND EXTRACT(YEAR FROM service_date)::int = $4
       AND EXTRACT(MONTH FROM service_date)::int = $5`,
    [branchId, ministryId, leaderId, year, month]
  );
  return r.rows[0]?.count ?? 0;
}

const MINISTRY_ATTENDANCE_SELECT = `
  SELECT a.*,
         min.name AS ministry_name,
         ba.full_name AS created_by_admin_name,
         ml.full_name AS created_by_leader_name,
         CASE
           WHEN a.created_by_leader_id IS NOT NULL THEN ml.full_name
           WHEN a.created_by_admin_id IS NOT NULL THEN ba.full_name
           ELSE '—'
         END AS created_by_display
  FROM public.church_attendance_records a
  LEFT JOIN public.church_ministries min ON min.id = a.ministry_id
  LEFT JOIN public.church_branch_admins ba ON ba.id = a.created_by_admin_id
  LEFT JOIN public.church_ministry_leaders ml ON ml.id = a.created_by_leader_id
`;

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ ministryId?: number, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listMinistryAttendanceForBranch(pool, branchId, opts = {}) {
  const params = [branchId];
  let where = "WHERE a.branch_id = $1 AND a.ministry_id IS NOT NULL";
  if (opts.ministryId) {
    params.push(opts.ministryId);
    where += ` AND a.ministry_id = $${params.length}`;
  }
  let limitClause = "";
  if (opts.limit) {
    params.push(Math.min(Math.max(Number(opts.limit) || 20, 1), 100));
    limitClause = ` LIMIT $${params.length}`;
  }
  const r = await pool.query(
    `${MINISTRY_ATTENDANCE_SELECT}
     ${where}
     ORDER BY a.service_date DESC, a.id DESC${limitClause}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} ministryId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listMinistryAttendanceForMinistry(pool, branchId, ministryId, opts = {}) {
  return listMinistryAttendanceForBranch(pool, branchId, { ministryId, limit: opts.limit });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} year
 * @param {number} month
 * @returns {Promise<number>}
 */
async function countMinistryAttendanceForBranchMonth(pool, branchId, year, month) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_attendance_records
     WHERE branch_id = $1
       AND ministry_id IS NOT NULL
       AND EXTRACT(YEAR FROM service_date)::int = $2
       AND EXTRACT(MONTH FROM service_date)::int = $3`,
    [branchId, year, month]
  );
  return r.rows[0]?.count ?? 0;
}

module.exports = {
  totalAttendance,
  createAttendanceRecord,
  listAttendanceRecordsForBranch,
  findAttendanceRecordByIdForBranch,
  updateAttendanceStatusForBranch,
  countAttendancePendingForBranch,
  getAttendanceSummaryForBranchPeriod,
  listSubmittedAttendanceForBranchPeriod,
  countDraftAttendanceForBranchPeriod,
  syncSubmittedAttendanceToMonthlyReport,
  listAttendanceRecordsForLeaderMinistry,
  countAttendanceRecordsForLeaderMinistryMonth,
  listMinistryAttendanceForBranch,
  listMinistryAttendanceForMinistry,
  countMinistryAttendanceForBranchMonth,
};
