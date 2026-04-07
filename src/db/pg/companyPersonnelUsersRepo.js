"use strict";

/**
 * PostgreSQL: company portal personnel sign-in (Wave 3).
 */

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} usernameLower trimmed, max 80
 */
async function findForAuthByUsername(pool, tenantId, usernameLower) {
  const r = await pool.query(
    `
    SELECT cpu.id, cpu.company_id, cpu.full_name, cpu.password_hash, cpu.is_active
    FROM public.company_personnel_users cpu
    INNER JOIN public.companies c ON c.id = cpu.company_id AND c.tenant_id = cpu.tenant_id
    WHERE cpu.tenant_id = $1
      AND length(trim(cpu.username)) > 0
      AND lower(trim(cpu.username)) = $2
    LIMIT 1
    `,
    [tenantId, usernameLower]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} phoneNormalized
 */
async function findForAuthByPhoneNormalized(pool, tenantId, phoneNormalized) {
  const r = await pool.query(
    `
    SELECT cpu.id, cpu.company_id, cpu.full_name, cpu.password_hash, cpu.is_active
    FROM public.company_personnel_users cpu
    INNER JOIN public.companies c ON c.id = cpu.company_id AND c.tenant_id = cpu.tenant_id
    WHERE cpu.tenant_id = $1 AND cpu.phone_normalized = $2
    LIMIT 1
    `,
    [tenantId, phoneNormalized]
  );
  return r.rows[0] ?? null;
}

/**
 * Admin portal-users list: same shape as legacy SQLite row for `company_portal_users.ejs`.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} companyId
 */
async function listForAdminByTenantAndCompany(pool, tenantId, companyId) {
  const r = await pool.query(
    `
    SELECT id, full_name, username, phone_normalized, nrz_number, is_active, created_at
    FROM public.company_personnel_users
    WHERE tenant_id = $1 AND company_id = $2
    ORDER BY id ASC
    `,
    [tenantId, companyId]
  );
  return r.rows.map((row) => {
    const o = { ...row };
    if (o.created_at instanceof Date) {
      o.created_at = o.created_at.toISOString().replace("T", " ").slice(0, 19);
    }
    return o;
  });
}

/**
 * Tenant-wide NRZ duplicate check (any company), matches SQLite admin intake rule.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {string} nrzUpper normalized NRZ (uppercase)
 */
async function findIdByTenantAndNrzUpper(pool, tenantId, nrzUpper) {
  const r = await pool.query(
    `
    SELECT id FROM public.company_personnel_users
    WHERE tenant_id = $1 AND length(trim(nrz_number)) > 0 AND upper(trim(nrz_number)) = $2
    LIMIT 1
    `,
    [tenantId, nrzUpper]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   companyId: number,
 *   fullName: string,
 *   username: string,
 *   phoneNormalized: string,
 *   nrzNumber: string,
 *   passwordHash: string,
 * }} row
 */
async function insertPortalUserAdmin(pool, row) {
  await pool.query(
    `
    INSERT INTO public.company_personnel_users (
      tenant_id, company_id, full_name, username, phone_normalized, nrz_number, password_hash, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
    `,
    [
      row.tenantId,
      row.companyId,
      row.fullName,
      row.username,
      row.phoneNormalized,
      row.nrzNumber,
      row.passwordHash,
    ]
  );
}

module.exports = {
  findForAuthByUsername,
  findForAuthByPhoneNormalized,
  listForAdminByTenantAndCompany,
  findIdByTenantAndNrzUpper,
  insertPortalUserAdmin,
};
