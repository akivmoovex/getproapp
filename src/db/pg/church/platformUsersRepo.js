"use strict";

/**
 * Platform-wide church admin user directory (HQ + branch admins).
 * Never selects password hashes or reset tokens.
 */

const ACCOUNT_TYPES = ["all", "hq_admin", "branch_admin"];
const ACCOUNT_STATUSES = ["all", "active", "inactive", "suspended"];

function normalizeListOpts(opts = {}) {
  const page = Math.max(Number(opts.page) || 1, 1);
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 50);
  const q = String(opts.q || "").trim().slice(0, 200);
  const accountTypeRaw = String(opts.account_type || opts.type || "all").trim().toLowerCase();
  const account_type = ACCOUNT_TYPES.includes(accountTypeRaw) ? accountTypeRaw : "all";
  const statusRaw = String(opts.status || "all").trim().toLowerCase();
  const status = ACCOUNT_STATUSES.includes(statusRaw) ? statusRaw : "all";
  const organizationId = Number(opts.organization_id || opts.organizationId);
  const branchId = Number(opts.branch_id || opts.branchId);
  const role = String(opts.role || "").trim().slice(0, 64);
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    q,
    account_type,
    status,
    organization_id: Number.isFinite(organizationId) && organizationId > 0 ? organizationId : null,
    branch_id: Number.isFinite(branchId) && branchId > 0 ? branchId : null,
    role,
  };
}

function escapeIlike(q) {
  return `%${String(q).replace(/[%_]/g, "\\$&")}%`;
}

/**
 * @returns {Promise<{ rows: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function listPlatformChurchAdmins(pool, opts = {}) {
  const filters = normalizeListOpts(opts);
  const params = [];
  const hqWhere = ["TRUE"];
  const baWhere = ["TRUE"];

  if (filters.organization_id) {
    params.push(filters.organization_id);
    hqWhere.push(`ha.organization_id = $${params.length}`);
    baWhere.push(`ba.organization_id = $${params.length}`);
  }
  if (filters.branch_id) {
    params.push(filters.branch_id);
    baWhere.push(`ba.branch_id = $${params.length}`);
    // HQ admins have no branch — exclude when branch filter set unless account_type is hq-only (then empty)
    hqWhere.push("FALSE");
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    hqWhere.push(`ha.status = $${params.length}`);
    baWhere.push(`ba.status = $${params.length}`);
  }
  if (filters.role) {
    params.push(filters.role);
    hqWhere.push(`ha.role = $${params.length}`);
    baWhere.push(`ba.role = $${params.length}`);
  }
  if (filters.q) {
    params.push(escapeIlike(filters.q));
    const p = `$${params.length}`;
    hqWhere.push(
      `(ha.full_name ILIKE ${p} OR ha.email ILIKE ${p} OR COALESCE(ha.phone, '') ILIKE ${p} OR o.name ILIKE ${p})`
    );
    baWhere.push(
      `(ba.full_name ILIKE ${p} OR ba.email ILIKE ${p} OR COALESCE(ba.phone, '') ILIKE ${p} OR o2.name ILIKE ${p} OR b.name ILIKE ${p})`
    );
  }

  const includeHq = filters.account_type === "all" || filters.account_type === "hq_admin";
  const includeBa = filters.account_type === "all" || filters.account_type === "branch_admin";

  const hqSelect = `
    SELECT
      'hq_admin'::text AS account_type,
      ha.id,
      ha.full_name,
      ha.email,
      ha.phone,
      ha.role,
      ha.status,
      ha.organization_id,
      o.name AS organization_name,
      NULL::bigint AS branch_id,
      NULL::text AS branch_name,
      ha.created_at,
      ha.updated_at
    FROM public.church_hq_admins ha
    INNER JOIN public.church_organizations o ON o.id = ha.organization_id
    WHERE ${hqWhere.join(" AND ")}
  `;

  const baSelect = `
    SELECT
      'branch_admin'::text AS account_type,
      ba.id,
      ba.full_name,
      ba.email,
      ba.phone,
      ba.role,
      ba.status,
      ba.organization_id,
      o2.name AS organization_name,
      ba.branch_id,
      b.name AS branch_name,
      ba.created_at,
      ba.updated_at
    FROM public.church_branch_admins ba
    INNER JOIN public.church_organizations o2 ON o2.id = ba.organization_id
    INNER JOIN public.church_branches b ON b.id = ba.branch_id
    WHERE ${baWhere.join(" AND ")}
  `;

  const parts = [];
  if (includeHq) parts.push(hqSelect);
  if (includeBa) parts.push(baSelect);
  if (!parts.length) {
    return { rows: [], total: 0, page: filters.page, limit: filters.limit, totalPages: 1 };
  }

  const unionSql = parts.join("\n UNION ALL \n");
  const countR = await pool.query(`SELECT COUNT(*)::int AS total FROM (${unionSql}) u`, params);
  const total = countR.rows[0] ? countR.rows[0].total : 0;
  const totalPages = Math.max(Math.ceil(total / filters.limit) || 1, 1);
  const page = Math.min(filters.page, totalPages);
  const offset = (page - 1) * filters.limit;

  params.push(filters.limit, offset);
  const r = await pool.query(
    `SELECT * FROM (${unionSql}) u
     ORDER BY u.created_at DESC NULLS LAST, u.account_type ASC, u.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    rows: r.rows,
    total,
    page,
    limit: filters.limit,
    totalPages,
    filters: { ...filters, page, offset },
  };
}

async function countAdminsByRole(pool) {
  const [hq, ba] = await Promise.all([
    pool.query(
      `SELECT role, COUNT(*)::int AS count
       FROM public.church_hq_admins
       WHERE status = 'active'
       GROUP BY role`
    ),
    pool.query(
      `SELECT role, COUNT(*)::int AS count
       FROM public.church_branch_admins
       WHERE status = 'active'
       GROUP BY role`
    ),
  ]);
  const map = {};
  for (const row of hq.rows) map[`hq:${row.role}`] = row.count;
  for (const row of ba.rows) map[`branch:${row.role}`] = row.count;
  return map;
}

module.exports = {
  listPlatformChurchAdmins,
  countAdminsByRole,
  normalizeListOpts,
  ACCOUNT_TYPES,
  ACCOUNT_STATUSES,
};
