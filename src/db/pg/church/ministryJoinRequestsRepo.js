"use strict";

const BRANCH_JOIN_REQUEST_SELECT = `
  SELECT r.*,
         m.full_name AS member_name,
         m.email AS member_email,
         m.phone AS member_phone,
         min.name AS ministry_name,
         min.leader_name AS ministry_leader_name,
         lr.full_name AS leader_reviewer_name
  FROM public.church_ministry_join_requests r
  INNER JOIN public.church_members m ON m.id = r.member_id
  INNER JOIN public.church_ministries min ON min.id = r.ministry_id
  LEFT JOIN public.church_ministry_leaders lr ON lr.id = r.leader_reviewer_id
`;

const LEADER_JOIN_REQUEST_SELECT = `
  SELECT r.*,
         m.full_name AS member_name,
         m.email AS member_email,
         m.phone AS member_phone,
         min.name AS ministry_name
  FROM public.church_ministry_join_requests r
  INNER JOIN public.church_members m ON m.id = r.member_id
  INNER JOIN public.church_ministries min ON min.id = r.ministry_id
`;

const MEMBER_JOIN_REQUEST_SELECT = `
  SELECT r.*,
         min.name AS ministry_name,
         min.leader_name AS ministry_leader_name,
         min.meeting_day,
         min.meeting_time,
         min.location
  FROM public.church_ministry_join_requests r
  INNER JOIN public.church_ministries min ON min.id = r.ministry_id
`;

