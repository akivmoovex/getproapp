"use strict";

/**
 * PostgreSQL access for public.callback_interests.
 * When DATABASE_URL is set, POST /api/callback-interest and admin Leads use this table as source of truth.
 */

/**
 * @param {import("pg").Pool} pool
 * @param {{ phone: string, name: string, context: string, tenantId: number, interestLabel: string }} row
 * @returns {Promise<number>} inserted row id
 */
async function insertCallbackInterest(pool, row) {
  const r = await pool.query(
    `
    INSERT INTO public.callback_interests (phone, name, context, tenant_id, interest_label)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
    `,
    [
      row.phone ?? "",
      row.name ?? "",
      row.context ?? "",
      row.tenantId,
      row.interestLabel ?? "Potential Partner",
    ]
  );
  return Number(r.rows[0].id);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} [limit]
 * @returns {Promise<object[]>} rows id, phone, name, context, interest_label, created_at
 */
async function listForAdminByTenantId(pool, tenantId, limit = 200) {
  const r = await pool.query(
    `
    SELECT id, phone, name, context, interest_label, created_at
    FROM public.callback_interests
    WHERE tenant_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [tenantId, limit]
  );
  return r.rows;
}

/**
 * Legacy name: same INSERT as {@link insertCallbackInterest} without returning id (e.g. old dual-write scripts).
 * @deprecated Prefer insertCallbackInterest.
 */
async function insertCallbackInterestMirror(pool, row) {
  await insertCallbackInterest(pool, row);
}

module.exports = {
  insertCallbackInterest,
  listForAdminByTenantId,
  insertCallbackInterestMirror,
};
