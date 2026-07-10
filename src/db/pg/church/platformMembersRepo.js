"use strict";

/**
 * Platform-wide church member directory (read-only support).
 * Never selects password hashes, reset tokens, or login secrets.
 */

const { normalizePhone } = require("./membersRepo");

const MEMBER_STATUSES = ["all", "pending", "verified", "rejected", "suspended"];

function escapeIlike(q) {
  return `%${String(q).replace(/[%_]/g, "\\$&")}%`;
}

/**
 * Derive display labels from the single church_members.status column.
 * Verification and account are not separate DB fields.
 */
function deriveMemberStatusLabels(status) {
  const s = String(status || "").toLowerCase();
  return {
    membership_status: s || "unknown",
    verification_status:
      s === "verified" ? "verified" : s === "pending" ? "unverified" : s === "rejected" ? "rejected" : "n/a",
    account_status: s === "suspended" ? "suspended" : s === "verified" ? "active" : "inactive",
  };
}

function normalizeListOpts(opts = {}) {
  const page = Math.max(Number(opts.page) || 1, 1);
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const q = String(opts.q || "").trim().slice(0, 200);
  let statusRaw = String(opts.status || "all").trim().toLowerCase();
  if (statusRaw === "inactive") statusRaw = "suspended";
  const status = MEMBER_STATUSES.includes(statusRaw) ? statusRaw : "all";
  const organizationId = Number(opts.organization_id || opts.organizationId);
  const branchId = Number(opts.branch_id || opts.branchId);
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q,
    status,
    organization_id: Number.isFinite(organizationId) && organizationId > 0 ? organizationId : null,
    branch_id: Number.isFinite(branchId) && branchId > 0 ? branchId : null,
  };
}

/**
 * @returns {Promise<{ rows: object[], total: number, page: number, limit: number, totalPages: number, filters: object }>}
 */
async function listPlatformMembers(pool, opts = {}) {
  const filters = normalizeListOpts(opts);
  const params = [];
  const clauses = ["TRUE"];

  if (filters.organization_id) {
    params.push(filters.organization_id);
    clauses.push(`m.organization_id = $${params.length}`);
  }
  if (filters.branch_id) {
    params.push(filters.branch_id);
    clauses.push(`m.branch_id = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    clauses.push(`m.status = $${params.length}`);
  }
  if (filters.q) {
    const pattern = escapeIlike(filters.q);
    params.push(pattern);
    const p = `$${params.length}`;
    const matchParts = [
      `m.full_name ILIKE ${p}`,
      `COALESCE(m.email, '') ILIKE ${p}`,
      `COALESCE(m.phone, '') ILIKE ${p}`,
      `o.name ILIKE ${p}`,
      `b.name ILIKE ${p}`,
      `COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) ILIKE ${p}`,
    ];
    const phoneNorm = normalizePhone(filters.q);
    if (phoneNorm) {
      params.push(phoneNorm);
      matchParts.push(`m.phone_normalized = $${params.length}`);
    }
    clauses.push(`(${matchParts.join(" OR ")})`);
  }

  const where = clauses.join(" AND ");
  const fromSql = `
    FROM public.church_members m
    INNER JOIN public.church_organizations o ON o.id = m.organization_id
    INNER JOIN public.church_branches b ON b.id = m.branch_id
    WHERE ${where}
  `;

  const countR = await pool.query(`SELECT COUNT(*)::int AS total ${fromSql}`, params);
  const total = countR.rows[0] ? countR.rows[0].total : 0;
  const totalPages = Math.max(Math.ceil(total / filters.limit) || 1, 1);
  const page = Math.min(filters.page, totalPages);
  const offset = (page - 1) * filters.limit;

  params.push(filters.limit, offset);
  const r = await pool.query(
    `SELECT m.id, m.full_name, m.email, m.phone, m.status, m.created_at, m.updated_at,
            m.organization_id, o.name AS organization_name,
            m.branch_id, b.name AS branch_name,
            COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS host_slug
     ${fromSql}
     ORDER BY m.created_at DESC NULLS LAST, m.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const rows = r.rows.map((row) => {
    const labels = deriveMemberStatusLabels(row.status);
    return {
      id: row.id,
      full_name: row.full_name,
      email: row.email,
      phone: row.phone,
      status: row.status,
      membership_status: labels.membership_status,
      verification_status: labels.verification_status,
      account_status: labels.account_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      organization_id: row.organization_id,
      organization_name: row.organization_name,
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      host_slug: row.host_slug,
      link: `/admin/church/members/${row.id}`,
    };
  });

  return {
    rows,
    total,
    page,
    limit: filters.limit,
    totalPages,
    filters: { ...filters, page, offset },
  };
}

/**
 * Validate that organization_id / branch_id exist and are consistent.
 * @returns {Promise<{ ok: true, organization_id: number|null, branch_id: number|null } | { ok: false, error: string }>}
 */
async function validateMemberDirectoryFilters(pool, opts = {}) {
  const filters = normalizeListOpts(opts);
  let organizationId = filters.organization_id;
  let branchId = filters.branch_id;

  if (organizationId) {
    const org = await pool.query(`SELECT id FROM public.church_organizations WHERE id = $1 LIMIT 1`, [
      organizationId,
    ]);
    if (!org.rows[0]) {
      return { ok: false, error: "Invalid organization filter." };
    }
  }

  if (branchId) {
    const br = await pool.query(
      `SELECT id, organization_id FROM public.church_branches WHERE id = $1 LIMIT 1`,
      [branchId]
    );
    if (!br.rows[0]) {
      return { ok: false, error: "Invalid branch filter." };
    }
    if (organizationId && Number(br.rows[0].organization_id) !== Number(organizationId)) {
      return { ok: false, error: "Branch does not belong to the selected organization." };
    }
    if (!organizationId) {
      organizationId = Number(br.rows[0].organization_id);
    }
  }

  return { ok: true, organization_id: organizationId, branch_id: branchId };
}

module.exports = {
  listPlatformMembers,
  normalizeListOpts,
  deriveMemberStatusLabels,
  validateMemberDirectoryFilters,
  MEMBER_STATUSES,
};
