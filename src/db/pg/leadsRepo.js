"use strict";

const { mapAdminCompanyLeadRow } = require("../../crm/leadCompanyRequestViewModel");

/**
 * PostgreSQL access for public.leads and public.lead_comments.
 */

function serializeLeadLike(row) {
  if (!row) return row;
  const out = { ...row };
  for (const k of ["created_at", "updated_at"]) {
    if (out[k] instanceof Date) {
      out[k] = out[k].toISOString().replace("T", " ").slice(0, 19);
    }
  }
  return out;
}

function serializeCommentRow(row) {
  if (!row) return row;
  const out = { ...row };
  if (out.created_at instanceof Date) {
    out.created_at = out.created_at.toISOString().replace("T", " ").slice(0, 19);
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<number>}
 */
async function countByTenantId(pool, tenantId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.leads WHERE tenant_id = $1`,
    [tenantId]
  );
  return Number(r.rows[0].c);
}

/**
 * Dashboard: GROUP BY status (same merge path as SQLite admin dashboard).
 * @returns {Promise<{ status: string, c: number }[]>}
 */
async function countGroupedByStatus(pool, tenantId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS c FROM public.leads WHERE tenant_id = $1 GROUP BY status`,
    [tenantId]
  );
  return r.rows;
}

/**
 * Leads per calendar day (UTC), inclusive range, for dashboard sparkline.
 * Keys are `YYYY-MM-DD` strings.
 * @param {string} startDateStr
 * @param {string} endDateStr
 */
async function countByCreatedUtcDateInRange(pool, tenantId, startDateStr, endDateStr) {
  const r = await pool.query(
    `SELECT (created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int AS c
     FROM public.leads
     WHERE tenant_id = $1
       AND (created_at AT TIME ZONE 'UTC')::date >= $2::date
       AND (created_at AT TIME ZONE 'UTC')::date <= $3::date
     GROUP BY (created_at AT TIME ZONE 'UTC')::date`,
    [tenantId, startDateStr, endDateStr]
  );
  const map = {};
  for (const row of r.rows) {
    let key;
    if (row.day instanceof Date) {
      key = row.day.toISOString().slice(0, 10);
    } else {
      key = String(row.day).slice(0, 10);
    }
    map[key] = Number(row.c);
  }
  return map;
}

const ADMIN_LEADS_SELECT = `
  l.id, l.company_id, l.name, l.phone, l.email, l.message, l.status,
  l.created_at, l.updated_at,
  c.name AS company_name, c.subdomain AS company_subdomain
`;

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} limit
 */
async function listForAdminByTenant(pool, tenantId, limit = 200) {
  const r = await pool.query(
    `
    SELECT ${ADMIN_LEADS_SELECT}
    FROM public.leads l
    INNER JOIN public.companies c ON c.id = l.company_id AND c.tenant_id = l.tenant_id
    WHERE l.tenant_id = $1
    ORDER BY l.created_at DESC
    LIMIT $2
    `,
    [tenantId, limit]
  );
  return r.rows.map((row) => mapAdminCompanyLeadRow(serializeLeadLike(row))).filter(Boolean);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} companyId
 * @param {number} tenantId
 */
async function listForAdminByCompany(pool, companyId, tenantId) {
  const r = await pool.query(
    `
    SELECT ${ADMIN_LEADS_SELECT}
    FROM public.leads l
    INNER JOIN public.companies c ON c.id = l.company_id AND c.tenant_id = l.tenant_id
    WHERE l.company_id = $1 AND l.tenant_id = $2 AND c.tenant_id = $2
    ORDER BY l.created_at DESC
    `,
    [companyId, tenantId]
  );
  return r.rows.map((row) => mapAdminCompanyLeadRow(serializeLeadLike(row))).filter(Boolean);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leadId
 * @param {number} tenantId
 */
async function getForAdminById(pool, leadId, tenantId) {
  const r = await pool.query(
    `
    SELECT ${ADMIN_LEADS_SELECT}
    FROM public.leads l
    INNER JOIN public.companies c ON c.id = l.company_id AND c.tenant_id = l.tenant_id
    WHERE l.id = $1 AND l.tenant_id = $2 AND c.tenant_id = $2
    `,
    [leadId, tenantId]
  );
  const row = r.rows[0];
  return row ? mapAdminCompanyLeadRow(serializeLeadLike(row)) : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leadId
 */
async function listCommentsByLeadId(pool, leadId) {
  const r = await pool.query(
    `SELECT id, body, created_at FROM public.lead_comments WHERE lead_id = $1 ORDER BY created_at ASC, id ASC`,
    [leadId]
  );
  return r.rows.map(serializeCommentRow);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leadId
 * @param {number} tenantId
 */
async function existsByIdAndTenantId(pool, leadId, tenantId) {
  const r = await pool.query(
    `SELECT 1 FROM public.leads WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [leadId, tenantId]
  );
  return r.rows.length > 0;
}

/**
 * Update lead status and optionally append a comment (same transaction as SQLite admin).
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, leadId: number, status: string, comment: string }} p
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function updateStatusWithOptionalComment(pool, { tenantId, leadId, status, comment }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const u = await client.query(
      `UPDATE public.leads SET status = $1, updated_at = now() WHERE id = $2 AND tenant_id = $3`,
      [status, leadId, tenantId]
    );
    if (u.rowCount === 0) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }
    const c = String(comment || "").trim();
    if (c) {
      await client.query(`INSERT INTO public.lead_comments (lead_id, body) VALUES ($1, $2)`, [
        leadId,
        c.slice(0, 4000),
      ]);
    }
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Delete all leads for a company (before deleting the company). Removes lead_comments via FK CASCADE.
 * @param {import("pg").Pool} pool
 * @param {number} companyId
 * @param {number} tenantId
 */
async function deleteByCompanyIdAndTenantId(pool, companyId, tenantId) {
  await pool.query(`DELETE FROM public.leads WHERE company_id = $1 AND tenant_id = $2`, [companyId, tenantId]);
}

/**
 * Public API: contact form lead (same semantics as SQLite `POST /api/leads`).
 * @param {import("pg").Pool} pool
 * @param {{ companyId: number, tenantId: number, name: string, phone: string, email: string, message: string }} p
 * @returns {Promise<number>} new lead id
 */
async function insertPublicLead(pool, { companyId, tenantId, name, phone, email, message }) {
  const r = await pool.query(
    `
    INSERT INTO public.leads (company_id, tenant_id, name, phone, email, message, status)
    VALUES ($1, $2, $3, $4, $5, $6, 'open')
    RETURNING id
    `,
    [
      companyId,
      tenantId,
      String(name).slice(0, 120),
      String(phone).slice(0, 30),
      String(email).slice(0, 120),
      String(message).slice(0, 2000),
    ]
  );
  return Number(r.rows[0].id);
}

module.exports = {
  countByTenantId,
  countGroupedByStatus,
  countByCreatedUtcDateInRange,
  listForAdminByTenant,
  listForAdminByCompany,
  getForAdminById,
  listCommentsByLeadId,
  existsByIdAndTenantId,
  updateStatusWithOptionalComment,
  deleteByCompanyIdAndTenantId,
  insertPublicLead,
};
