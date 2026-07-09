"use strict";

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createPrayerRequest(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_prayer_requests (
       organization_id, branch_id, member_id,
       prayer_topic, details, urgency, privacy_level, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'submitted')
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.prayer_topic,
      fields.details || "",
      fields.urgency || "normal",
      fields.privacy_level,
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
async function listPrayerRequestsForMember(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT *
     FROM public.church_prayer_requests
     WHERE member_id = $1 AND branch_id = $2
     ORDER BY created_at DESC`,
    [memberId, branchId]
  );
  return r.rows;
}

const BRANCH_PRAYER_SELECT = `
  SELECT p.*,
         m.full_name AS member_name,
         m.email AS member_email
  FROM public.church_prayer_requests p
  INNER JOIN public.church_members m ON m.id = p.member_id
`;

function mapPrayerRow(row, adminRole) {
  if (!row) return row;
  const { showPrayerMemberIdentity } = require("../../../church/requestProcessingValidation");
  const showIdentity = showPrayerMemberIdentity(row, adminRole);
  return {
    ...row,
    member_display_name: showIdentity ? row.member_name : "Anonymous",
    identity_masked: !showIdentity,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ adminRole?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listPrayerRequestsForBranch(pool, branchId, opts = {}) {
  const r = await pool.query(
    `${BRANCH_PRAYER_SELECT}
     WHERE p.branch_id = $1
     ORDER BY p.created_at DESC`,
    [branchId]
  );
  return r.rows.map((row) => mapPrayerRow(row, opts.adminRole));
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} prayerRequestId
 * @param {number} branchId
 * @param {{ adminRole?: string }} opts
 * @returns {Promise<object | null>}
 */
async function findPrayerRequestByIdForBranch(pool, prayerRequestId, branchId, opts = {}) {
  const r = await pool.query(
    `${BRANCH_PRAYER_SELECT}
     WHERE p.id = $1 AND p.branch_id = $2
     LIMIT 1`,
    [prayerRequestId, branchId]
  );
  return mapPrayerRow(r.rows[0] ?? null, opts.adminRole);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} prayerRequestId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updatePrayerRequestStatusForBranch(pool, prayerRequestId, branchId, update) {
  const params = [update.status];
  const sets = ["status = $1", "updated_at = now()"];
  let idx = 2;

  if (update.admin_comment !== undefined) {
    sets.push(`admin_comment = $${idx}`);
    params.push(update.admin_comment);
    idx += 1;
  }
  if (update.reviewed_by_admin_id !== undefined) {
    sets.push(`reviewed_by_admin_id = $${idx}`);
    params.push(update.reviewed_by_admin_id);
    idx += 1;
  }
  if (update.set_reviewed_at) {
    sets.push("reviewed_at = now()");
  }
  if (update.set_closed_at) {
    sets.push("closed_at = now()");
  }

  params.push(prayerRequestId);
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
    `UPDATE public.church_prayer_requests
     SET ${sets.join(", ")}
     ${where}
     RETURNING id`,
    params
  );
  if (!r.rows[0]) return null;
  return findPrayerRequestByIdForBranch(pool, prayerRequestId, branchId, {
    adminRole: update.admin_role,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countPrayerRequestsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_prayer_requests
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const out = { submitted: 0, reviewed: 0, closed: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

module.exports = {
  createPrayerRequest,
  listPrayerRequestsForMember,
  listPrayerRequestsForBranch,
  findPrayerRequestByIdForBranch,
  updatePrayerRequestStatusForBranch,
  countPrayerRequestsByStatusForBranch,
  mapPrayerRow,
};