const LEADER_LIST_PAGE_SIZE = 20;

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createJoinRequestForMember(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_ministry_join_requests (
       organization_id, branch_id, member_id, ministry_id, message, status
     ) VALUES ($1, $2, $3, $4, $5, 'submitted')
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.ministry_id,
      fields.message || null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listJoinRequestsForMember(pool, memberId, branchId) {
  const r = await pool.query(
    `${MEMBER_JOIN_REQUEST_SELECT}
     WHERE r.member_id = $1 AND r.branch_id = $2
     ORDER BY r.created_at DESC`,
    [memberId, branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} requestId
 * @param {number} memberId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findJoinRequestByIdForMember(pool, requestId, memberId, branchId) {
  const r = await pool.query(
    `${MEMBER_JOIN_REQUEST_SELECT}
     WHERE r.id = $1 AND r.member_id = $2 AND r.branch_id = $3
     LIMIT 1`,
    [requestId, memberId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ status?: string, ministryId?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listJoinRequestsForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const ministryId = Number(opts.ministryId);
  const params = [branchId];
  let where = "WHERE r.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND r.status = $${params.length}`;
  }
  if (Number.isFinite(ministryId) && ministryId > 0) {
    params.push(ministryId);
    where += ` AND r.ministry_id = $${params.length}`;
  }
  const r = await pool.query(
    `${BRANCH_JOIN_REQUEST_SELECT}
     ${where}
     ORDER BY r.created_at DESC`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} requestId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findJoinRequestByIdForBranch(pool, requestId, branchId) {
  const r = await pool.query(
    `${BRANCH_JOIN_REQUEST_SELECT}
     WHERE r.id = $1 AND r.branch_id = $2
     LIMIT 1`,
    [requestId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} scope
 * @param {{ q?: string, status?: string, leaderReview?: string, page?: number, pageSize?: number }} opts
 * @returns {Promise<{ rows: object[], total: number, page: number, pageSize: number, totalPages: number }>}
 */
async function listJoinRequestsForMinistryLeader(pool, scope, opts = {}) {
  const pageSize = Math.min(Math.max(Number(opts.pageSize) || LEADER_LIST_PAGE_SIZE, 1), 100);
  const page = Math.max(Number(opts.page) || 1, 1);
  const q = String(opts.q || "").trim().slice(0, 100);
  const status = String(opts.status || "").trim();
  const leaderReview = String(opts.leaderReview || "").trim();

  const params = [scope.organization_id, scope.branch_id, scope.ministry_id];
  let where = `WHERE r.organization_id = $1
       AND r.branch_id = $2
       AND r.ministry_id = $3`;

  if (status && status !== "all") {
    params.push(status);
    where += ` AND r.status = $${params.length}`;
  }

  if (leaderReview === "not_reviewed") {
    where += ` AND r.leader_recommendation IS NULL`;
  } else if (
    leaderReview === "recommend_approval" ||
    leaderReview === "do_not_recommend" ||
    leaderReview === "more_info_needed"
  ) {
    params.push(leaderReview);
    where += ` AND r.leader_recommendation = $${params.length}`;
  }

  if (q) {
    params.push(`%${q.toLowerCase()}%`);
    const idx = params.length;
    where += ` AND (
      LOWER(COALESCE(m.full_name, '')) LIKE $${idx}
      OR LOWER(COALESCE(m.email, '')) LIKE $${idx}
      OR LOWER(COALESCE(m.phone, '')) LIKE $${idx}
    )`;
  }

  const countR = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_ministry_join_requests r
     INNER JOIN public.church_members m ON m.id = r.member_id
     ${where}`,
    params
  );
  const total = countR.rows[0]?.count ?? 0;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const listParams = params.concat([pageSize, offset]);
  const r = await pool.query(
    `${LEADER_JOIN_REQUEST_SELECT}
     ${where}
     ORDER BY r.created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  return {
    rows: r.rows,
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} requestId
 * @param {{ organization_id: number, branch_id: number, ministry_id: number }} scope
 * @returns {Promise<object | null>}
 */
async function findJoinRequestByIdForMinistryLeader(pool, requestId, scope) {
  const r = await pool.query(
    `${LEADER_JOIN_REQUEST_SELECT}
     WHERE r.id = $1
       AND r.organization_id = $2
       AND r.branch_id = $3
       AND r.ministry_id = $4
     LIMIT 1`,
    [requestId, scope.organization_id, scope.branch_id, scope.ministry_id]
  );
  return r.rows[0] ?? null;
}

/**
 * Saves leader recommendation without changing final status or creating membership.
 * @param {import("pg").Pool} pool
 * @param {number} requestId
 * @param {{ organization_id: number, branch_id: number, ministry_id: number }} scope
 * @param {{ recommendation: string, leader_comment: string | null, leader_reviewer_id: number }} fields
 * @returns {Promise<object | null>}
 */
async function saveLeaderRecommendationForMinistry(pool, requestId, scope, fields) {
  const r = await pool.query(
    `UPDATE public.church_ministry_join_requests
     SET leader_recommendation = $1,
         leader_comment = $2,
         leader_reviewer_id = $3,
         leader_reviewed_at = now(),
         updated_at = now()
     WHERE id = $4
       AND organization_id = $5
       AND branch_id = $6
       AND ministry_id = $7
       AND status IN ('submitted', 'more_info_needed')
     RETURNING *`,
    [
      fields.recommendation,
      fields.leader_comment,
      fields.leader_reviewer_id,
      requestId,
      scope.organization_id,
      scope.branch_id,
      scope.ministry_id,
    ]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ organization_id: number, branch_id: number, ministry_id: number }} scope
 * @returns {Promise<number>}
 */
async function countOpenJoinRequestsAwaitingLeaderReview(pool, scope) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_ministry_join_requests
     WHERE organization_id = $1
       AND branch_id = $2
       AND ministry_id = $3
       AND status IN ('submitted', 'more_info_needed')
       AND leader_recommendation IS NULL`,
    [scope.organization_id, scope.branch_id, scope.ministry_id]
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} ministryId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findOpenJoinRequestForMemberMinistry(pool, memberId, ministryId, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_ministry_join_requests
     WHERE member_id = $1
       AND ministry_id = $2
       AND branch_id = $3
       AND status IN ('submitted', 'more_info_needed')
     ORDER BY created_at DESC
     LIMIT 1`,
    [memberId, ministryId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} ministryId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findLatestJoinRequestForMemberMinistry(pool, memberId, ministryId, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_ministry_join_requests
     WHERE member_id = $1 AND ministry_id = $2 AND branch_id = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [memberId, ministryId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} requestId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function approveJoinRequestForBranch(pool, requestId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_ministry_join_requests
     SET status = 'approved',
         admin_comment = COALESCE(admin_comment, ''),
         reviewed_by_admin_id = $1,
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $2
       AND branch_id = $3
       AND status IN ('submitted', 'more_info_needed')
     RETURNING *`,
    [adminId, requestId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} requestId
 * @param {number} branchId
 * @param {number} adminId
 * @param {string} adminComment
 * @returns {Promise<object | null>}
 */
async function rejectJoinRequestForBranch(pool, requestId, branchId, adminId, adminComment) {
  const r = await pool.query(
    `UPDATE public.church_ministry_join_requests
     SET status = 'rejected',
         admin_comment = $1,
         reviewed_by_admin_id = $2,
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $3
       AND branch_id = $4
       AND status IN ('submitted', 'more_info_needed')
     RETURNING *`,
    [adminComment, adminId, requestId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} requestId
 * @param {number} branchId
 * @param {number} adminId
 * @param {string} adminComment
 * @returns {Promise<object | null>}
 */
async function requestMoreInfoForBranch(pool, requestId, branchId, adminId, adminComment) {
  const r = await pool.query(
    `UPDATE public.church_ministry_join_requests
     SET status = 'more_info_needed',
         admin_comment = $1,
         reviewed_by_admin_id = $2,
         reviewed_at = now(),
         updated_at = now()
     WHERE id = $3
       AND branch_id = $4
       AND status IN ('submitted', 'more_info_needed')
     RETURNING *`,
    [adminComment, adminId, requestId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countJoinRequestsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_ministry_join_requests
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const out = { submitted: 0, approved: 0, rejected: 0, more_info_needed: 0 };
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
 * @param {number} ministryId
 * @returns {Promise<number>}
 */
async function countPendingJoinRequestsForMinistry(pool, branchId, ministryId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_ministry_join_requests
     WHERE branch_id = $1
       AND ministry_id = $2
       AND status = 'submitted'`,
    [branchId, ministryId]
  );
  return r.rows[0]?.count ?? 0;
}

async function resubmitJoinRequestForMember(pool, requestId, memberId, branchId, message) {
  const r = await pool.query(
    `UPDATE public.church_ministry_join_requests
     SET status = 'submitted',
         message = $1,
         admin_comment = NULL,
         reviewed_by_admin_id = NULL,
         reviewed_at = NULL,
         leader_recommendation = NULL,
         leader_comment = NULL,
         leader_reviewed_at = NULL,
         leader_reviewer_id = NULL,
         updated_at = now()
     WHERE id = $2
       AND member_id = $3
       AND branch_id = $4
       AND status = 'more_info_needed'
     RETURNING *`,
    [message || null, requestId, memberId, branchId]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  LEADER_LIST_PAGE_SIZE,
  createJoinRequestForMember,
  listJoinRequestsForMember,
  findJoinRequestByIdForMember,
  listJoinRequestsForBranch,
  findJoinRequestByIdForBranch,
  listJoinRequestsForMinistryLeader,
  findJoinRequestByIdForMinistryLeader,
  saveLeaderRecommendationForMinistry,
  countOpenJoinRequestsAwaitingLeaderReview,
  approveJoinRequestForBranch,
  rejectJoinRequestForBranch,
  requestMoreInfoForBranch,
  countJoinRequestsByStatusForBranch,
  findOpenJoinRequestForMemberMinistry,
  findLatestJoinRequestForMemberMinistry,
  countPendingJoinRequestsForMinistry,
  resubmitJoinRequestForMember,
};
