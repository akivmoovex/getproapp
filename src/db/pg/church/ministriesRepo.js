"use strict";

const MINISTRY_SELECT = `
  SELECT m.*,
         COALESCE(mc.member_count, 0)::int AS member_count
  FROM public.church_ministries m
  LEFT JOIN (
    SELECT ministry_id, COUNT(*)::int AS member_count
    FROM public.church_member_ministries
    WHERE status IN ('interested', 'active')
    GROUP BY ministry_id
  ) mc ON mc.ministry_id = m.id
`;

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createMinistryForBranch(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_ministries (
       organization_id, branch_id, name, slug, description,
       leader_name, leader_phone, meeting_day, meeting_time, location,
       visibility, status, created_by_admin_id, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.name,
      fields.slug,
      fields.description || "",
      fields.leader_name || "",
      fields.leader_phone || null,
      fields.meeting_day || null,
      fields.meeting_time || null,
      fields.location || null,
      fields.visibility || "members",
      fields.status || "draft",
      fields.created_by_admin_id || null,
    ]
  );
  return findMinistryByIdForBranch(pool, r.rows[0].id, fields.branch_id);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ status?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listMinistriesForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const params = [branchId];
  let where = "WHERE m.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND m.status = $${params.length}`;
  }
  const r = await pool.query(
    `${MINISTRY_SELECT}
     ${where}
     ORDER BY m.name ASC`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ visibility?: string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listPublishedMinistriesForBranch(pool, branchId, opts = {}) {
  const params = [branchId];
  let where = "WHERE m.branch_id = $1 AND m.status = 'published'";
  if (opts.visibility) {
    params.push(opts.visibility);
    where += ` AND m.visibility = $${params.length}`;
  }
  let limitClause = "";
  if (opts.limit) {
    params.push(Math.min(Math.max(Number(opts.limit) || 20, 1), 50));
    limitClause = ` LIMIT $${params.length}`;
  }
  const r = await pool.query(
    `${MINISTRY_SELECT}
     ${where}
     ORDER BY m.name ASC${limitClause}`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listVisibleMinistriesForMember(pool, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const r = await pool.query(
    `${MINISTRY_SELECT}
     WHERE m.branch_id = $1
       AND m.status = 'published'
       AND m.visibility = ANY($2::text[])
     ORDER BY m.name ASC
     LIMIT $3`,
    [branchId, ["public", "members", "leaders"], limit]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} ministryId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findMinistryByIdForBranch(pool, ministryId, branchId) {
  const r = await pool.query(
    `${MINISTRY_SELECT}
     WHERE m.id = $1 AND m.branch_id = $2
     LIMIT 1`,
    [ministryId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} ministryId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updateMinistryForBranch(pool, ministryId, branchId, update) {
  const r = await pool.query(
    `UPDATE public.church_ministries
     SET name = $1,
         slug = $2,
         description = $3,
         leader_name = $4,
         leader_phone = $5,
         meeting_day = $6,
         meeting_time = $7,
         location = $8,
         visibility = $9,
         updated_by_admin_id = $10,
         updated_at = now()
     WHERE id = $11 AND branch_id = $12
     RETURNING id`,
    [
      update.name,
      update.slug,
      update.description,
      update.leader_name,
      update.leader_phone || null,
      update.meeting_day || null,
      update.meeting_time || null,
      update.location || null,
      update.visibility,
      update.updated_by_admin_id || null,
      ministryId,
      branchId,
    ]
  );
  if (!r.rows[0]) return null;
  return findMinistryByIdForBranch(pool, ministryId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} ministryId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function publishMinistryForBranch(pool, ministryId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_ministries
     SET status = 'published',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status IN ('draft', 'published')
     RETURNING id`,
    [adminId, ministryId, branchId]
  );
  if (!r.rows[0]) return null;
  return findMinistryByIdForBranch(pool, ministryId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} ministryId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function archiveMinistryForBranch(pool, ministryId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_ministries
     SET status = 'archived',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status IN ('draft', 'published')
     RETURNING id`,
    [adminId, ministryId, branchId]
  );
  if (!r.rows[0]) return null;
  return findMinistryByIdForBranch(pool, ministryId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countMinistriesByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_ministries
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const out = { draft: 0, published: 0, archived: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

const ministryActivityNotesRepo = require("./ministryActivityNotesRepo");

/** @see ministryActivityNotesRepo.getMinistryActivitySummaryForBranchPeriod */
async function getMinistryActivitySummaryForBranchPeriod(pool, branchId, year, month) {
  return ministryActivityNotesRepo.getMinistryActivitySummaryForBranchPeriod(pool, branchId, year, month);
}

module.exports = {
  createMinistryForBranch,
  listMinistriesForBranch,
  listPublishedMinistriesForBranch,
  listVisibleMinistriesForMember,
  findMinistryByIdForBranch,
  updateMinistryForBranch,
  publishMinistryForBranch,
  archiveMinistryForBranch,
  countMinistriesByStatusForBranch,
  getMinistryActivitySummaryForBranchPeriod,
};
