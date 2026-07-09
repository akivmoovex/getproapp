"use strict";

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createMemberRequest(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_member_requests (
       organization_id, branch_id, member_id,
       request_type, subject, description, status
     ) VALUES ($1, $2, $3, $4, $5, $6, 'submitted')
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.request_type,
      fields.subject,
      fields.description,
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
async function listMemberRequestsForMember(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_member_requests
     WHERE member_id = $1 AND branch_id = $2
     ORDER BY created_at DESC`,
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
async function findMemberRequestByIdForMember(pool, requestId, memberId, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_member_requests
     WHERE id = $1 AND member_id = $2 AND branch_id = $3
     LIMIT 1`,
    [requestId, memberId, branchId]
  );
  return r.rows[0] ?? null;
}

const BRANCH_REQUEST_SELECT = `
  SELECT r.*,
         m.full_name AS member_name,
         m.email AS member_email,
         m.phone AS member_phone
  FROM public.church_member_requests r
  INNER JOIN public.church_members m ON m.id = r.member_id
`;

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ status?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listMemberRequestsForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const params = [branchId];
  let where = "WHERE r.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND r.status = $${params.length}`;
  }
  const r = await pool.query(
    `${BRANCH_REQUEST_SELECT}
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
async function findMemberRequestByIdForBranch(pool, requestId, branchId) {
  const r = await pool.query(
    `${BRANCH_REQUEST_SELECT}
     WHERE r.id = $1 AND r.branch_id = $2
     LIMIT 1`,
    [requestId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} requestId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updateMemberRequestStatusForBranch(pool, requestId, branchId, update) {
  const params = [update.status];
  const sets = ["status = $1", "updated_at = now()"];
  let idx = 2;

  if (update.admin_comment !== undefined) {
    sets.push(`admin_comment = $${idx}`);
    params.push(update.admin_comment);
    idx += 1;
  }
  if (update.assigned_admin_id !== undefined) {
    sets.push(`assigned_admin_id = $${idx}`);
    params.push(update.assigned_admin_id);
    idx += 1;
  }
  if (update.set_reviewed_at) {
    sets.push("reviewed_at = now()");
  }
  if (update.set_completed_at) {
    sets.push("completed_at = now()");
  }

  params.push(requestId);
  const idParam = idx;
  idx += 1;
  params.push(branchId);
  const branchParam = idx;
  idx += 1;

  let where = `WHERE id = $${idParam} AND branch_id = $${branchParam}`;
  if (update.from_status) {
    params.push(update.from_status);
    where += ` AND status = $${idx}`;
  }

  const r = await pool.query(
    `UPDATE public.church_member_requests
     SET ${sets.join(", ")}
     ${where}
     RETURNING id`,
    params
  );
  if (!r.rows[0]) return null;
  return findMemberRequestByIdForBranch(pool, requestId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countMemberRequestsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_member_requests
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const out = {
    submitted: 0,
    in_review: 0,
    more_info_needed: 0,
    approved: 0,
    rejected: 0,
    completed: 0,
  };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

module.exports = {
  createMemberRequest,
  listMemberRequestsForMember,
  findMemberRequestByIdForMember,
  listMemberRequestsForBranch,
  findMemberRequestByIdForBranch,
  updateMemberRequestStatusForBranch,
  countMemberRequestsByStatusForBranch,
};
