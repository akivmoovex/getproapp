"use strict";

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createServiceSession(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_attendance_service_sessions (
       organization_id, branch_id, attendance_type, service_name, session_date,
       status, opened_by_admin_id, notes
     ) VALUES ($1, $2, $3, $4, $5::date, 'open', $6, $7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.attendance_type,
      fields.service_name,
      fields.session_date,
      fields.opened_by_admin_id ?? null,
      fields.notes || "",
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} sessionId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findServiceSessionByIdForBranch(pool, sessionId, branchId) {
  const r = await pool.query(
    `SELECT s.*, ba.full_name AS opened_by_name
     FROM public.church_attendance_service_sessions s
     LEFT JOIN public.church_branch_admins ba ON ba.id = s.opened_by_admin_id
     WHERE s.id = $1 AND s.branch_id = $2
     LIMIT 1`,
    [sessionId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ status?: string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listServiceSessionsForBranch(pool, branchId, opts = {}) {
  const params = [branchId];
  let where = "WHERE s.branch_id = $1";
  const status = String(opts.status || "").trim();
  if (status) {
    params.push(status);
    where += ` AND s.status = $${params.length}`;
  }
  let limitClause = "";
  if (opts.limit) {
    params.push(Math.min(Math.max(Number(opts.limit) || 20, 1), 100));
    limitClause = ` LIMIT $${params.length}`;
  }
  const r = await pool.query(
    `SELECT s.*,
            (SELECT COUNT(*)::int FROM public.church_attendance_check_ins c
             WHERE c.service_session_id = s.id AND c.status = 'active') AS active_check_in_count
     FROM public.church_attendance_service_sessions s
     ${where}
     ORDER BY s.session_date DESC, s.opened_at DESC, s.id DESC${limitClause}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findOpenServiceSessionForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_attendance_service_sessions
     WHERE branch_id = $1 AND status = 'open'
     ORDER BY opened_at DESC, id DESC
     LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} sessionId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function closeServiceSessionForBranch(pool, sessionId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_attendance_service_sessions
     SET status = 'closed', closed_at = now(), closed_by_admin_id = $1, updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status = 'open'
     RETURNING *`,
    [adminId, sessionId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createCheckIn(pool, fields) {
  const checkedInAt = fields.checked_in_at ? fields.checked_in_at : null;
  const r = await pool.query(
    `INSERT INTO public.church_attendance_check_ins (
       organization_id, branch_id, service_session_id, member_id,
       check_in_kind, method, visitor_name, visitor_phone,
       checked_in_by_admin_id, correction_of_check_in_id,
       client_item_id, captured_at_client, capture_source, offline_queue_id,
       needs_review, home_branch_id, guest_authorized,
       checked_in_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
       COALESCE($18::timestamptz, now()))
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.service_session_id,
      fields.member_id ?? null,
      fields.check_in_kind,
      fields.method,
      fields.visitor_name ?? null,
      fields.visitor_phone ?? null,
      fields.checked_in_by_admin_id ?? null,
      fields.correction_of_check_in_id ?? null,
      fields.client_item_id ?? null,
      fields.captured_at_client ?? null,
      fields.capture_source ?? null,
      fields.offline_queue_id ?? null,
      fields.needs_review === true,
      fields.home_branch_id ?? null,
      fields.guest_authorized === true,
      checkedInAt,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} checkInId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findCheckInByIdForBranch(pool, checkInId, branchId) {
  const r = await pool.query(
    `SELECT c.*,
            m.full_name AS member_full_name,
            m.age_group AS member_age_group
     FROM public.church_attendance_check_ins c
     LEFT JOIN public.church_members m ON m.id = c.member_id
     WHERE c.id = $1 AND c.branch_id = $2
     LIMIT 1`,
    [checkInId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} sessionId
 * @param {number} memberId
 * @returns {Promise<object | null>}
 */
async function findActiveMemberCheckInForSession(pool, sessionId, memberId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_attendance_check_ins
     WHERE service_session_id = $1 AND member_id = $2 AND status = 'active'
     LIMIT 1`,
    [sessionId, memberId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {number} branchId
 * @param {string} clientItemId
 */
async function findCheckInByClientItemId(pool, organizationId, branchId, clientItemId) {
  const r = await pool.query(
    `SELECT * FROM public.church_attendance_check_ins
     WHERE organization_id = $1 AND branch_id = $2 AND client_item_id = $3
     LIMIT 1`,
    [organizationId, branchId, clientItemId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} checkInId
 * @param {{ needs_review?: boolean }} fields
 */
async function updateCheckInReviewFlag(pool, checkInId, fields) {
  const r = await pool.query(
    `UPDATE public.church_attendance_check_ins
     SET needs_review = COALESCE($2, needs_review), updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [checkInId, fields.needs_review]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} sessionId
 * @param {number} branchId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listCheckInsForSession(pool, sessionId, branchId, opts = {}) {
  const params = [sessionId, branchId];
  let limitClause = "";
  if (opts.limit) {
    params.push(Math.min(Math.max(Number(opts.limit) || 50, 1), 200));
    limitClause = ` LIMIT $${params.length}`;
  }
  const r = await pool.query(
    `SELECT c.id, c.check_in_kind, c.method, c.visitor_name, c.checked_in_at, c.status,
            c.member_id, m.full_name AS member_full_name, m.age_group AS member_age_group
     FROM public.church_attendance_check_ins c
     LEFT JOIN public.church_members m ON m.id = c.member_id
     WHERE c.service_session_id = $1 AND c.branch_id = $2
     ORDER BY c.checked_in_at DESC, c.id DESC${limitClause}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} checkInId
 * @param {number} branchId
 * @param {{ admin_id: number, reason: string }} fields
 * @returns {Promise<object | null>}
 */
async function voidCheckInForBranch(pool, checkInId, branchId, fields) {
  const r = await pool.query(
    `UPDATE public.church_attendance_check_ins
     SET status = 'voided',
         voided_at = now(),
         voided_by_admin_id = $1,
         void_reason = $2,
         updated_at = now()
     WHERE id = $3 AND branch_id = $4 AND status = 'active'
     RETURNING *`,
    [fields.admin_id, fields.reason, checkInId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} sessionId
 * @param {number} branchId
 * @returns {Promise<object>}
 */
async function countCheckInsByKindForSession(pool, sessionId, branchId) {
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'active' AND check_in_kind = 'member')::int AS members,
       COUNT(*) FILTER (WHERE status = 'active' AND check_in_kind = 'visitor')::int AS visitors
     FROM public.church_attendance_check_ins
     WHERE service_session_id = $1 AND branch_id = $2`,
    [sessionId, branchId]
  );
  return r.rows[0] ?? { members: 0, visitors: 0 };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} fromDate
 * @param {string} toDate
 * @returns {Promise<object>}
 */
async function getCheckInSummaryForBranchPeriod(pool, branchId, fromDate, toDate) {
  const r = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE c.status = 'active' AND c.check_in_kind = 'member')::int AS member_check_ins,
       COUNT(*) FILTER (WHERE c.status = 'active' AND c.check_in_kind = 'visitor')::int AS visitor_check_ins,
       COUNT(DISTINCT c.service_session_id)::int AS session_count
     FROM public.church_attendance_check_ins c
     JOIN public.church_attendance_service_sessions s ON s.id = c.service_session_id
     WHERE c.branch_id = $1
       AND s.session_date >= $2::date
       AND s.session_date <= $3::date`,
    [branchId, fromDate, toDate]
  );
  return r.rows[0] ?? { member_check_ins: 0, visitor_check_ins: 0, session_count: 0 };
}

module.exports = {
  createServiceSession,
  findServiceSessionByIdForBranch,
  listServiceSessionsForBranch,
  findOpenServiceSessionForBranch,
  closeServiceSessionForBranch,
  createCheckIn,
  findCheckInByIdForBranch,
  findActiveMemberCheckInForSession,
  findCheckInByClientItemId,
  updateCheckInReviewFlag,
  listCheckInsForSession,
  voidCheckInForBranch,
  countCheckInsByKindForSession,
  getCheckInSummaryForBranchPeriod,
};
