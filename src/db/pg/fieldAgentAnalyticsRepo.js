"use strict";
const faAnalyticsObs = require("../../lib/fieldAgentAnalyticsObservability");

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
async function listFieldAgentsForTenant(pool, tenantId, opts) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const obs = opts && opts._obs ? opts._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentAnalytics.listFieldAgentsForTenant" }, () =>
    pool.query(
      `
    SELECT id, username, display_name
    FROM public.field_agents
    WHERE tenant_id = $1
    ORDER BY lower(username) ASC
    `,
      [tid]
    )
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

/**
 * Drill-down list rows for submission-backed KPI cards (FIFO).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{
 *   fieldAgentId?: number|null,
 *   from?: string|null,
 *   to?: string|null,
 *   status?: string|null,
 *   decidedOnly?: boolean,
 *   q?: string|null,
 *   limit?: number
 * }} [opts]
 */
async function listSubmissionDrilldownRows(pool, tenantId, opts) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const agentId =
    opts && opts.fieldAgentId != null && Number(opts.fieldAgentId) > 0 ? Number(opts.fieldAgentId) : null;
  const { from, to } = normalizeDateRange(opts && opts.from, opts && opts.to);
  const status = opts && opts.status != null && String(opts.status).trim() !== "" ? String(opts.status).trim() : null;
  const decidedOnly = Boolean(opts && opts.decidedOnly);
  const qRaw = opts && opts.q != null ? String(opts.q).trim() : "";
  const q = qRaw ? `%${qRaw}%` : null;
  const limit = Math.min(Math.max(Number((opts && opts.limit) || 200), 1), 500);
  const offset = Math.max(Number((opts && opts.offset) || 0), 0);
  const where = ["s.tenant_id = $1"];
  const params = [tid];
  let i = 2;
  if (agentId != null) {
    where.push(`s.field_agent_id = $${i++}`);
    params.push(agentId);
  }
  if (status != null) {
    where.push(`s.status = $${i++}`);
    params.push(status);
  }
  if (decidedOnly) {
    where.push("s.status IN ('approved', 'rejected')");
  }
  if (from != null) {
    where.push(`s.created_at >= $${i++}`);
    params.push(from);
  }
  if (to != null) {
    where.push(`s.created_at <= $${i++}`);
    params.push(to);
  }
  if (q != null) {
    where.push(`(
      concat_ws(' ', s.first_name, s.last_name) ILIKE $${i}
      OR s.phone_raw ILIKE $${i}
      OR s.whatsapp_raw ILIKE $${i}
      OR s.profession ILIKE $${i}
      OR s.city ILIKE $${i}
      OR s.pacra ILIKE $${i}
    )`);
    params.push(q);
    i += 1;
  }
  params.push(limit);
  const limitIdx = i++;
  params.push(offset);
  const offsetIdx = i++;
  const obs = opts && opts._obs ? opts._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentAnalytics.listSubmissionDrilldownRows" }, () =>
    pool.query(
      `
    SELECT
      s.id,
      s.created_at,
      s.updated_at,
      s.status,
      s.first_name,
      s.last_name,
      s.profession,
      s.city,
      s.phone_raw,
      s.whatsapp_raw,
      s.commission_amount,
      s.rejection_reason,
      fa.username AS field_agent_username,
      fa.display_name AS field_agent_display_name
    FROM public.field_agent_provider_submissions s
    INNER JOIN public.field_agents fa ON fa.id = s.field_agent_id AND fa.tenant_id = s.tenant_id
    WHERE ${where.join(" AND ")}
    ORDER BY s.created_at ASC, s.id ASC
    LIMIT $${limitIdx}
    OFFSET $${offsetIdx}
    `,
      params
    )
  );
  return r.rows;
}

/**
 * Count rows for submission drill-down filters.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ fieldAgentId?: number|null, from?: string|null, to?: string|null, status?: string|null, decidedOnly?: boolean, q?: string|null }} [opts]
 */
