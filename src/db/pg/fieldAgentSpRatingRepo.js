"use strict";

/**
 * Read-only: client→provider ratings (intake_deal_reviews.reviewer_role = 'client') for companies
 * where account_manager_field_agent_id matches. Not for bonuses/payouts in this module.
 */

/** Postgres undefined_table — optional intake_deal_reviews may be absent on older DBs. */
function isMissingIntakeDealReviewsRelationError(e) {
  return !!(e && e.code === "42P01");
}

/**
 * Average client review rating in the rolling window, or null if none.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} fieldAgentId
 * @param {number} [days=30]
 * @returns {Promise<number | null>}
 */
async function getAvgRatingLastDaysForAccountManagerFieldAgent(pool, tenantId, fieldAgentId, days = 30) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  const d = Math.min(Math.max(Math.floor(Number(days) || 30), 1), 366);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return null;
  let r;
  try {
    r = await pool.query(
      `
    SELECT AVG(idr.rating)::numeric AS avg_rating
    FROM public.intake_deal_reviews idr
    INNER JOIN public.intake_project_assignments a ON a.id = idr.assignment_id AND a.tenant_id = idr.tenant_id
    INNER JOIN public.companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
    WHERE idr.reviewer_role = 'client'
      AND idr.tenant_id = $1
      AND c.account_manager_field_agent_id = $2
      AND idr.created_at >= (now() - ($3::int * interval '1 day'))
    `,
      [tid, fid, d]
    );
  } catch (e) {
    if (isMissingIntakeDealReviewsRelationError(e)) return null;
    throw e;
  }
  const v = r.rows[0] && r.rows[0].avg_rating;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Recent client reviews for drill-down (no body text; read-only).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} fieldAgentId
 * @param {{ days?: number, limit?: number }} [opts]
 */
async function listRecentClientReviewsForAccountManagerFieldAgent(pool, tenantId, fieldAgentId, opts = {}) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  const d = Math.min(Math.max(Math.floor(Number(opts.days != null ? opts.days : 30) || 30), 1), 366);
  const lim = Math.min(Math.max(Math.floor(Number(opts.limit != null ? opts.limit : 75) || 75), 1), 100);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return [];
  let r;
  try {
    r = await pool.query(
      `
    SELECT
      c.name AS company_name,
      idr.rating::double precision AS rating,
      idr.created_at,
      p.id AS project_id,
      p.project_code AS project_code
    FROM public.intake_deal_reviews idr
    INNER JOIN public.intake_project_assignments a ON a.id = idr.assignment_id AND a.tenant_id = idr.tenant_id
    INNER JOIN public.companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
    INNER JOIN public.intake_client_projects p ON p.id = idr.project_id AND p.tenant_id = idr.tenant_id
    WHERE idr.reviewer_role = 'client'
      AND idr.tenant_id = $1
      AND c.account_manager_field_agent_id = $2
      AND idr.created_at >= (now() - ($3::int * interval '1 day'))
    ORDER BY idr.created_at DESC NULLS LAST, idr.id DESC
    LIMIT $4
    `,
      [tid, fid, d, lim]
    );
  } catch (e) {
    if (isMissingIntakeDealReviewsRelationError(e)) return [];
    throw e;
  }
  return r.rows;
}

module.exports = {
  getAvgRatingLastDaysForAccountManagerFieldAgent,
  listRecentClientReviewsForAccountManagerFieldAgent,
};
