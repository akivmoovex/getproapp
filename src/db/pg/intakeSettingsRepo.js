"use strict";

const DEFAULT_RESPONSE_HOURS = 72;

function mapAllocationRow(row) {
  const n = (v, d) => (v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : d);
  const flag = (v, defaultTrue) => (v === false ? false : defaultTrue);
  if (!row) {
    return {
      established_min_rating: 3.0,
      established_min_review_count: 5,
      provisional_min_rating: 2.0,
      provisional_max_review_count: 4,
      initial_allocation_count: 3,
      target_positive_responses: 2,
      require_category_for_publish: true,
      require_budget_for_publish: true,
      require_min_images_for_publish: true,
      min_images_for_publish: 1,
    };
  }
  return {
    established_min_rating: n(row.established_min_rating, 3.0),
    established_min_review_count: n(row.established_min_review_count, 5),
    provisional_min_rating: n(row.provisional_min_rating, 2.0),
    provisional_max_review_count: n(row.provisional_max_review_count, 4),
    initial_allocation_count: n(row.initial_allocation_count, 3),
    target_positive_responses: n(row.target_positive_responses, 2),
    require_category_for_publish: flag(row.require_category_for_publish, true),
    require_budget_for_publish: flag(row.require_budget_for_publish, true),
    require_min_images_for_publish: flag(row.require_min_images_for_publish, true),
    min_images_for_publish: Math.max(0, Math.floor(n(row.min_images_for_publish, 1))),
  };
}

/**
 * @param {import("pg").Pool} pool
 */
async function getAllocationSettings(pool, tenantId) {
  const r = await pool.query(`SELECT * FROM public.intake_allocation_settings WHERE tenant_id = $1`, [tenantId]);
  return mapAllocationRow(r.rows[0]);
}

/**
 * @param {import("pg").Pool} pool
 */
async function getCategoryResponseWindowHours(pool, tenantId, categoryId) {
  const tid = Number(tenantId);
  const cid = Number(categoryId);
  if (!cid || cid < 1) return DEFAULT_RESPONSE_HOURS;
  const r = await pool.query(
    `SELECT response_window_hours FROM public.intake_category_lead_settings WHERE tenant_id = $1 AND category_id = $2`,
    [tid, cid]
  );
  const row = r.rows[0];
  if (!row || row.response_window_hours == null) return DEFAULT_RESPONSE_HOURS;
  const h = Number(row.response_window_hours);
  return Number.isFinite(h) && h > 0 ? h : DEFAULT_RESPONSE_HOURS;
}

module.exports = {
  getAllocationSettings,
  getCategoryResponseWindowHours,
  mapAllocationRow,
};