async function countSubmissionDrilldownRows(pool, tenantId, opts) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return 0;
  const agentId =
    opts && opts.fieldAgentId != null && Number(opts.fieldAgentId) > 0 ? Number(opts.fieldAgentId) : null;
  const { from, to } = normalizeDateRange(opts && opts.from, opts && opts.to);
  const status = opts && opts.status != null && String(opts.status).trim() !== "" ? String(opts.status).trim() : null;
  const decidedOnly = Boolean(opts && opts.decidedOnly);
  const qRaw = opts && opts.q != null ? String(opts.q).trim() : "";
  const q = qRaw ? `%${qRaw}%` : null;
  const where = ["s.tenant_id = $1"];
  const params = [tid];
  let i = 2;
  if (agentId != null) {
    where.push(`s.field_agent_id = $${i++}`);
    params.push(agentId);
  }
  if (status != null) {
    where.push(`s.status = $${i++}`);
    params.push(status);
  }
  if (decidedOnly) {
    where.push("s.status IN ('approved', 'rejected')");
  }
  if (from != null) {
    where.push(`s.created_at >= $${i++}`);
    params.push(from);
  }
  if (to != null) {
    where.push(`s.created_at <= $${i++}`);
    params.push(to);
  }
  if (q != null) {
    where.push(`(
      concat_ws(' ', s.first_name, s.last_name) ILIKE $${i}
      OR s.phone_raw ILIKE $${i}
      OR s.whatsapp_raw ILIKE $${i}
      OR s.profession ILIKE $${i}
      OR s.city ILIKE $${i}
      OR s.pacra ILIKE $${i}
    )`);
    params.push(q);
    i += 1;
  }
  const obs = opts && opts._obs ? opts._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentAnalytics.countSubmissionDrilldownRows" }, () =>
    pool.query(
      `
    SELECT COUNT(*)::int AS c
    FROM public.field_agent_provider_submissions s
    WHERE ${where.join(" AND ")}
    `,
      params
    )
  );
  return Number(r.rows[0] && r.rows[0].c) || 0;
}

/**
 * Drill-down list rows for callback-lead KPI card (FIFO).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{
 *   fieldAgentId?: number|null,
 *   from?: string|null,
 *   to?: string|null,
 *   q?: string|null,
 *   limit?: number
 * }} [opts]
 */
async function listCallbackLeadDrilldownRows(pool, tenantId, opts) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const agentId =
    opts && opts.fieldAgentId != null && Number(opts.fieldAgentId) > 0 ? Number(opts.fieldAgentId) : null;
  const { from, to } = normalizeDateRange(opts && opts.from, opts && opts.to);
  const qRaw = opts && opts.q != null ? String(opts.q).trim() : "";
  const q = qRaw ? `%${qRaw}%` : null;
  const limit = Math.min(Math.max(Number((opts && opts.limit) || 200), 1), 500);
  const offset = Math.max(Number((opts && opts.offset) || 0), 0);
  const where = ["c.tenant_id = $1"];
  const params = [tid];
  let i = 2;
  if (agentId != null) {
    where.push(`c.field_agent_id = $${i++}`);
    params.push(agentId);
  }
  if (from != null) {
    where.push(`c.created_at >= $${i++}`);
    params.push(from);
  }
  if (to != null) {
    where.push(`c.created_at <= $${i++}`);
    params.push(to);
  }
  if (q != null) {
    where.push(`(
      concat_ws(' ', c.first_name, c.last_name) ILIKE $${i}
      OR c.phone ILIKE $${i}
      OR c.email ILIKE $${i}
      OR c.location_city ILIKE $${i}
    )`);
    params.push(q);
    i += 1;
  }
  params.push(limit);
  const limitIdx = i++;
  params.push(offset);
  const offsetIdx = i++;
  const obs = opts && opts._obs ? opts._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentAnalytics.listCallbackLeadDrilldownRows" }, () =>
    pool.query(
      `
    SELECT
      c.id,
      c.created_at,
      c.first_name,
      c.last_name,
      c.phone,
      c.email,
      c.location_city,
      fa.username AS field_agent_username,
      fa.display_name AS field_agent_display_name
    FROM public.field_agent_callback_leads c
    INNER JOIN public.field_agents fa ON fa.id = c.field_agent_id AND fa.tenant_id = c.tenant_id
    WHERE ${where.join(" AND ")}
    ORDER BY c.created_at ASC, c.id ASC
    LIMIT $${limitIdx}
    OFFSET $${offsetIdx}
    `,
      params
    )
  );
  return r.rows;
}

/**
 * Count rows for callback-lead drill-down filters.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ fieldAgentId?: number|null, from?: string|null, to?: string|null, q?: string|null }} [opts]
 */
