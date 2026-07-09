"use strict";

const { maskLoginIdentifier } = require("../../../church/loginProtection");

function branchScopedBaseSql(orgParamIdx, branchParamIdx) {
  return `
  SELECT
    'member'::text AS request_type,
    r.id AS request_id,
    r.organization_id,
    r.branch_id,
    r.member_id AS matched_account_id,
    m.full_name AS matched_account_name,
    NULL::text AS related_ministry_name,
    r.identifier_submitted,
    r.full_name_submitted,
    r.phone_submitted,
    r.email_submitted,
    r.status,
    r.created_at,
    r.updated_at,
    r.resolved_at
  FROM public.church_member_password_reset_requests r
  LEFT JOIN public.church_members m ON m.id = r.member_id
  WHERE r.organization_id = $${orgParamIdx} AND r.branch_id = $${branchParamIdx}

  UNION ALL

  SELECT
    'ministry_leader'::text AS request_type,
    r.id AS request_id,
    r.organization_id,
    r.branch_id,
    r.ministry_leader_id AS matched_account_id,
    l.full_name AS matched_account_name,
    min.name AS related_ministry_name,
    r.identifier_submitted,
    r.full_name_submitted,
    r.phone_submitted,
    r.email_submitted,
    r.status,
    r.created_at,
    r.updated_at,
    r.resolved_at
  FROM public.church_ministry_leader_password_reset_requests r
  LEFT JOIN public.church_ministry_leaders l ON l.id = r.ministry_leader_id
  LEFT JOIN public.church_ministries min ON min.id = r.ministry_id
  WHERE r.organization_id = $${orgParamIdx} AND r.branch_id = $${branchParamIdx}
  `;
}

function maskContact(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  return maskLoginIdentifier(raw.includes("@") ? raw.toLowerCase() : raw.replace(/\D/g, "").slice(0, 32));
}

function buildDetailUrl(row) {
  if (row.request_type === "member") {
    return `/branch/password-reset-requests/${row.request_id}`;
  }
  if (row.request_type === "ministry_leader") {
    return `/branch/leader-password-reset-requests/${row.request_id}`;
  }
  return null;
}

function mapUnifiedRow(row) {
  return {
    request_type: row.request_type,
    request_id: row.request_id,
    organization_id: row.organization_id,
    branch_id: row.branch_id,
    matched_account_id: row.matched_account_id,
    matched_account_name: row.matched_account_name || null,
    related_ministry_name: row.related_ministry_name || null,
    identifier_masked: maskLoginIdentifier(row.identifier_submitted),
    submitted_name: row.full_name_submitted || null,
    submitted_phone: maskContact(row.phone_submitted),
    submitted_email: maskContact(row.email_submitted),
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    resolved_at: row.resolved_at,
    detail_url: buildDetailUrl(row),
  };
}

function buildFilterClause(filters, params, startIdx = 3) {
  const clauses = [];

  if (filters.request_type && filters.request_type !== "all") {
    params.push(filters.request_type);
    clauses.push(`u.request_type = $${params.length}`);
  }
  if (filters.status && filters.status !== "all") {
    params.push(filters.status);
    clauses.push(`u.status = $${params.length}`);
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
      OR COALESCE(u.matched_account_name, '') ILIKE $${idx}
      OR COALESCE(u.related_ministry_name, '') ILIKE $${idx}
    )`);
  }

  void startIdx;
  return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
}

function scopedParams(organizationId, branchId) {
  return [organizationId, branchId];
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {object} filters
 */
async function listUnifiedBranchResetRequests(pool, filters) {
  const params = scopedParams(filters.organization_id, filters.branch_id);
  const baseSql = branchScopedBaseSql(1, 2);
  const where = buildFilterClause(filters, params);
  const limit = filters.limit || 50;
  const offset = ((filters.page || 1) - 1) * limit;

  const countSql = `SELECT COUNT(*)::int AS total FROM (${baseSql}) u ${where}`;
  const countResult = await pool.query(countSql, params);
  const total = countResult.rows[0]?.total ?? 0;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const listSql = `
    SELECT u.*
    FROM (${baseSql}) u
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

async function countStatusFromTable(pool, tableName, organizationId, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.${tableName}
     WHERE organization_id = $1 AND branch_id = $2
     GROUP BY status`,
    [organizationId, branchId]
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
 * @param {number} organizationId
 * @param {number} branchId
 */
async function countUnifiedBranchResetRequestsByStatus(pool, organizationId, branchId) {
  const [member, leader] = await Promise.all([
    countStatusFromTable(pool, "church_member_password_reset_requests", organizationId, branchId),
    countStatusFromTable(
      pool,
      "church_ministry_leader_password_reset_requests",
      organizationId,
      branchId
    ),
  ]);
  return mergeStatusCounts(member, leader);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} organizationId
 * @param {number} branchId
 */
async function countUnifiedBranchResetRequestsByType(pool, organizationId, branchId) {
  const [memberR, leaderR] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS count FROM public.church_member_password_reset_requests
       WHERE organization_id = $1 AND branch_id = $2`,
      [organizationId, branchId]
    ),
    pool.query(
      `SELECT COUNT(*)::int AS count FROM public.church_ministry_leader_password_reset_requests
       WHERE organization_id = $1 AND branch_id = $2`,
      [organizationId, branchId]
    ),
  ]);
  return {
    member: memberR.rows[0]?.count ?? 0,
    ministry_leader: leaderR.rows[0]?.count ?? 0,
  };
}

async function countSubmittedFromTable(pool, tableName, organizationId, branchId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.${tableName}
     WHERE organization_id = $1 AND branch_id = $2 AND status = 'submitted'`,
    [organizationId, branchId]
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * Pending submitted counts for branch admin badges.
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} organizationId
 * @param {number} branchId
 */
async function getPendingBranchResetRequestCounts(pool, organizationId, branchId) {
  const [member, ministry_leader] = await Promise.all([
    countSubmittedFromTable(pool, "church_member_password_reset_requests", organizationId, branchId),
    countSubmittedFromTable(
      pool,
      "church_ministry_leader_password_reset_requests",
      organizationId,
      branchId
    ),
  ]);
  return {
    submitted_total: member + ministry_leader,
    member,
    ministry_leader,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} organizationId
 * @param {number} branchId
 */
async function getUnifiedBranchResetRequestSummary(pool, organizationId, branchId) {
  const [byStatus, byType, pending] = await Promise.all([
    countUnifiedBranchResetRequestsByStatus(pool, organizationId, branchId),
    countUnifiedBranchResetRequestsByType(pool, organizationId, branchId),
    getPendingBranchResetRequestCounts(pool, organizationId, branchId),
  ]);
  return {
    ...byStatus,
    ...byType,
    ...pending,
    pending_total: pending.submitted_total,
  };
}

module.exports = {
  listUnifiedBranchResetRequests,
  countUnifiedBranchResetRequestsByStatus,
  countUnifiedBranchResetRequestsByType,
  getPendingBranchResetRequestCounts,
  getUnifiedBranchResetRequestSummary,
  mapUnifiedRow,
};
