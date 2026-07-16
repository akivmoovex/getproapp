"use strict";

const { mapPrayerRowForAdmin } = require("../../../church/foundationPastoralAccess");

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
         m.email AS member_email,
         aa.full_name AS assigned_admin_name,
         ab.full_name AS acknowledged_by_name
  FROM public.church_prayer_requests p
  INNER JOIN public.church_members m ON m.id = p.member_id
  LEFT JOIN public.church_branch_admins aa ON aa.id = p.assigned_admin_id
  LEFT JOIN public.church_branch_admins ab ON ab.id = p.acknowledged_by_admin_id
`;

function mapPrayerRow(row, opts = {}) {
  if (!row) return row;
  if (opts.pastoralAccess) {
    return mapPrayerRowForAdmin(row, { can_access_pastoral: true });
  }
  if (opts.admin) {
    return mapPrayerRowForAdmin(row, opts.admin);
  }
  const { showPrayerMemberIdentity } = require("../../../church/requestProcessingValidation");
  const showIdentity = showPrayerMemberIdentity(row, opts.adminRole);
  return {
    ...row,
    member_display_name: showIdentity ? row.member_name : "Anonymous",
    identity_masked: !showIdentity,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ admin?: object, pastoralAccess?: boolean }} opts
 * @returns {Promise<object[]>}
 */
async function listPrayerRequestsForBranch(pool, branchId, opts = {}) {
  const r = await pool.query(
    `${BRANCH_PRAYER_SELECT}
     WHERE p.branch_id = $1
     ORDER BY p.created_at DESC`,
    [branchId]
  );
  return r.rows.map((row) => mapPrayerRow(row, opts));
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} prayerRequestId
 * @param {number} branchId
 * @param {{ admin?: object, pastoralAccess?: boolean, adminRole?: string }} opts
 * @returns {Promise<object | null>}
 */
async function findPrayerRequestByIdForBranch(pool, prayerRequestId, branchId, opts = {}) {
  const r = await pool.query(
    `${BRANCH_PRAYER_SELECT}
     WHERE p.id = $1 AND p.branch_id = $2
     LIMIT 1`,
    [prayerRequestId, branchId]
  );
  return mapPrayerRow(r.rows[0] ?? null, opts);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} prayerRequestId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updatePrayerRequestForBranch(pool, prayerRequestId, branchId, update) {
  const sets = ["updated_at = now()"];
  const params = [];
  let idx = 1;

  const fields = [
    ["status", "status"],
    ["admin_comment", "admin_comment"],
    ["reviewed_by_admin_id", "reviewed_by_admin_id"],
    ["assigned_admin_id", "assigned_admin_id"],
    ["acknowledged_by_admin_id", "acknowledged_by_admin_id"],
    ["due_date", "due_date"],
    ["next_action", "next_action"],
    ["closure_outcome", "closure_outcome"],
    ["closure_reason", "closure_reason"],
  ];
  for (const [key, col] of fields) {
    if (update[key] !== undefined) {
      sets.push(`${col} = $${idx}${col === "due_date" ? "::date" : ""}`);
      params.push(update[key]);
      idx += 1;
    }
  }
  if (update.set_reviewed_at) sets.push("reviewed_at = now()");
  if (update.set_acknowledged_at) sets.push("acknowledged_at = now()");
  if (update.set_closed_at) sets.push("closed_at = now()");

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
    pastoralAccess: true,
    admin: update.admin,
    adminRole: update.admin_role,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} prayerRequestId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updatePrayerRequestStatusForBranch(pool, prayerRequestId, branchId, update) {
  return updatePrayerRequestForBranch(pool, prayerRequestId, branchId, update);
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
  const out = {
    submitted: 0,
    acknowledged: 0,
    assigned: 0,
    in_follow_up: 0,
    reviewed: 0,
    closed: 0,
  };
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
  updatePrayerRequestForBranch,
  updatePrayerRequestStatusForBranch,
  countPrayerRequestsByStatusForBranch,
  mapPrayerRow,
};
