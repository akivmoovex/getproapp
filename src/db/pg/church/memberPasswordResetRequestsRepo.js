"use strict";

const membersRepo = require("./membersRepo");
const { maskLoginIdentifier } = require("../../../church/loginProtection");

function maskContact(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return maskLoginIdentifier(raw.includes("@") ? raw.toLowerCase() : raw.replace(/\D/g, "").slice(0, 32));
}

function mapMemberPasswordResetRequestForPlatform(row) {
  if (!row) return null;
  return {
    id: row.id,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    organization_status: row.organization_status,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    branch_host_slug: row.branch_host_slug,
    branch_status: row.branch_status,
    member_id: row.member_id,
    member_name: row.member_name,
    member_email_masked: maskContact(row.member_email),
    member_phone_masked: maskContact(row.member_phone),
    member_status: row.member_status,
    identifier_submitted_masked: maskLoginIdentifier(row.identifier_submitted),
    full_name_submitted: row.full_name_submitted,
    phone_submitted_masked: maskContact(row.phone_submitted),
    email_submitted_masked: maskContact(row.email_submitted),
    status: row.status,
    review_comment: row.review_comment,
    resolved_by_branch_admin_id: row.resolved_by_branch_admin_id,
    resolved_by_name: row.resolved_by_name,
    resolved_at: row.resolved_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    branch_admin_queue_path: `/branch/password-reset-requests/${row.id}`,
  };
}

const PLATFORM_MEMBER_RESET_REQUEST_SELECT = `
  SELECT r.*,
         o.name AS organization_name,
         o.slug AS organization_slug,
         o.status AS organization_status,
         b.name AS branch_name,
         b.slug AS branch_slug,
         COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS branch_host_slug,
         b.status AS branch_status,
         m.full_name AS member_name,
         m.email AS member_email,
         m.phone AS member_phone,
         m.status AS member_status,
         ba.full_name AS resolved_by_name
  FROM public.church_member_password_reset_requests r
  JOIN public.church_organizations o ON o.id = r.organization_id
  JOIN public.church_branches b ON b.id = r.branch_id
  LEFT JOIN public.church_members m ON m.id = r.member_id
  LEFT JOIN public.church_branch_admins ba ON ba.id = r.resolved_by_branch_admin_id
`;

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} branchId
 * @param {string} identifier
 * @returns {Promise<object | null>}
 */
async function findPossibleMemberByIdentifierForBranch(pool, branchId, identifier) {
  return membersRepo.findMemberByEmailOrPhoneForBranch(pool, branchId, identifier);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{
 *   organizationId: number,
 *   branchId: number,
 *   memberId?: number | null,
 *   identifierSubmitted: string,
 *   fullNameSubmitted?: string | null,
 *   phoneSubmitted?: string | null,
 *   emailSubmitted?: string | null,
 * }} entry
 */
async function createPasswordResetRequest(pool, entry) {
  const r = await pool.query(
    `INSERT INTO public.church_member_password_reset_requests (
       organization_id, branch_id, member_id,
       identifier_submitted, full_name_submitted, phone_submitted, email_submitted,
       status, created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted', now(), now())
     RETURNING *`,
    [
      entry.organizationId,
      entry.branchId,
      entry.memberId ?? null,
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
async function listPasswordResetRequestsForBranch(pool, branchId, options = {}) {
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
            m.full_name AS member_name,
            m.email AS member_email,
            m.phone AS member_phone,
            m.status AS member_status
     FROM public.church_member_password_reset_requests r
     LEFT JOIN public.church_members m ON m.id = r.member_id
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
async function findPasswordResetRequestByIdForBranch(pool, branchId, requestId) {
  const r = await pool.query(
    `SELECT r.*,
            m.full_name AS member_name,
            m.email AS member_email,
            m.phone AS member_phone,
            m.status AS member_status,
            ba.full_name AS resolved_by_name
     FROM public.church_member_password_reset_requests r
     LEFT JOIN public.church_members m ON m.id = r.member_id
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
async function markPasswordResetRequestReviewed(client, branchId, requestId, branchAdminId) {
  const r = await client.query(
    `UPDATE public.church_member_password_reset_requests
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
async function rejectPasswordResetRequest(client, branchId, requestId, branchAdminId, reviewComment) {
  const r = await client.query(
    `UPDATE public.church_member_password_reset_requests
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
async function completePasswordResetRequest(client, branchId, requestId, branchAdminId) {
  const r = await client.query(
    `UPDATE public.church_member_password_reset_requests
     SET status = 'reset_completed',
         resolved_by_branch_admin_id = $3,
         resolved_at = now(),
         updated_at = now()
     WHERE id = $1 AND branch_id = $2
       AND member_id IS NOT NULL
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
async function countPasswordResetRequestsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_member_password_reset_requests
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

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} requestId
 */
async function findMemberPasswordResetRequestByIdForPlatform(pool, requestId) {
  const r = await pool.query(
    `${PLATFORM_MEMBER_RESET_REQUEST_SELECT}
     WHERE r.id = $1
     LIMIT 1`,
    [requestId]
  );
  return mapMemberPasswordResetRequestForPlatform(r.rows[0] ?? null);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} memberId
 * @param {{ excludeRequestId?: number | null, limit?: number }} [options]
 */
async function listRecentMemberPasswordResetRequestsForMember(pool, memberId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 5, 1), 20);
  const params = [memberId];
  let excludeClause = "";
  if (options.excludeRequestId) {
    params.push(options.excludeRequestId);
    excludeClause = ` AND r.id <> $${params.length}`;
  }
  params.push(limit);
  const r = await pool.query(
    `SELECT r.id, r.status, r.created_at, r.updated_at, r.resolved_at
     FROM public.church_member_password_reset_requests r
     WHERE r.member_id = $1${excludeClause}
     ORDER BY r.created_at DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

module.exports = {
  findPossibleMemberByIdentifierForBranch,
  createPasswordResetRequest,
  listPasswordResetRequestsForBranch,
  findPasswordResetRequestByIdForBranch,
  findMemberPasswordResetRequestByIdForPlatform,
  listRecentMemberPasswordResetRequestsForMember,
  markPasswordResetRequestReviewed,
  rejectPasswordResetRequest,
  completePasswordResetRequest,
  countPasswordResetRequestsByStatusForBranch,
  mapMemberPasswordResetRequestForPlatform,
};
