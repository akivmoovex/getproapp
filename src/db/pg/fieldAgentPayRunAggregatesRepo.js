"use strict";

/**
 * Explicit calendar-period aggregates for admin pay-run preview (not rolling 30d).
 * Mirrors dashboard sources: lead fees (charge time), EC (project created_at), rating (review created_at).
 */

/**
 * Sum deal_price for fee-recorded assignments in [periodStart, periodEnd] inclusive (charge time).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} fieldAgentId
 * @param {Date|string} periodStart
 * @param {Date|string} periodEnd
 */
async function sumDealPriceCollectedInPeriodForAccountManagerFieldAgent(pool, tenantId, fieldAgentId, periodStart, periodEnd) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return 0;
  const r = await pool.query(
    `
    SELECT COALESCE(SUM(p.deal_price::double precision), 0)::numeric AS s
    FROM public.intake_project_assignments a
    INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
    INNER JOIN public.companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
    WHERE a.tenant_id = $1
      AND c.account_manager_field_agent_id = $2
      AND a.deal_fee_recorded = TRUE
      AND p.deal_price IS NOT NULL
      AND p.deal_price::double precision > 0
      AND COALESCE(a.responded_at, a.updated_at) >= $3::timestamptz
      AND COALESCE(a.responded_at, a.updated_at) <= $4::timestamptz
    `,
    [tid, fid, periodStart, periodEnd]
  );
  const v = r.rows[0] && r.rows[0].s;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
}

/**
 * Distinct-project EC base: projects with created_at in period (inclusive).
 */
async function sumDistinctDealPriceProjectCreatedInPeriodForAccountManagerFieldAgent(
  pool,
  tenantId,
  fieldAgentId,
  periodStart,
  periodEnd
) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return 0;
  const r = await pool.query(
    `
    SELECT COALESCE(SUM(sub.deal_price::double precision), 0)::numeric AS s
    FROM (
      SELECT DISTINCT p.id, p.deal_price
      FROM public.intake_client_projects p
      INNER JOIN public.intake_project_assignments a
        ON a.project_id = p.id AND a.tenant_id = p.tenant_id
      INNER JOIN public.companies c
        ON c.id = a.company_id AND c.tenant_id = a.tenant_id
      WHERE p.tenant_id = $1
        AND c.account_manager_field_agent_id = $2
        AND p.created_at >= $3::timestamptz
        AND p.created_at <= $4::timestamptz
        AND p.deal_price IS NOT NULL
        AND p.deal_price::double precision > 0
    ) sub
    `,
    [tid, fid, periodStart, periodEnd]
  );
  const v = r.rows[0] && r.rows[0].s;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
}

/**
 * Average client review rating in period (inclusive), or null if none.
 */
async function getAvgRatingInPeriodForAccountManagerFieldAgent(pool, tenantId, fieldAgentId, periodStart, periodEnd) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
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
      AND idr.created_at >= $3::timestamptz
      AND idr.created_at <= $4::timestamptz
    `,
      [tid, fid, periodStart, periodEnd]
    );
  } catch (e) {
    if (e && e.code === "42P01") return null;
    throw e;
  }
  const v = r.rows[0] && r.rows[0].avg_rating;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  sumDealPriceCollectedInPeriodForAccountManagerFieldAgent,
  sumDistinctDealPriceProjectCreatedInPeriodForAccountManagerFieldAgent,
  getAvgRatingInPeriodForAccountManagerFieldAgent,
};
