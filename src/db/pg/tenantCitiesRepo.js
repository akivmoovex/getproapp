"use strict";

/**
 * PostgreSQL access for public.tenant_cities (tenant-scoped).
 */

function serializeRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.enabled != null) out.enabled = Boolean(out.enabled);
  if (out.big_city != null) out.big_city = Boolean(out.big_city);
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listByTenantIdOrderByName(pool, tenantId) {
  const r = await pool.query(
    `SELECT id, tenant_id, name, enabled, big_city
     FROM public.tenant_cities
     WHERE tenant_id = $1
     ORDER BY lower(name) ASC`,
    [tenantId]
  );
  return r.rows.map(serializeRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, name: string, enabled: boolean, bigCity: boolean }} p
 */
async function insert(pool, { tenantId, name, enabled, bigCity }) {
  const r = await pool.query(
    `INSERT INTO public.tenant_cities (tenant_id, name, enabled, big_city)
     VALUES ($1, $2, $3, $4)
     RETURNING id, tenant_id, name, enabled, big_city`,
    [tenantId, name, enabled, bigCity]
  );
  return serializeRow(r.rows[0]);
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ id: number, tenantId: number, name: string, enabled: boolean, bigCity: boolean }} p
 */
async function updateByIdAndTenantId(pool, { id, tenantId, name, enabled, bigCity }) {
  const r = await pool.query(
    `UPDATE public.tenant_cities SET name = $1, enabled = $2, big_city = $3
     WHERE id = $4 AND tenant_id = $5
     RETURNING id, tenant_id, name, enabled, big_city`,
    [name, enabled, bigCity, id, tenantId]
  );
  return r.rows[0] ? serializeRow(r.rows[0]) : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 */
async function deleteByIdAndTenantId(pool, id, tenantId) {
  const r = await pool.query(`DELETE FROM public.tenant_cities WHERE id = $1 AND tenant_id = $2`, [id, tenantId]);
  return r.rowCount > 0;
}

module.exports = {
  listByTenantIdOrderByName,
  insert,
  updateByIdAndTenantId,
  deleteByIdAndTenantId,
};
