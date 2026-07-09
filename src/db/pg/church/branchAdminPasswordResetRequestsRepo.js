"use strict";

const branchAdminsRepo = require("./branchAdminsRepo");

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} branchId
 * @param {string} identifier
 */
async function findPossibleBranchAdminByIdentifierForBranch(pool, branchId, identifier) {
  return branchAdminsRepo.findBranchAdminByEmailOrPhoneForBranch(pool, branchId, identifier);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   organizationId: number,
 *   branchId: number,
 *   branchAdminId?: number | null,
 *   identifierSubmitted: string,
 *   fullNameSubmitted?: string | null,
 *   phoneSubmitted?: string | null,
 *   emailSubmitted?: string | null,
 * }} entry
 */
async function createBranchAdminPasswordResetRequest(pool, entry) {
  const r = await pool.query(
    `INSERT INTO public.church_branch_admin_password_reset_requests (
       organization_id, branch_id, branch_admin_id,
       identifier_submitted, full_name_submitted, phone_submitted, email_submitted,
       status, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', now(), now())
     RETURNING *`,
    [
      entry.organizationId,
      entry.branchId,
      entry.branchAdminId ?? null,
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
 * @param {{ status?: string, organizationId?: number | null, branchId?: number | null, limit?: number }} [options]
 */
async function listBranchAdminPasswordResetRequestsForPlatform(pool, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
  const params = [];
  const clauses = [];

  const status = String(options.status || "").trim();
  if (status && status !== "all") {
    params.push(status);
    clauses.push(`r.status = $${params.length}`);
  }
  if (options.organizationId) {
    params.push(options.organizationId);
    clauses.push(`r.organization_id = $${params.length}`);
  }
  if (options.branchId) {
    params.push(options.branchId);
    clauses.push(`r.branch_id = $${params.length}`);
  }

  params.push(limit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";

  const r = await pool.query(
    `SELECT r.*,
            o.name AS organization_name,
            o.slug AS organization_slug,
            b.name AS branch_name,
            b.slug AS branch_slug,
            ba.full_name AS branch_admin_name,
            ba.email AS branch_admin_email,
            ba.phone AS branch_admin_phone,
            ba.status AS branch_admin_status
     FROM public.church_branch_admin_password_reset_requests r
     JOIN public.church_organizations o ON o.id = r.organization_id
     JOIN public.church_branches b ON b.id = r.branch_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = r.branch_admin_id
     ${where}
     ORDER BY r.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} requestId
 */
async function findBranchAdminPasswordResetRequestByIdForPlatform(pool, requestId) {
  const r = await pool.query(
    `SELECT r.*,
            o.name AS organization_name,
            o.slug AS organization_slug,
            o.status AS organization_status,
            b.name AS branch_name,
            b.slug AS branch_slug,
            b.status AS branch_status,
            ba.full_name AS branch_admin_name,
            ba.email AS branch_admin_email,
            ba.phone AS branch_admin_phone,
            ba.role AS branch_admin_role,
            ba.status AS branch_admin_status,
            au.username AS resolved_by_username,
            au.display_name AS resolved_by_display_name
     FROM public.church_branch_admin_password_reset_requests r
     JOIN public.church_organizations o ON o.id = r.organization_id
     JOIN public.church_branches b ON b.id = r.branch_id
     LEFT JOIN public.church_branch_admins ba ON ba.id = r.branch_admin_id
     LEFT JOIN public.admin_users au ON au.id = r.resolved_by_platform_admin_id
     WHERE r.id = $1
     LIMIT 1`,
    [requestId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} requestId
 * @param {number} platformAdminId
 */
async function markBranchAdminPasswordResetRequestReviewed(client, requestId, platformAdminId) {
  const r = await client.query(
    `UPDATE public.church_branch_admin_password_reset_requests
     SET status = 'reviewed',
         updated_at = now()
     WHERE id = $1 AND status = 'submitted'
     RETURNING *`,
    [requestId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} requestId
 * @param {number} platformAdminId
 * @param {string} reviewComment
 */
async function rejectBranchAdminPasswordResetRequest(
  client,
  requestId,
  platformAdminId,
  reviewComment
) {
  const r = await client.query(
    `UPDATE public.church_branch_admin_password_reset_requests
     SET status = 'rejected',
         review_comment = $3,
         resolved_by_platform_admin_id = $2,
         resolved_at = now(),
         updated_at = now()
     WHERE id = $1 AND status NOT IN ('reset_completed', 'rejected')
     RETURNING *`,
    [requestId, platformAdminId, reviewComment]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} requestId
 * @param {number} platformAdminId
 */
async function completeBranchAdminPasswordResetRequest(client, requestId, platformAdminId) {
  const r = await client.query(
    `UPDATE public.church_branch_admin_password_reset_requests
     SET status = 'reset_completed',
         resolved_by_platform_admin_id = $2,
         resolved_at = now(),
         updated_at = now()
     WHERE id = $1
       AND branch_admin_id IS NOT NULL
       AND status NOT IN ('reset_completed', 'rejected')
     RETURNING *`,
    [requestId, platformAdminId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function countBranchAdminPasswordResetRequestsByStatus(pool) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_branch_admin_password_reset_requests
     GROUP BY status`
  );
  const counts = { submitted: 0, reviewed: 0, reset_completed: 0, rejected: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = row.count;
    }
  }
  return counts;
}

module.exports = {
  findPossibleBranchAdminByIdentifierForBranch,
  createBranchAdminPasswordResetRequest,
  listBranchAdminPasswordResetRequestsForPlatform,
  findBranchAdminPasswordResetRequestByIdForPlatform,
  markBranchAdminPasswordResetRequestReviewed,
  rejectBranchAdminPasswordResetRequest,
  completeBranchAdminPasswordResetRequest,
  countBranchAdminPasswordResetRequestsByStatus,
};
