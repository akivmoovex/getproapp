"use strict";

const ministryLeadersRepo = require("./ministryLeadersRepo");
const { maskLoginIdentifier } = require("../../../church/loginProtection");

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} branchId
 * @param {string} identifier
 * @returns {Promise<object | null>}
 */
async function findPossibleMinistryLeaderByIdentifierForBranch(pool, branchId, identifier) {
  return ministryLeadersRepo.findLeaderByEmailOrPhoneForBranch(pool, branchId, identifier);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   organizationId: number,
 *   branchId: number,
 *   ministryLeaderId?: number | null,
 *   ministryId?: number | null,
 *   identifierSubmitted: string,
 *   fullNameSubmitted?: string | null,
 *   phoneSubmitted?: string | null,
 *   emailSubmitted?: string | null,
 * }} entry
 */
async function createMinistryLeaderPasswordResetRequest(pool, entry) {
  const r = await pool.query(
    `INSERT INTO public.church_ministry_leader_password_reset_requests (
       organization_id, branch_id, ministry_leader_id, ministry_id,
       identifier_submitted, full_name_submitted, phone_submitted, email_submitted,
       status, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'submitted', now(), now())
     RETURNING *`,
    [
      entry.organizationId,
      entry.branchId,
      entry.ministryLeaderId ?? null,
      entry.ministryId ?? null,
      entry.identifierSubmitted,
      entry.fullNameSubmitted ?? null,
      entry.phoneSubmitted ?? null,
      entry.emailSubmitted ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} branchId
 * @param {{ status?: string, limit?: number }} [options]
 */
async function listMinistryLeaderPasswordResetRequestsForBranch(pool, branchId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
  const status = String(options.status || "").trim();
  const params = [branchId];
  let statusClause = "";
  if (status && status !== "all") {
    params.push(status);
    statusClause = ` AND r.status = $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT r.*,
            l.full_name AS leader_name,
            l.email AS leader_email,
            l.phone AS leader_phone,
            l.status AS leader_status,
            m.name AS ministry_name
     FROM public.church_ministry_leader_password_reset_requests r
     LEFT JOIN public.church_ministry_leaders l ON l.id = r.ministry_leader_id
     LEFT JOIN public.church_ministries m ON m.id = r.ministry_id
     WHERE r.branch_id = $1${statusClause}
     ORDER BY r.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} branchId
 * @param {number} requestId
 */
async function findMinistryLeaderPasswordResetRequestByIdForBranch(pool, branchId, requestId) {
  const r = await pool.query(
    `SELECT r.*,
            l.full_name AS leader_name,
            l.email AS leader_email,
            l.phone AS leader_phone,
            l.status AS leader_status,
            m.name AS ministry_name,
            ba.full_name AS resolved_by_name
     FROM public.church_ministry_leader_password_reset_requests r
     LEFT JOIN public.church_ministry_leaders l ON l.id = r.ministry_leader_id
     LEFT JOIN public.church_ministries m ON m.id = r.ministry_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = r.resolved_by_branch_admin_id
     WHERE r.id = $1 AND r.branch_id = $2
     LIMIT 1`,
    [requestId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} branchId
 * @param {number} requestId
 * @param {number} branchAdminId
 */
async function markMinistryLeaderPasswordResetRequestReviewed(client, branchId, requestId, branchAdminId) {
  void branchAdminId;
  const r = await client.query(
    `UPDATE public.church_ministry_leader_password_reset_requests
     SET status = 'reviewed',
         updated_at = now()
     WHERE id = $1 AND branch_id = $2 AND status = 'submitted'
     RETURNING *`,
    [requestId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} branchId
 * @param {number} requestId
 * @param {number} branchAdminId
 * @param {string} reviewComment
 */
async function rejectMinistryLeaderPasswordResetRequest(
  client,
  branchId,
  requestId,
  branchAdminId,
  reviewComment
) {
  const r = await client.query(
    `UPDATE public.church_ministry_leader_password_reset_requests
     SET status = 'rejected',
         review_comment = $4,
         resolved_by_branch_admin_id = $3,
         resolved_at = now(),
         updated_at = now()
     WHERE id = $1 AND branch_id = $2 AND status NOT IN ('reset_completed', 'rejected')
     RETURNING *`,
    [requestId, branchId, branchAdminId, reviewComment]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} branchId
 * @param {number} requestId
 * @param {number} branchAdminId
 */
async function completeMinistryLeaderPasswordResetRequest(client, branchId, requestId, branchAdminId) {
  const r = await client.query(
    `UPDATE public.church_ministry_leader_password_reset_requests
     SET status = 'reset_completed',
         resolved_by_branch_admin_id = $3,
         resolved_at = now(),
         updated_at = now()
     WHERE id = $1 AND branch_id = $2
       AND ministry_leader_id IS NOT NULL
       AND status NOT IN ('reset_completed', 'rejected')
     RETURNING *`,
    [requestId, branchId, branchAdminId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} branchId
 */
async function countMinistryLeaderPasswordResetRequestsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_ministry_leader_password_reset_requests
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const counts = { submitted: 0, reviewed: 0, reset_completed: 0, rejected: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = row.count;
    }
  }
  return counts;
}

function maskIdentifier(value) {
  return maskLoginIdentifier(String(value || ""));
}

module.exports = {
  findPossibleMinistryLeaderByIdentifierForBranch,
  createMinistryLeaderPasswordResetRequest,
  listMinistryLeaderPasswordResetRequestsForBranch,
  findMinistryLeaderPasswordResetRequestByIdForBranch,
  markMinistryLeaderPasswordResetRequestReviewed,
  rejectMinistryLeaderPasswordResetRequest,
  completeMinistryLeaderPasswordResetRequest,
  countMinistryLeaderPasswordResetRequestsByStatusForBranch,
  maskIdentifier,
};
