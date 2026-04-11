"use strict";

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function getByTenantId(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return null;
  const r = await pool.query(
    `SELECT tenant_id, currency, deal_price_percentage, minimum_credit_balance, starting_credit_balance,
            minimum_review_rating, updated_at
     FROM public.tenant_commerce_settings
     WHERE tenant_id = $1`,
    [tid]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{
 *   currency?: string,
 *   deal_price_percentage?: number,
 *   minimum_credit_balance?: number,
 *   starting_credit_balance?: number,
 *   minimum_review_rating?: number,
 * }} patch
 */
async function upsert(pool, tenantId, patch) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return false;
  const currency = patch.currency != null ? String(patch.currency).trim().slice(0, 12) : "ZMW";
  const deal_price_percentage =
    patch.deal_price_percentage != null && Number.isFinite(Number(patch.deal_price_percentage))
      ? Number(patch.deal_price_percentage)
      : 3;
  const minimum_credit_balance =
    patch.minimum_credit_balance != null && Number.isFinite(Number(patch.minimum_credit_balance))
      ? Number(patch.minimum_credit_balance)
      : 0;
  const starting_credit_balance =
    patch.starting_credit_balance != null && Number.isFinite(Number(patch.starting_credit_balance))
      ? Number(patch.starting_credit_balance)
      : 250;
  const minimum_review_rating =
    patch.minimum_review_rating != null && Number.isFinite(Number(patch.minimum_review_rating))
      ? Number(patch.minimum_review_rating)
      : 3;

  await pool.query(
    `INSERT INTO public.tenant_commerce_settings
      (tenant_id, currency, deal_price_percentage, minimum_credit_balance, starting_credit_balance, minimum_review_rating, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (tenant_id) DO UPDATE SET
       currency = EXCLUDED.currency,
       deal_price_percentage = EXCLUDED.deal_price_percentage,
       minimum_credit_balance = EXCLUDED.minimum_credit_balance,
       starting_credit_balance = EXCLUDED.starting_credit_balance,
       minimum_review_rating = EXCLUDED.minimum_review_rating,
       updated_at = now()`,
    [tid, currency, deal_price_percentage, minimum_credit_balance, starting_credit_balance, minimum_review_rating]
  );
  return true;
}

module.exports = {
  getByTenantId,
  upsert,
};
