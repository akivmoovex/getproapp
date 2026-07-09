"use strict";

const DUTY_SELECT = `
  SELECT d.*,
         m.full_name AS assigned_member_full_name,
         min.name AS ministry_name,
         dep.name AS department_name,
         ca.full_name AS created_by_admin_name
  FROM public.church_duty_roster d
  LEFT JOIN public.church_members m ON m.id = d.assigned_member_id
  LEFT JOIN public.church_ministries min ON min.id = d.ministry_id
  LEFT JOIN public.church_departments dep ON dep.id = d.department_id
  LEFT JOIN public.church_branch_admins ca ON ca.id = d.created_by_admin_id
`;

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createDutyForBranch(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_duty_roster (
       organization_id, branch_id, duty_date, service_name, role_name,
       assigned_member_id, assigned_member_name, ministry_id, department_id,
       notes, status, created_by_admin_id, updated_by_admin_id
     ) VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.duty_date,
      fields.service_name,
      fields.role_name,
      fields.assigned_member_id || null,
      fields.assigned_member_name || null,
      fields.ministry_id || null,
      fields.department_id || null,
      fields.notes || null,
      fields.status || "draft",
      fields.created_by_admin_id || null,
    ]
  );
  return findDutyByIdForBranch(pool, r.rows[0].id, fields.branch_id);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ status?: string, timeframe?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listDutiesForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const timeframe = String(opts.timeframe || "all").trim();
  const params = [branchId];
  let where = "WHERE d.branch_id = $1";

  if (status && status !== "all") {
    params.push(status);
    where += ` AND d.status = $${params.length}`;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (timeframe === "upcoming") {
    params.push(today);
    where += ` AND d.duty_date >= $${params.length}::date AND d.status <> 'cancelled'`;
  } else if (timeframe === "past") {
    params.push(today);
    where += ` AND d.duty_date < $${params.length}::date`;
  }

  const order =
    timeframe === "past"
      ? "ORDER BY d.duty_date DESC, d.service_name ASC"
      : "ORDER BY d.duty_date ASC, d.service_name ASC";

  const r = await pool.query(`${DUTY_SELECT} ${where} ${order}`, params);
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listUpcomingDutiesForBranch(pool, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const today = new Date().toISOString().slice(0, 10);
  const r = await pool.query(
    `${DUTY_SELECT}
     WHERE d.branch_id = $1
       AND d.duty_date >= $2::date
       AND d.status <> 'cancelled'
     ORDER BY d.duty_date ASC, d.service_name ASC
     LIMIT $3`,
    [branchId, today, limit]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} dutyId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findDutyByIdForBranch(pool, dutyId, branchId) {
  const r = await pool.query(
    `${DUTY_SELECT}
     WHERE d.id = $1 AND d.branch_id = $2
     LIMIT 1`,
    [dutyId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} dutyId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updateDutyForBranch(pool, dutyId, branchId, update) {
  const r = await pool.query(
    `UPDATE public.church_duty_roster
     SET duty_date = $1::date,
         service_name = $2,
         role_name = $3,
         assigned_member_id = $4,
         assigned_member_name = $5,
         ministry_id = $6,
         department_id = $7,
         notes = $8,
         updated_by_admin_id = $9,
         updated_at = now()
     WHERE id = $10 AND branch_id = $11 AND status <> 'cancelled'
     RETURNING id`,
    [
      update.duty_date,
      update.service_name,
      update.role_name,
      update.assigned_member_id || null,
      update.assigned_member_name || null,
      update.ministry_id || null,
      update.department_id || null,
      update.notes || null,
      update.updated_by_admin_id || null,
      dutyId,
      branchId,
    ]
  );
  if (!r.rows[0]) return null;
  return findDutyByIdForBranch(pool, dutyId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} dutyId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function confirmDutyForBranch(pool, dutyId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_duty_roster
     SET status = 'confirmed',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3
       AND status IN ('draft', 'confirmed')
       AND assigned_member_id IS NOT NULL
     RETURNING id`,
    [adminId, dutyId, branchId]
  );
  if (!r.rows[0]) return null;
  return findDutyByIdForBranch(pool, dutyId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} dutyId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function cancelDutyForBranch(pool, dutyId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_duty_roster
     SET status = 'cancelled',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status <> 'cancelled'
     RETURNING id`,
    [adminId, dutyId, branchId]
  );
  if (!r.rows[0]) return null;
  return findDutyByIdForBranch(pool, dutyId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {{ timeframe?: string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listDutiesForMember(pool, memberId, branchId, opts = {}) {
  const timeframe = String(opts.timeframe || "all").trim();
  const params = [memberId, branchId];
  let where = "WHERE d.assigned_member_id = $1 AND d.branch_id = $2 AND d.status = 'confirmed'";

  const today = new Date().toISOString().slice(0, 10);
  if (timeframe === "upcoming") {
    params.push(today);
    where += ` AND d.duty_date >= $${params.length}::date`;
  } else if (timeframe === "past") {
    params.push(today);
    where += ` AND d.duty_date < $${params.length}::date`;
  }

  let limitClause = "";
  if (opts.limit) {
    params.push(Math.min(Math.max(Number(opts.limit) || 10, 1), 50));
    limitClause = ` LIMIT $${params.length}`;
  }

  const order =
    timeframe === "past"
      ? "ORDER BY d.duty_date DESC, d.service_name ASC"
      : "ORDER BY d.duty_date ASC, d.service_name ASC";

  const r = await pool.query(`${DUTY_SELECT} ${where} ${order}${limitClause}`, params);
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {{ timeframe?: string }} opts
 * @returns {Promise<number>}
 */
async function countDutiesForMember(pool, memberId, branchId, opts = {}) {
  const timeframe = String(opts.timeframe || "all").trim();
  const params = [memberId, branchId];
  let where = "WHERE assigned_member_id = $1 AND branch_id = $2 AND status = 'confirmed'";
  const today = new Date().toISOString().slice(0, 10);
  if (timeframe === "upcoming") {
    params.push(today);
    where += ` AND duty_date >= $${params.length}::date`;
  } else if (timeframe === "past") {
    params.push(today);
    where += ` AND duty_date < $${params.length}::date`;
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.church_duty_roster ${where}`,
    params
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countDutiesByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_duty_roster
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const out = { draft: 0, confirmed: 0, cancelled: 0 };
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
 * @returns {Promise<number>}
 */
async function countConfirmedUpcomingDutiesForBranch(pool, branchId) {
  const today = new Date().toISOString().slice(0, 10);
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_duty_roster
     WHERE branch_id = $1
       AND status = 'confirmed'
       AND duty_date >= $2::date`,
    [branchId, today]
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} ministryId
 * @param {{ timeframe?: string, limit?: number }} opts
 * @returns {Promise<object[]>}
 */
async function listConfirmedDutiesForMinistry(pool, branchId, ministryId, opts = {}) {
  const timeframe = String(opts.timeframe || "upcoming").trim();
  const params = [branchId, ministryId];
  let where = "WHERE d.branch_id = $1 AND d.ministry_id = $2 AND d.status = 'confirmed'";

  const today = new Date().toISOString().slice(0, 10);
  if (timeframe === "upcoming") {
    params.push(today);
    where += ` AND d.duty_date >= $${params.length}::date`;
  } else if (timeframe === "past") {
    params.push(today);
    where += ` AND d.duty_date < $${params.length}::date`;
  }

  let limitClause = "";
  if (opts.limit) {
    params.push(Math.min(Math.max(Number(opts.limit) || 10, 1), 50));
    limitClause = ` LIMIT $${params.length}`;
  }

  const order =
    timeframe === "past"
      ? "ORDER BY d.duty_date DESC, d.service_name ASC"
      : "ORDER BY d.duty_date ASC, d.service_name ASC";

  const r = await pool.query(`${DUTY_SELECT} ${where} ${order}${limitClause}`, params);
  return r.rows;
}

module.exports = {
  createDutyForBranch,
  listDutiesForBranch,
  listUpcomingDutiesForBranch,
  findDutyByIdForBranch,
  updateDutyForBranch,
  confirmDutyForBranch,
  cancelDutyForBranch,
  listDutiesForMember,
  countDutiesForMember,
  countDutiesByStatusForBranch,
  countConfirmedUpcomingDutiesForBranch,
  listConfirmedDutiesForMinistry,
};
