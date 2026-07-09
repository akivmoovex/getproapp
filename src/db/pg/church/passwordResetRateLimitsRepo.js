"use strict";

const {
  PASSWORD_RESET_RATE_LIMIT,
  IP_BUCKET_PREFIX,
} = require("../../../church/passwordResetRateLimit");

function bucketWhereClause(alias, params, organizationId, branchId, requestType, identifierNormalized) {
  params.push(requestType);
  const typeIdx = params.length;
  params.push(organizationId ?? null);
  const orgIdx = params.length;
  params.push(branchId ?? null);
  const branchIdx = params.length;
  params.push(identifierNormalized);
  const identIdx = params.length;
  return {
    clause: `${alias}.request_type = $${typeIdx}
      AND ${alias}.organization_id IS NOT DISTINCT FROM $${orgIdx}
      AND ${alias}.branch_id IS NOT DISTINCT FROM $${branchIdx}
      AND ${alias}.identifier_normalized = $${identIdx}`,
  };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function findRateLimitRow(pool, organizationId, branchId, requestType, identifierNormalized) {
  const params = [];
  const { clause } = bucketWhereClause("r", params, organizationId, branchId, requestType, identifierNormalized);
  const r = await pool.query(
    `SELECT *
     FROM public.church_password_reset_rate_limits r
     WHERE ${clause}
     LIMIT 1`,
    params
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function findRecentIdentifierAttempts(pool, organizationId, branchId, requestType, identifierNormalized) {
  return findRateLimitRow(pool, organizationId, branchId, requestType, identifierNormalized);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function findRecentIpAttempts(pool, organizationId, branchId, requestType, ipAddress) {
  if (!ipAddress) return null;
  return findRateLimitRow(
    pool,
    organizationId,
    branchId,
    requestType,
    `${IP_BUCKET_PREFIX}${ipAddress}`
  );
}

function windowExpired(row, nowMs) {
  if (!row) return true;
  const windowMs = PASSWORD_RESET_RATE_LIMIT.windowMinutes * 60 * 1000;
  const first = new Date(row.first_attempt_at).getTime();
  return nowMs - first > windowMs;
}

function isCurrentlyBlocked(row, nowMs) {
  if (!row || !row.blocked_until) return false;
  return new Date(row.blocked_until).getTime() > nowMs;
}

function effectiveAttemptCount(row, nowMs) {
  if (!row || windowExpired(row, nowMs)) return 0;
  return Number(row.attempt_count || 0);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function upsertRateLimitAttempt(pool, entry) {
  const now = new Date();
  const existing = await findRateLimitRow(
    pool,
    entry.organizationId,
    entry.branchId,
    entry.requestType,
    entry.identifierNormalized
  );

  if (!existing) {
    const r = await pool.query(
      `INSERT INTO public.church_password_reset_rate_limits (
         organization_id, branch_id, request_type, identifier_normalized,
         ip_address, user_agent, attempt_count, first_attempt_at, last_attempt_at,
         created_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 1, now(), now(), now(), now())
       RETURNING *`,
      [
        entry.organizationId ?? null,
        entry.branchId ?? null,
        entry.requestType,
        entry.identifierNormalized,
        entry.ipAddress ?? null,
        entry.userAgent ?? null,
      ]
    );
    return r.rows[0];
  }

  const expired = windowExpired(existing, now.getTime());
  const r = await pool.query(
    `UPDATE public.church_password_reset_rate_limits
     SET attempt_count = CASE WHEN $2 THEN 1 ELSE attempt_count + 1 END,
         first_attempt_at = CASE WHEN $2 THEN now() ELSE first_attempt_at END,
         last_attempt_at = now(),
         ip_address = COALESCE($3, ip_address),
         user_agent = COALESCE($4, user_agent),
         blocked_until = CASE WHEN $2 THEN NULL ELSE blocked_until END,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [existing.id, expired, entry.ipAddress ?? null, entry.userAgent ?? null]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 */
async function markRateLimited(pool, organizationId, branchId, requestType, identifierNormalized) {
  const blockMinutes = PASSWORD_RESET_RATE_LIMIT.blockMinutes;
  const existing = await findRateLimitRow(
    pool,
    organizationId,
    branchId,
    requestType,
    identifierNormalized
  );
  if (existing) {
    const r = await pool.query(
      `UPDATE public.church_password_reset_rate_limits
       SET blocked_until = GREATEST(COALESCE(blocked_until, now()), now()) + ($2 || ' minutes')::interval,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [existing.id, String(blockMinutes)]
    );
    return r.rows[0];
  }
  const r = await pool.query(
    `INSERT INTO public.church_password_reset_rate_limits (
       organization_id, branch_id, request_type, identifier_normalized,
       attempt_count, first_attempt_at, last_attempt_at, blocked_until,
       created_at, updated_at
     )
     VALUES ($1, $2, $3, $4, 0, now(), now(), now() + ($5 || ' minutes')::interval, now(), now())
     RETURNING *`,
    [
      organizationId ?? null,
      branchId ?? null,
      requestType,
      identifierNormalized,
      String(blockMinutes),
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {{ hours?: number, limit?: number }} [options]
 */
async function listRecentRateLimitedEvents(pool, options = {}) {
  const hours = Math.min(Math.max(Number(options.hours) || 24, 1), 168);
  const limit = Math.min(Math.max(Number(options.limit) || 20, 1), 100);
  const r = await pool.query(
    `SELECT r.*,
            o.name AS organization_name,
            b.name AS branch_name
     FROM public.church_password_reset_rate_limits r
     LEFT JOIN public.church_organizations o ON o.id = r.organization_id
     LEFT JOIN public.church_branches b ON b.id = r.branch_id
     WHERE r.blocked_until IS NOT NULL
       AND r.last_attempt_at >= now() - ($1 || ' hours')::interval
     ORDER BY r.last_attempt_at DESC
     LIMIT $2`,
    [String(hours), limit]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} [hours]
 */
async function countRateLimitedEventsSince(pool, hours = 24) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_audit_logs
     WHERE action = 'password_reset_request_rate_limited'
       AND created_at >= now() - ($1 || ' hours')::interval`,
    [String(hours)]
  );
  return r.rows[0]?.count ?? 0;
}

module.exports = {
  findRecentIdentifierAttempts,
  findRecentIpAttempts,
  findRateLimitRow,
  upsertRateLimitAttempt,
  markRateLimited,
  listRecentRateLimitedEvents,
  countRateLimitedEventsSince,
  windowExpired,
  isCurrentlyBlocked,
  effectiveAttemptCount,
};
