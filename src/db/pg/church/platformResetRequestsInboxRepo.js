"use strict";

const { maskLoginIdentifier } = require("../../../church/loginProtection");

const UNIFIED_RESET_BASE_SQL = `
  SELECT
    'member'::text AS request_type,
    r.id AS request_id,
    r.organization_id,
    o.name AS organization_name,
    r.branch_id,
    b.name AS branch_name,
    COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS branch_host_slug,
    r.member_id AS matched_account_id,
    m.full_name AS matched_account_name,
    r.identifier_submitted,
    r.full_name_submitted,
    r.phone_submitted,
    r.email_submitted,
    r.status,
    r.created_at,
    r.updated_at,
    r.resolved_at
  FROM public.church_member_password_reset_requests r
  JOIN public.church_organizations o ON o.id = r.organization_id
  JOIN public.church_branches b ON b.id = r.branch_id
  LEFT JOIN public.church_members m ON m.id = r.member_id

  UNION ALL

  SELECT
    'branch_admin'::text AS request_type,
    r.id AS request_id,
    r.organization_id,
    o.name AS organization_name,
    r.branch_id,
    b.name AS branch_name,
    COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS branch_host_slug,
    r.branch_admin_id AS matched_account_id,
    ba.full_name AS matched_account_name,
    r.identifier_submitted,
    r.full_name_submitted,
    r.phone_submitted,
    r.email_submitted,
    r.status,
    r.created_at,
    r.updated_at,
    r.resolved_at
  FROM public.church_branch_admin_password_reset_requests r
  JOIN public.church_organizations o ON o.id = r.organization_id
  JOIN public.church_branches b ON b.id = r.branch_id
  LEFT JOIN public.church_branch_admins ba ON ba.id = r.branch_admin_id

  UNION ALL

  SELECT
    'hq_admin'::text AS request_type,
    r.id AS request_id,
    r.organization_id,
    o.name AS organization_name,
    r.branch_id,
    b.name AS branch_name,
    COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS branch_host_slug,
    r.hq_admin_id AS matched_account_id,
    ha.full_name AS matched_account_name,
    r.identifier_submitted,
    r.full_name_submitted,
    r.phone_submitted,
    r.email_submitted,
    r.status,
    r.created_at,
    r.updated_at,
    r.resolved_at
  FROM public.church_hq_admin_password_reset_requests r
  JOIN public.church_organizations o ON o.id = r.organization_id
  LEFT JOIN public.church_branches b ON b.id = r.branch_id
  LEFT JOIN public.church_hq_admins ha ON ha.id = r.hq_admin_id
`;

function maskContact(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return maskLoginIdentifier(raw.includes("@") ? raw.toLowerCase() : raw.replace(/\D/g, "").slice(0, 32));
}

function buildDetailUrl(row) {
  if (row.request_type === "member") {
    return `/admin/church/member-password-reset-requests/${row.request_id}`;
  }
  if (row.request_type === "branch_admin") {
    return `/admin/church/branch-admin-password-reset-requests/${row.request_id}`;
  }
  if (row.request_type === "hq_admin") {
    return `/admin/church/hq-admin-password-reset-requests/${row.request_id}`;
  }
  return null;
}

function buildActionMeta(row) {
  if (row.request_type === "member") {
    return {
      action_type: "branch_handled",
      action_label: "View request",
      platform_reset: false,
    };
  }
  return {
    action_type: "platform_detail",
    action_label: "View request",
    platform_reset: true,
  };
}

function mapUnifiedRow(row) {
  const detailUrl = buildDetailUrl(row);
  const action = buildActionMeta(row);
  return {
    request_type: row.request_type,
    request_id: row.request_id,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    branch_host_slug: row.branch_host_slug,
    matched_account_id: row.matched_account_id,
    matched_account_name: row.matched_account_name,
    identifier_masked: maskLoginIdentifier(row.identifier_submitted),
    submitted_name: row.full_name_submitted || null,
    submitted_phone: maskContact(row.phone_submitted),
    submitted_email: maskContact(row.email_submitted),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    detail_url: detailUrl,
    ...action,
  };
}

