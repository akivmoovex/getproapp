"use strict";

/**
 * Read-only EC_Commission (30d) base: distinct intake_client_projects in the window where at least one
 * assignment exists to a company whose account_manager_field_agent_id matches the field agent.
 * Value field: p.deal_price (NULL / non-positive excluded). Window: p.created_at.
 */

/**
 * Sum deal_price once per distinct qualifying project.
 *
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} fieldAgentId
 * @param {number} [days=30]
 * @returns {Promise<number>}
 */
async function sumDistinctDealPriceProjectCreatedLastDaysForAccountManagerFieldAgent(
  pool,
  tenantId,
  fieldAgentId,
  days = 30
) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  const d = Math.min(Math.max(Math.floor(Number(days) || 30), 1), 366);
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
        AND p.created_at >= (now() - ($3::int * interval '1 day'))
        AND p.deal_price IS NOT NULL
        AND p.deal_price::double precision > 0
    ) sub
    `,
    [tid, fid, d]
  );
  const v = r.rows[0] && r.rows[0].s;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
}

/**
 * Distinct qualifying projects (drill-down / API).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} fieldAgentId
 * @param {number} [days=30]
 */
async function listDistinctEcCommissionProjectsForAccountManagerFieldAgent(pool, tenantId, fieldAgentId, days = 30) {
  const tid = Number(tenantId);
  const fid = Number(fieldAgentId);
  const d = Math.min(Math.max(Math.floor(Number(days) || 30), 1), 366);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(fid) || fid < 1) return [];
  const r = await pool.query(
    `
    SELECT
      p.id AS project_id,
      p.project_code,
      p.deal_price::double precision AS deal_price,
      p.created_at,
      COUNT(a.id)::int AS assignment_count
    FROM public.intake_client_projects p
    INNER JOIN public.intake_project_assignments a
      ON a.project_id = p.id AND a.tenant_id = p.tenant_id
    INNER JOIN public.companies c
      ON c.id = a.company_id AND c.tenant_id = a.tenant_id
    WHERE p.tenant_id = $1
      AND c.account_manager_field_agent_id = $2
      AND p.created_at >= (now() - ($3::int * interval '1 day'))
      AND p.deal_price IS NOT NULL
      AND p.deal_price::double precision > 0
    GROUP BY p.id, p.project_code, p.deal_price, p.created_at
    ORDER BY p.created_at DESC NULLS LAST, p.id DESC
    `,
    [tid, fid, d]
  );
  return r.rows;
}

module.exports = {
  sumDistinctDealPriceProjectCreatedLastDaysForAccountManagerFieldAgent,
  listDistinctEcCommissionProjectsForAccountManagerFieldAgent,
};
