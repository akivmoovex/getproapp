"use strict";

/**
 * Field agent accounts (per-tenant), separate from admin_users.
 */

async function getById(pool, id) {
  const r = await pool.query(`SELECT * FROM public.field_agents WHERE id = $1`, [id]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 */
async function getByIdAndTenant(pool, id, tenantId) {
  const r = await pool.query(
    `SELECT * FROM public.field_agents WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [id, tenantId]
  );
  return r.rows[0] ?? null;
}

async function getByUsernameAndTenant(pool, usernameLower, tenantId) {
  const r = await pool.query(
    `SELECT * FROM public.field_agents WHERE tenant_id = $1 AND lower(username) = lower($2) LIMIT 1`,
    [tenantId, usernameLower]
  );
  return r.rows[0] ?? null;
}

async function insertAgent(pool, { tenantId, username, passwordHash, displayName, phone }) {
  const r = await pool.query(
    `INSERT INTO public.field_agents (tenant_id, username, password_hash, display_name, phone)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [tenantId, String(username).toLowerCase().trim(), passwordHash, displayName || "", phone || ""]
  );
  return Number(r.rows[0].id);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 */
async function deleteByIdAndTenantId(pool, id, tenantId) {
  const r = await pool.query(`DELETE FROM public.field_agents WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rowCount > 0;
}

module.exports = {
  getById,
  getByIdAndTenant,
  getByUsernameAndTenant,
  insertAgent,
  deleteByIdAndTenantId,
};
