"use strict";

const DEPARTMENT_SELECT = `SELECT * FROM public.church_departments d`;

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createDepartmentForBranch(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_departments (
       organization_id, branch_id, name, slug, purpose,
       leader_name, leader_phone, status,
       created_by_admin_id, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.name,
      fields.slug,
      fields.purpose || "",
      fields.leader_name || "",
      fields.leader_phone || null,
      fields.status || "active",
      fields.created_by_admin_id || null,
    ]
  );
  return findDepartmentByIdForBranch(pool, r.rows[0].id, fields.branch_id);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ status?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listDepartmentsForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const params = [branchId];
  let where = "WHERE d.branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND d.status = $${params.length}`;
  }
  const r = await pool.query(
    `${DEPARTMENT_SELECT}
     ${where}
     ORDER BY d.name ASC`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} departmentId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findDepartmentByIdForBranch(pool, departmentId, branchId) {
  const r = await pool.query(
    `${DEPARTMENT_SELECT}
     WHERE d.id = $1 AND d.branch_id = $2
     LIMIT 1`,
    [departmentId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} departmentId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updateDepartmentForBranch(pool, departmentId, branchId, update) {
  const r = await pool.query(
    `UPDATE public.church_departments
     SET name = $1,
         slug = $2,
         purpose = $3,
         leader_name = $4,
         leader_phone = $5,
         updated_by_admin_id = $6,
         updated_at = now()
     WHERE id = $7 AND branch_id = $8
     RETURNING id`,
    [
      update.name,
      update.slug,
      update.purpose,
      update.leader_name,
      update.leader_phone || null,
      update.updated_by_admin_id || null,
      departmentId,
      branchId,
    ]
  );
  if (!r.rows[0]) return null;
  return findDepartmentByIdForBranch(pool, departmentId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} departmentId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function activateDepartmentForBranch(pool, departmentId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_departments
     SET status = 'active',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING id`,
    [adminId, departmentId, branchId]
  );
  if (!r.rows[0]) return null;
  return findDepartmentByIdForBranch(pool, departmentId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} departmentId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function archiveDepartmentForBranch(pool, departmentId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_departments
     SET status = 'archived',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status = 'active'
     RETURNING id`,
    [adminId, departmentId, branchId]
  );
  if (!r.rows[0]) return null;
  return findDepartmentByIdForBranch(pool, departmentId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countDepartmentsByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_departments
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  const out = { active: 0, archived: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

module.exports = {
  createDepartmentForBranch,
  listDepartmentsForBranch,
  findDepartmentByIdForBranch,
  updateDepartmentForBranch,
  activateDepartmentForBranch,
  archiveDepartmentForBranch,
  countDepartmentsByStatusForBranch,
};