function buildFilterClause(filters, params) {
  const clauses = [];

  if (filters.request_type && filters.request_type !== "all") {
    params.push(filters.request_type);
    clauses.push(`u.request_type = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    clauses.push(`u.status = $${params.length}`);
  }
  if (filters.organization_id) {
    params.push(filters.organization_id);
    clauses.push(`u.organization_id = $${params.length}`);
  }
  if (filters.branch_id) {
    params.push(filters.branch_id);
    clauses.push(`u.branch_id = $${params.length}`);
  }
  if (filters.date_from) {
    params.push(filters.date_from);
    clauses.push(`u.created_at >= $${params.length}::date`);
  }
  if (filters.date_to) {
    params.push(filters.date_to);
    clauses.push(`u.created_at < ($${params.length}::date + interval '1 day')`);
  }
  if (filters.q) {
    params.push(`%${filters.q}%`);
    const idx = params.length;
    clauses.push(`(
      u.identifier_submitted ILIKE $${idx}
      OR COALESCE(u.full_name_submitted, '') ILIKE $${idx}
      OR COALESCE(u.phone_submitted, '') ILIKE $${idx}
      OR COALESCE(u.email_submitted, '') ILIKE $${idx}
      OR COALESCE(u.organization_name, '') ILIKE $${idx}
      OR COALESCE(u.branch_name, '') ILIKE $${idx}
      OR COALESCE(u.matched_account_name, '') ILIKE $${idx}
    )`);
  }

  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {object} filters
 */
async function listUnifiedResetRequests(pool, filters) {
  const params = [];
  const where = buildFilterClause(filters, params);
  const limit = filters.limit || 50;
  const offset = ((filters.page || 1) - 1) * limit;

  const countSql = `SELECT COUNT(*)::int AS total FROM (${UNIFIED_RESET_BASE_SQL}) u ${where}`;
  const countResult = await pool.query(countSql, params);
  const total = countResult.rows[0]?.total ?? 0;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const listSql = `
    SELECT u.*
    FROM (${UNIFIED_RESET_BASE_SQL}) u
    ${where}
    ORDER BY u.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

  const listResult = await pool.query(listSql, params);
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;

  return {
    items: listResult.rows.map(mapUnifiedRow),
    total,
    page: filters.page || 1,
    limit,
    totalPages,
  };
}

async function countStatusFromTable(pool, tableName) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.${tableName}
     GROUP BY status`
  );
  const counts = { submitted: 0, reviewed: 0, reset_completed: 0, rejected: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = row.count;
    }
  }
  return counts;
}

function mergeStatusCounts(...parts) {
  const merged = { submitted: 0, reviewed: 0, reset_completed: 0, rejected: 0 };
  for (const part of parts) {
    for (const key of Object.keys(merged)) {
      merged[key] += part[key] || 0;
    }
  }
  return merged;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function countUnifiedResetRequestsByStatus(pool) {
  const [member, branchAdmin, hqAdmin] = await Promise.all([
    countStatusFromTable(pool, "church_member_password_reset_requests"),
    countStatusFromTable(pool, "church_branch_admin_password_reset_requests"),
    countStatusFromTable(pool, "church_hq_admin_password_reset_requests"),
  ]);
  return mergeStatusCounts(member, branchAdmin, hqAdmin);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function countUnifiedResetRequestsByType(pool) {
  const [memberR, branchR, hqR] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS count FROM public.church_member_password_reset_requests`),
    pool.query(`SELECT COUNT(*)::int AS count FROM public.church_branch_admin_password_reset_requests`),
    pool.query(`SELECT COUNT(*)::int AS count FROM public.church_hq_admin_password_reset_requests`),
  ]);
  return {
    member: memberR.rows[0]?.count ?? 0,
    branch_admin: branchR.rows[0]?.count ?? 0,
    hq_admin: hqR.rows[0]?.count ?? 0,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function countSubmittedFromTable(pool, tableName) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.${tableName} WHERE status = 'submitted'`
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * Pending submitted counts across all reset request types (platform admin).
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function getPendingResetRequestCounts(pool) {
  const [member, branch_admin, hq_admin] = await Promise.all([
    countSubmittedFromTable(pool, "church_member_password_reset_requests"),
    countSubmittedFromTable(pool, "church_branch_admin_password_reset_requests"),
    countSubmittedFromTable(pool, "church_hq_admin_password_reset_requests"),
  ]);
  return {
    submitted_total: member + branch_admin + hq_admin,
    member,
    branch_admin,
    hq_admin,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function getUnifiedResetRequestSummary(pool) {
  const [byStatus, pending] = await Promise.all([
    countUnifiedResetRequestsByStatus(pool),
    getPendingResetRequestCounts(pool),
  ]);
  return {
    ...byStatus,
    ...pending,
    pending_total: pending.submitted_total,
  };
}

module.exports = {
  listUnifiedResetRequests,
  countUnifiedResetRequestsByStatus,
  countUnifiedResetRequestsByType,
  getPendingResetRequestCounts,
  getUnifiedResetRequestSummary,
  mapUnifiedRow,
};