async function countCallbackLeadDrilldownRows(pool, tenantId, opts) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return 0;
  const agentId =
    opts && opts.fieldAgentId != null && Number(opts.fieldAgentId) > 0 ? Number(opts.fieldAgentId) : null;
  const { from, to } = normalizeDateRange(opts && opts.from, opts && opts.to);
  const qRaw = opts && opts.q != null ? String(opts.q).trim() : "";
  const q = qRaw ? `%${qRaw}%` : null;
  const where = ["c.tenant_id = $1"];
  const params = [tid];
  let i = 2;
  if (agentId != null) {
    where.push(`c.field_agent_id = $${i++}`);
    params.push(agentId);
  }
  if (from != null) {
    where.push(`c.created_at >= $${i++}`);
    params.push(from);
  }
  if (to != null) {
    where.push(`c.created_at <= $${i++}`);
    params.push(to);
  }
  if (q != null) {
    where.push(`(
      concat_ws(' ', c.first_name, c.last_name) ILIKE $${i}
      OR c.phone ILIKE $${i}
      OR c.email ILIKE $${i}
      OR c.location_city ILIKE $${i}
    )`);
    params.push(q);
    i += 1;
  }
  const obs = opts && opts._obs ? opts._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentAnalytics.countCallbackLeadDrilldownRows" }, () =>
    pool.query(
      `
    SELECT COUNT(*)::int AS c
    FROM public.field_agent_callback_leads c
    WHERE ${where.join(" AND ")}
    `,
      params
    )
  );
  return Number(r.rows[0] && r.rows[0].c) || 0;
}

/**
 * Tenant-scoped submission detail for analytics drill-down panel.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} submissionId
 */
async function getSubmissionDrilldownDetailById(pool, tenantId, submissionId, obs) {
  const tid = Number(tenantId);
  const sid = Number(submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentAnalytics.getSubmissionDrilldownDetailById" }, () =>
    pool.query(
      `
    SELECT
      s.id,
      s.created_at,
      s.updated_at,
      s.status,
      s.first_name,
      s.last_name,
      s.profession,
      s.city,
      s.phone_raw,
      s.whatsapp_raw,
      s.pacra,
      s.address_street,
      s.address_landmarks,
      s.address_neighbourhood,
      s.address_city,
      s.nrc_number,
      s.commission_amount,
      s.rejection_reason,
      s.photo_profile_url,
      s.work_photos_json,
      fa.id AS field_agent_id,
      fa.username AS field_agent_username,
      fa.display_name AS field_agent_display_name
    FROM public.field_agent_provider_submissions s
    INNER JOIN public.field_agents fa ON fa.id = s.field_agent_id AND fa.tenant_id = s.tenant_id
    WHERE s.tenant_id = $1 AND s.id = $2
    LIMIT 1
    `,
      [tid, sid]
    )
  );
  return r.rows[0] || null;
}

/**
 * Tenant-scoped callback lead detail for analytics drill-down panel.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} callbackLeadId
 */
async function getCallbackLeadDrilldownDetailById(pool, tenantId, callbackLeadId, obs) {
  const tid = Number(tenantId);
  const cid = Number(callbackLeadId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(cid) || cid < 1) return null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentAnalytics.getCallbackLeadDrilldownDetailById" }, () =>
    pool.query(
      `
    SELECT
      c.id,
      c.created_at,
      c.first_name,
      c.last_name,
      c.phone,
      c.email,
      c.location_city,
      fa.id AS field_agent_id,
      fa.username AS field_agent_username,
      fa.display_name AS field_agent_display_name
    FROM public.field_agent_callback_leads c
    INNER JOIN public.field_agents fa ON fa.id = c.field_agent_id AND fa.tenant_id = c.tenant_id
    WHERE c.tenant_id = $1 AND c.id = $2
    LIMIT 1
    `,
      [tid, cid]
    )
  );
  return r.rows[0] || null;
}

module.exports = {
  normalizeDateRange,
  listFieldAgentsForTenant,
  getSubmissionSummaryForTenant,
  getPerAgentBreakdown,
  getSubmissionsPerDay,
  getCallbackLeadsPerDay,
  listSubmissionDrilldownRows,
  countSubmissionDrilldownRows,
  listCallbackLeadDrilldownRows,
  countCallbackLeadDrilldownRows,
  getSubmissionDrilldownDetailById,
  getCallbackLeadDrilldownDetailById,
};
