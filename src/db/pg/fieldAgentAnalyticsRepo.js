"use strict";

/**
 * Read-only aggregates for Field Agent reporting (tenant-scoped).
 * Source of truth: field_agents, field_agent_provider_submissions, field_agent_callback_leads only.
 */

/**
 * @param {string|Date|null|undefined} from
 * @param {string|Date|null|undefined} to
 * @returns {{ from: Date|null, to: Date|null }}
 */
function normalizeDateRange(from, to) {
  let f = null;
  let t = null;
  if (from != null && String(from).trim() !== "") {
    const d = new Date(String(from));
    if (!Number.isNaN(d.getTime())) {
      d.setUTCHours(0, 0, 0, 0);
      f = d;
    }
  }
  if (to != null && String(to).trim() !== "") {
    const d = new Date(String(to));
    if (!Number.isNaN(d.getTime())) {
      d.setUTCHours(23, 59, 59, 999);
      t = d;
    }
  }
  return { from: f, to: t };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 */
async function listFieldAgentsForTenant(pool, tenantId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const r = await pool.query(
    `
    SELECT id, username, display_name
    FROM public.field_agents
    WHERE tenant_id = $1
    ORDER BY lower(username) ASC
    `,
    [tid]
  );
  return r.rows.map((row) => ({
    id: Number(row.id),
    username: row.username,
    display_name: row.display_name || "",
  }));
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ fieldAgentId?: number|null, from?: string|null, to?: string|null }} [opts]
 */
