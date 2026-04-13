"use strict";

/**
 * Read-only aggregates: lead fees (deal_price) collected from provider portal when
 * deal_fee_recorded is true, attributed to a field agent via companies.account_manager_field_agent_id.
 */

/**
 * Sum deal_price for assignments where the fee was recorded, for companies whose account manager
 * is the given field agent, within the rolling window (by response/charge time).
 *
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} fieldAgentId
 * @param {number} [days=30]
 * @returns {Promise<number>}
 */
async function sumDealPriceCollectedLastDaysForAccountManagerFieldAgent(pool, tenantId, fieldAgentId, days = 30) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  const d = Math.min(Math.max(Math.floor(Number(days) || 30), 1), 366);
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
      AND COALESCE(a.responded_at, a.updated_at) >= (now() - ($3::int * interval '1 day'))
    `,
    [tid, fid, d]
  );
  const v = r.rows[0] && r.rows[0].s;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
}

/**
 * Optional drill-down: recent charged assignments for reporting (read-only).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} fieldAgentId
 * @param {{ days?: number, limit?: number }} [opts]
 */
async function listDealFeeChargesForAccountManagerFieldAgent(pool, tenantId, fieldAgentId, opts = {}) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  const d = Math.min(Math.max(Math.floor(Number(opts.days != null ? opts.days : 30) || 30), 1), 366);
  const lim = Math.min(Math.max(Math.floor(Number(opts.limit != null ? opts.limit : 50) || 50), 1), 100);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return [];
  const r = await pool.query(
    `
    SELECT
      a.id AS assignment_id,
      a.company_id,
      c.name AS company_name,
      cat.name AS category_name,
      p.id AS project_id,
      p.deal_price::double precision AS deal_price,
      COALESCE(a.responded_at, a.updated_at) AS charged_at,
      c.subdomain,
      c.location
    FROM public.intake_project_assignments a
    INNER JOIN public.intake_client_projects p ON p.id = a.project_id AND p.tenant_id = a.tenant_id
    INNER JOIN public.companies c ON c.id = a.company_id AND c.tenant_id = a.tenant_id
    LEFT JOIN public.categories cat ON cat.id = c.category_id AND cat.tenant_id = c.tenant_id
    WHERE a.tenant_id = $1
      AND c.account_manager_field_agent_id = $2
      AND a.deal_fee_recorded = TRUE
      AND p.deal_price IS NOT NULL
      AND p.deal_price::double precision > 0
      AND COALESCE(a.responded_at, a.updated_at) >= (now() - ($3::int * interval '1 day'))
    ORDER BY COALESCE(a.responded_at, a.updated_at) DESC NULLS LAST, a.id DESC
    LIMIT $4
    `,
    [tid, fid, d, lim]
  );
  return r.rows;
}

module.exports = {
  sumDealPriceCollectedLastDaysForAccountManagerFieldAgent,
  listDealFeeChargesForAccountManagerFieldAgent,
};
