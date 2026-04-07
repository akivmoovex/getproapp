"use strict";

/**
 * PostgreSQL access for public.professional_signups.
 */

function serializeSignupRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.created_at instanceof Date) {
    out.created_at = out.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  if (out.converted_company_id != null) {
    out.converted_company_id = Number(out.converted_company_id);
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<number>}
 */
async function countByTenantId(pool, tenantId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.professional_signups WHERE tenant_id = $1`,
    [tenantId]
  );
  return Number(r.rows[0].c);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} limit
 */
async function listByTenantId(pool, tenantId, limit = 200) {
  const r = await pool.query(
    `
    SELECT id, profession, city, name, phone, vat_or_pacra, created_at,
           COALESCE(converted_company_id, 0) AS converted_company_id
    FROM public.professional_signups
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [tenantId, limit]
  );
  return r.rows.map(serializeSignupRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} id
 * @param {number} tenantId
 */
async function getByIdAndTenantId(pool, id, tenantId) {
  const r = await pool.query(
    `SELECT * FROM public.professional_signups WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return r.rows[0] ? serializeSignupRow(r.rows[0]) : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} signupId
 * @param {number} tenantId
 * @param {number} companyId
 */
async function setConvertedCompanyId(pool, signupId, tenantId, companyId) {
  const r = await pool.query(
    `UPDATE public.professional_signups SET converted_company_id = $1 WHERE id = $2 AND tenant_id = $3`,
    [companyId, signupId, tenantId]
  );
  return r.rowCount > 0;
}

/**
 * Public API: join / professional signup (same semantics as SQLite `POST /api/professional-signups`).
 * @param {import("pg").Pool} pool
 * @param {{ profession: string, city: string, name: string, phone: string, vatOrPacra: string, tenantId: number }} p
 * @returns {Promise<number>} new signup id
 */
async function insertSignup(pool, { profession, city, name, phone, vatOrPacra, tenantId }) {
  const r = await pool.query(
    `
    INSERT INTO public.professional_signups (profession, city, name, phone, vat_or_pacra, tenant_id)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [profession, city, name, phone, vatOrPacra, tenantId]
  );
  return Number(r.rows[0].id);
}

module.exports = {
  countByTenantId,
  listByTenantId,
  getByIdAndTenantId,
  setConvertedCompanyId,
  insertSignup,
};