async function getSubmissionSummaryForTenant(pool, tenantId, opts) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return {
      total: 0,
      pending: 0,
      info_needed: 0,
      approved: 0,
      rejected: 0,
      appealed: 0,
      total_commission: 0,
      avg_commission: 0,
      callback_leads: 0,
    };
  }
  const agentId =
    opts && opts.fieldAgentId != null && Number(opts.fieldAgentId) > 0 ? Number(opts.fieldAgentId) : null;
  const { from, to } = normalizeDateRange(opts && opts.from, opts && opts.to);

  const sub = await pool.query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE s.status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE s.status = 'info_needed')::int AS info_needed,
      COUNT(*) FILTER (WHERE s.status = 'approved')::int AS approved,
      COUNT(*) FILTER (WHERE s.status = 'rejected')::int AS rejected,
      COUNT(*) FILTER (WHERE s.status = 'appealed')::int AS appealed,
      COALESCE(SUM(s.commission_amount) FILTER (WHERE s.status = 'approved'), 0)::numeric AS total_commission,
      COALESCE(AVG(s.commission_amount) FILTER (WHERE s.status = 'approved'), 0)::numeric AS avg_commission
    FROM public.field_agent_provider_submissions s
    WHERE s.tenant_id = $1
      AND ($2::int IS NULL OR s.field_agent_id = $2)
      AND ($3::timestamptz IS NULL OR s.created_at >= $3)
      AND ($4::timestamptz IS NULL OR s.created_at <= $4)
    `,
    [tid, agentId, from, to]
  );

  const cb = await pool.query(
    `
    SELECT COUNT(*)::int AS c
    FROM public.field_agent_callback_leads c
    WHERE c.tenant_id = $1
      AND ($2::int IS NULL OR c.field_agent_id = $2)
      AND ($3::timestamptz IS NULL OR c.created_at >= $3)
      AND ($4::timestamptz IS NULL OR c.created_at <= $4)
    `,
    [tid, agentId, from, to]
  );

  const row = sub.rows[0];
  return {
    total: Number(row.total) || 0,
    pending: Number(row.pending) || 0,
    info_needed: Number(row.info_needed) || 0,
    approved: Number(row.approved) || 0,
    rejected: Number(row.rejected) || 0,
    appealed: Number(row.appealed) || 0,
    total_commission: Number(row.total_commission) || 0,
    avg_commission: Number(row.avg_commission) || 0,
    callback_leads: Number(cb.rows[0].c) || 0,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ from?: string|null, to?: string|null }} [opts]
 * @returns {Promise<Array<{ field_agent_id: number, username: string, display_name: string, total: number, pending: number, approved: number, rejected: number, total_commission: number, avg_commission: number, callback_leads: number }>>}
 */
async function getPerAgentBreakdown(pool, tenantId, opts) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const { from, to } = normalizeDateRange(opts && opts.from, opts && opts.to);

  const r = await pool.query(
    `
    SELECT
      fa.id AS field_agent_id,
      fa.username,
      fa.display_name,
      COUNT(s.id)::int AS total,
      COUNT(s.id) FILTER (WHERE s.status = 'pending')::int AS pending,
      COUNT(s.id) FILTER (WHERE s.status = 'info_needed')::int AS info_needed,
      COUNT(s.id) FILTER (WHERE s.status = 'approved')::int AS approved,
      COUNT(s.id) FILTER (WHERE s.status = 'rejected')::int AS rejected,
      COUNT(s.id) FILTER (WHERE s.status = 'appealed')::int AS appealed,
      COALESCE(SUM(s.commission_amount) FILTER (WHERE s.status = 'approved'), 0)::numeric AS total_commission,
      COALESCE(AVG(s.commission_amount) FILTER (WHERE s.status = 'approved'), 0)::numeric AS avg_commission
    FROM public.field_agents fa
    LEFT JOIN public.field_agent_provider_submissions s
      ON s.field_agent_id = fa.id AND s.tenant_id = fa.tenant_id
      AND ($2::timestamptz IS NULL OR s.created_at >= $2)
      AND ($3::timestamptz IS NULL OR s.created_at <= $3)
    WHERE fa.tenant_id = $1
    GROUP BY fa.id, fa.username, fa.display_name
    ORDER BY lower(fa.username) ASC
    `,
    [tid, from, to]
  );

  const cbRows = await pool.query(
    `
    SELECT field_agent_id, COUNT(*)::int AS c
    FROM public.field_agent_callback_leads
    WHERE tenant_id = $1
      AND ($2::timestamptz IS NULL OR created_at >= $2)
      AND ($3::timestamptz IS NULL OR created_at <= $3)
    GROUP BY field_agent_id
    `,
    [tid, from, to]
  );
  const cbByAgent = Object.fromEntries(cbRows.rows.map((x) => [Number(x.field_agent_id), Number(x.c)]));

  return r.rows.map((row) => {
    const id = Number(row.field_agent_id);
    const approved = Number(row.approved) || 0;
    const rejected = Number(row.rejected) || 0;
    const total = Number(row.total) || 0;
    const decided = approved + rejected;
    return {
      field_agent_id: id,
      username: row.username,
      display_name: row.display_name || "",
      total,
      pending: Number(row.pending) || 0,
      info_needed: Number(row.info_needed) || 0,
      approved,
      rejected,
      appealed: Number(row.appealed) || 0,
      total_commission: Number(row.total_commission) || 0,
      avg_commission: Number(row.avg_commission) || 0,
      callback_leads: cbByAgent[id] || 0,
      approval_rate_decided: decided > 0 ? approved / decided : null,
      approval_rate_total: total > 0 ? approved / total : null,
    };
  });
}

/**
 * Submissions created per calendar day (UTC bucket), last `days` days.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} days
 * @param {number|null} [fieldAgentId]
 */
async function getSubmissionsPerDay(pool, tenantId, days, fieldAgentId) {
  const tid = Number(tenantId);
  const d = Math.min(Math.max(Number(days) || 30, 1), 366);
  const aid = fieldAgentId != null && Number(fieldAgentId) > 0 ? Number(fieldAgentId) : null;
  if (!Number.isFinite(tid) || tid < 1) return [];
  const r = await pool.query(
    `
    SELECT
      (s.created_at AT TIME ZONE 'UTC')::date AS day,
      COUNT(*)::int AS c
    FROM public.field_agent_provider_submissions s
    WHERE s.tenant_id = $1
      AND s.created_at >= now() - ($2::int * interval '1 day')
      AND ($3::int IS NULL OR s.field_agent_id = $3)
    GROUP BY 1
    ORDER BY 1 ASC
    `,
    [tid, d, aid]
  );
  return r.rows.map((row) => ({ day: String(row.day), count: Number(row.c) || 0 }));
}

/**
 * Callback leads created per calendar day (UTC), last `days` days.
 */
async function getCallbackLeadsPerDay(pool, tenantId, days, fieldAgentId) {
  const tid = Number(tenantId);
  const d = Math.min(Math.max(Number(days) || 30, 1), 366);
  const aid = fieldAgentId != null && Number(fieldAgentId) > 0 ? Number(fieldAgentId) : null;
  if (!Number.isFinite(tid) || tid < 1) return [];
  const r = await pool.query(
    `
    SELECT
      (c.created_at AT TIME ZONE 'UTC')::date AS day,
      COUNT(*)::int AS c
    FROM public.field_agent_callback_leads c
    WHERE c.tenant_id = $1
      AND c.created_at >= now() - ($2::int * interval '1 day')
      AND ($3::int IS NULL OR c.field_agent_id = $3)
    GROUP BY 1
    ORDER BY 1 ASC
    `,
    [tid, d, aid]
  );
  return r.rows.map((row) => ({ day: String(row.day), count: Number(row.c) || 0 }));
}

module.exports = {
  normalizeDateRange,
  listFieldAgentsForTenant,
  getSubmissionSummaryForTenant,
  getPerAgentBreakdown,
  getSubmissionsPerDay,
  getCallbackLeadsPerDay,
};
