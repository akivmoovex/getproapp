"use strict";

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listMinistriesForMember(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT m.*, mm.role, mm.status AS assignment_status, mm.joined_at
     FROM public.church_member_ministries mm
     INNER JOIN public.church_ministries m ON m.id = mm.ministry_id
     WHERE mm.member_id = $1
       AND mm.branch_id = $2
       AND mm.status = 'active'
       AND m.status = 'published'
     ORDER BY m.name ASC`,
    [memberId, branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} ministryId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findActiveMemberMinistry(pool, memberId, ministryId, branchId) {
  const r = await pool.query(
    `SELECT mm.*, m.name AS ministry_name
     FROM public.church_member_ministries mm
     INNER JOIN public.church_ministries m ON m.id = mm.ministry_id
     WHERE mm.member_id = $1
       AND mm.ministry_id = $2
       AND mm.branch_id = $3
       AND mm.status = 'active'
     LIMIT 1`,
    [memberId, ministryId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object | null>}
 */
async function addMemberToMinistry(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_member_ministries (
       organization_id, branch_id, member_id, ministry_id, role, status, joined_at
     ) VALUES ($1, $2, $3, $4, $5, 'active', now())
     ON CONFLICT (member_id, ministry_id) DO UPDATE SET
       role = EXCLUDED.role,
       status = 'active',
       joined_at = COALESCE(public.church_member_ministries.joined_at, now()),
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.ministry_id,
      fields.role || "member",
    ]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} ministryId
 * @param {number} branchId
 * @param {{ status?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listMembersForMinistry(pool, ministryId, branchId, opts = {}) {
  const status = String(opts.status || "active").trim();
  const params = [ministryId, branchId];
  let where = "WHERE mm.ministry_id = $1 AND mm.branch_id = $2";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND mm.status = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT mem.id, mem.full_name, mem.email, mem.phone, mm.role, mm.status, mm.joined_at
     FROM public.church_member_ministries mm
     INNER JOIN public.church_members mem ON mem.id = mm.member_id
     ${where}
     ORDER BY mem.full_name ASC`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} ministryId
 * @param {number} branchId
 * @param {{ status?: string }} opts
 * @returns {Promise<number>}
 */
async function countMembersForMinistry(pool, ministryId, branchId, opts = {}) {
  const status = String(opts.status || "active").trim();
  const params = [ministryId, branchId];
  let where = "WHERE mm.ministry_id = $1 AND mm.branch_id = $2";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND mm.status = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_member_ministries mm
     ${where}`,
    params
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object | null>}
 */
async function addMemberInterestInMinistry(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_member_ministries (
       organization_id, branch_id, member_id, ministry_id, role, status
     ) VALUES ($1, $2, $3, $4, $5, 'interested')
     ON CONFLICT (member_id, ministry_id) DO UPDATE SET
       status = EXCLUDED.status,
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.ministry_id,
      fields.role || "member",
    ]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  listMinistriesForMember,
  findActiveMemberMinistry,
  addMemberToMinistry,
  listMembersForMinistry,
  countMembersForMinistry,
  addMemberInterestInMinistry,
};
