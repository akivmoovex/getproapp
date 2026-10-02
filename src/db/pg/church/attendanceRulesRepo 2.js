"use strict";

const DEFAULT_RULES = Object.freeze({
  absence_threshold_weeks: null,
  allow_multiple_services_per_day: true,
  cross_branch_guest_enabled: false,
});

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function findBranchRules(pool, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_attendance_branch_rules WHERE branch_id = $1 LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function getBranchRulesWithDefaults(pool, branchId) {
  const row = await findBranchRules(pool, branchId);
  if (!row) return { ...DEFAULT_RULES, branch_id: branchId };
  return row;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 */
async function upsertBranchRules(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_attendance_branch_rules (
       organization_id, branch_id, absence_threshold_weeks,
       allow_multiple_services_per_day, cross_branch_guest_enabled, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (branch_id) DO UPDATE SET
       absence_threshold_weeks = EXCLUDED.absence_threshold_weeks,
       allow_multiple_services_per_day = EXCLUDED.allow_multiple_services_per_day,
       cross_branch_guest_enabled = EXCLUDED.cross_branch_guest_enabled,
       updated_by_admin_id = EXCLUDED.updated_by_admin_id,
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.absence_threshold_weeks ?? null,
      fields.allow_multiple_services_per_day !== false,
      fields.cross_branch_guest_enabled === true,
      fields.updated_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {string} [onDate] YYYY-MM-DD
 */
async function findActiveExemptionForMember(pool, memberId, branchId, onDate) {
  const date = onDate || new Date().toISOString().slice(0, 10);
  const r = await pool.query(
    `SELECT * FROM public.church_member_attendance_exemptions
     WHERE member_id = $1 AND branch_id = $2 AND status = 'active'
       AND effective_from <= $3::date
       AND (effective_to IS NULL OR effective_to >= $3::date)
     ORDER BY effective_from DESC, id DESC
     LIMIT 1`,
    [memberId, branchId, date]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 */
async function createExemption(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_member_attendance_exemptions (
       organization_id, branch_id, member_id, reason, effective_from, effective_to, created_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.reason || "",
      fields.effective_from,
      fields.effective_to ?? null,
      fields.created_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function listActiveExemptionsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT e.*, m.full_name AS member_full_name
     FROM public.church_member_attendance_exemptions e
     INNER JOIN public.church_members m ON m.id = e.member_id
     WHERE e.branch_id = $1 AND e.status = 'active'
     ORDER BY e.effective_from DESC, e.id DESC`,
    [branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} guestBranchId
 * @param {string} [onDate]
 */
async function findActiveCrossBranchAuth(pool, memberId, guestBranchId, onDate) {
  const date = onDate || new Date().toISOString().slice(0, 10);
  const r = await pool.query(
    `SELECT * FROM public.church_attendance_cross_branch_authorizations
     WHERE member_id = $1 AND guest_branch_id = $2 AND status = 'active'
       AND effective_from <= $3::date
       AND (effective_to IS NULL OR effective_to >= $3::date)
     ORDER BY effective_from DESC, id DESC
     LIMIT 1`,
    [memberId, guestBranchId, date]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 */
async function createCrossBranchAuth(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_attendance_cross_branch_authorizations (
       organization_id, member_id, home_branch_id, guest_branch_id,
       effective_from, effective_to, authorized_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.member_id,
      fields.home_branch_id,
      fields.guest_branch_id,
      fields.effective_from,
      fields.effective_to ?? null,
      fields.authorized_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {string} sessionDate YYYY-MM-DD
 */
async function findMemberCheckInOnDateForBranch(pool, memberId, branchId, sessionDate) {
  const r = await pool.query(
    `SELECT c.*
     FROM public.church_attendance_check_ins c
     INNER JOIN public.church_attendance_service_sessions s ON s.id = c.service_session_id
     WHERE c.member_id = $1 AND c.branch_id = $2 AND c.status = 'active'
       AND s.session_date = $3::date
     ORDER BY c.checked_in_at ASC`,
    [memberId, branchId, sessionDate]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {string} fromDate
 * @param {string} toDate
 */
async function getCheckInCountsByBranchForPeriod(pool, organizationId, fromDate, toDate) {
  const r = await pool.query(
    `SELECT b.id AS branch_id, b.name AS branch_name, b.slug AS branch_slug,
            COUNT(*) FILTER (WHERE c.status = 'active' AND c.check_in_kind = 'member')::int AS member_check_ins,
            COUNT(*) FILTER (WHERE c.status = 'active' AND c.check_in_kind = 'visitor')::int AS visitor_check_ins,
            COUNT(DISTINCT c.service_session_id)::int AS session_count
     FROM public.church_branches b
     LEFT JOIN public.church_attendance_check_ins c ON c.branch_id = b.id AND c.status = 'active'
     LEFT JOIN public.church_attendance_service_sessions s ON s.id = c.service_session_id
       AND s.session_date >= $2::date AND s.session_date <= $3::date
     WHERE b.organization_id = $1
     GROUP BY b.id, b.name, b.slug
     ORDER BY b.name ASC`,
    [organizationId, fromDate, toDate]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} absenceThresholdWeeks
 */
async function listMembersOverAbsenceThreshold(pool, branchId, absenceThresholdWeeks) {
  const weeks = Number(absenceThresholdWeeks);
  if (!Number.isFinite(weeks) || weeks <= 0) return [];
  const r = await pool.query(
    `SELECT m.id, m.full_name, m.email, m.status,
            MAX(c.checked_in_at) AS last_check_in_at
     FROM public.church_members m
     LEFT JOIN public.church_attendance_check_ins c
       ON c.member_id = m.id AND c.branch_id = m.branch_id AND c.status = 'active'
     WHERE m.branch_id = $1 AND m.status = 'verified'
       AND NOT EXISTS (
         SELECT 1 FROM public.church_member_attendance_exemptions e
         WHERE e.member_id = m.id AND e.branch_id = m.branch_id AND e.status = 'active'
           AND e.effective_from <= CURRENT_DATE
           AND (e.effective_to IS NULL OR e.effective_to >= CURRENT_DATE)
       )
     GROUP BY m.id
     HAVING MAX(c.checked_in_at) IS NULL
        OR MAX(c.checked_in_at) < (CURRENT_DATE - ($2::int * 7))::timestamptz
     ORDER BY m.full_name ASC`,
    [branchId, weeks]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 */
async function listCheckInsNeedingReview(pool, branchId) {
  const r = await pool.query(
    `SELECT c.*, m.full_name AS member_full_name
     FROM public.church_attendance_check_ins c
     LEFT JOIN public.church_members m ON m.id = c.member_id
     WHERE c.branch_id = $1 AND c.needs_review = true
     ORDER BY c.checked_in_at DESC, c.id DESC
     LIMIT 50`,
    [branchId]
  );
  return r.rows;
}

module.exports = {
  DEFAULT_RULES,
  findBranchRules,
  getBranchRulesWithDefaults,
  upsertBranchRules,
  findActiveExemptionForMember,
  createExemption,
  listActiveExemptionsForBranch,
  findActiveCrossBranchAuth,
  createCrossBranchAuth,
  findMemberCheckInOnDateForBranch,
  getCheckInCountsByBranchForPeriod,
  listMembersOverAbsenceThreshold,
  listCheckInsNeedingReview,
};
