"use strict";

const auditLogsRepo = require("./auditLogsRepo");
const passwordResetRateLimitsRepo = require("./passwordResetRateLimitsRepo");
const { maskLoginIdentifier, truncateMeta, LOCK_ENTITY_TYPES } = require("../../../church/loginProtection");
const { IP_BUCKET_PREFIX } = require("../../../church/passwordResetRateLimit");

const ACCOUNT_TABLES = {
  member: "church_members",
  branch_admin: "church_branch_admins",
  hq_admin: "church_hq_admins",
  ministry_leader: "church_ministry_leaders",
};

function resolveTable(accountType) {
  const table = ACCOUNT_TABLES[accountType];
  if (!table) {
    throw Object.assign(new Error("Unsupported account type."), { code: "INVALID_ACCOUNT_TYPE" });
  }
  return table;
}

function buildAccountDetailLink(row) {
  if (!row || !row.account_id) return null;
  switch (row.account_type) {
    case "member":
      return `/admin/church/members/${row.account_id}`;
    case "branch_admin":
      return `/admin/church/branches/${row.branch_id}/admins/${row.account_id}`;
    case "hq_admin":
      return `/admin/church/organizations/${row.organization_id}/hq-admins/${row.account_id}`;
    case "ministry_leader":
      return `/admin/church/ministry-leaders/${row.account_id}`;
    default:
      return null;
  }
}

function maskIpAddress(value) {
  const raw = truncateMeta(value, 64);
  if (!raw) return null;
  if (raw.includes(":")) {
    const parts = raw.split(":");
    if (parts.length > 2) {
      return `${parts[0]}:${parts[1]}:…`;
    }
  }
  const octets = raw.split(".");
  if (octets.length === 4) {
    return `${octets[0]}.${octets[1]}.*.*`;
  }
  return raw.slice(0, 24);
}

function mapLockedAccountRow(row) {
  const mapped = {
    account_type: row.account_type,
    account_id: row.account_id,
    full_name: row.full_name,
    email: row.email,
    phone: row.phone,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    host_slug: row.host_slug,
    login_locked_until: row.login_locked_until,
    failed_login_attempts: Number(row.failed_login_attempts || 0),
    last_failed_login_at: row.last_failed_login_at,
    last_successful_login_at: row.last_successful_login_at,
    detail_link: null,
  };
  mapped.detail_link = buildAccountDetailLink(mapped);
  return mapped;
}

function buildLockedAccountsUnion(filters) {
  const params = [];
  const orgFilter = (alias) => {
    if (filters.organization_id == null) return "";
    params.push(filters.organization_id);
    return `AND ${alias}.organization_id = $${params.length}`;
  };
  const branchFilter = (alias) => {
    if (filters.branch_id == null) return "";
    params.push(filters.branch_id);
    return `AND ${alias}.branch_id = $${params.length}`;
  };

  const unions = [];

  if (filters.account_type === "all" || filters.account_type === "member") {
    unions.push(`
      SELECT 'member'::text AS account_type,
             m.id AS account_id,
             m.full_name,
             m.email,
             m.phone,
             m.organization_id,
             o.name AS organization_name,
             m.branch_id,
             b.name AS branch_name,
             COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS host_slug,
             m.login_locked_until,
             m.failed_login_attempts,
             m.last_failed_login_at,
             m.last_successful_login_at
      FROM public.church_members m
      INNER JOIN public.church_organizations o ON o.id = m.organization_id
      INNER JOIN public.church_branches b ON b.id = m.branch_id
      WHERE m.login_locked_until IS NOT NULL
        AND m.login_locked_until > now()
        ${orgFilter("m")}
        ${branchFilter("m")}
    `);
  }

  if (filters.account_type === "all" || filters.account_type === "branch_admin") {
    unions.push(`
      SELECT 'branch_admin'::text AS account_type,
             ba.id AS account_id,
             COALESCE(ba.full_name, ba.display_name) AS full_name,
             ba.email,
             ba.phone,
             ba.organization_id,
             o.name AS organization_name,
             ba.branch_id,
             b.name AS branch_name,
             COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS host_slug,
             ba.login_locked_until,
             ba.failed_login_attempts,
             ba.last_failed_login_at,
             ba.last_successful_login_at
      FROM public.church_branch_admins ba
      INNER JOIN public.church_organizations o ON o.id = ba.organization_id
      INNER JOIN public.church_branches b ON b.id = ba.branch_id
      WHERE ba.login_locked_until IS NOT NULL
        AND ba.login_locked_until > now()
        ${orgFilter("ba")}
        ${branchFilter("ba")}
    `);
  }

  if (filters.account_type === "all" || filters.account_type === "hq_admin") {
    unions.push(`
      SELECT 'hq_admin'::text AS account_type,
             ha.id AS account_id,
             COALESCE(ha.full_name, ha.display_name) AS full_name,
             ha.email,
             ha.phone,
             ha.organization_id,
             o.name AS organization_name,
             NULL::bigint AS branch_id,
             NULL::text AS branch_name,
             NULL::text AS host_slug,
             ha.login_locked_until,
             ha.failed_login_attempts,
             ha.last_failed_login_at,
             ha.last_successful_login_at
      FROM public.church_hq_admins ha
      INNER JOIN public.church_organizations o ON o.id = ha.organization_id
      WHERE ha.login_locked_until IS NOT NULL
        AND ha.login_locked_until > now()
        ${orgFilter("ha")}
    `);
  }

  if (filters.account_type === "all" || filters.account_type === "ministry_leader") {
    unions.push(`
      SELECT 'ministry_leader'::text AS account_type,
             l.id AS account_id,
             l.full_name,
             l.email,
             l.phone,
             l.organization_id,
             o.name AS organization_name,
             l.branch_id,
             b.name AS branch_name,
             COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS host_slug,
             l.login_locked_until,
             l.failed_login_attempts,
             l.last_failed_login_at,
             l.last_successful_login_at
      FROM public.church_ministry_leaders l
      INNER JOIN public.church_organizations o ON o.id = l.organization_id
      INNER JOIN public.church_branches b ON b.id = l.branch_id
      WHERE l.login_locked_until IS NOT NULL
        AND l.login_locked_until > now()
        ${orgFilter("l")}
        ${branchFilter("l")}
    `);
  }

  return { unions, params };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} filters
 */
async function listLockedAccounts(pool, filters = {}) {
  const { unions, params } = buildLockedAccountsUnion(filters);
  if (unions.length === 0) {
    return [];
  }
  const limit = Math.min(Math.max(Number(filters.limit) || 100, 1), 100);
  params.push(limit);
  const r = await pool.query(
    `SELECT * FROM (${unions.join(" UNION ALL ")}) locked_accounts
     ORDER BY login_locked_until DESC, account_type, account_id
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map(mapLockedAccountRow);
}

function buildAttemptFilterClauses(filters, params) {
  const clauses = [];

  if (filters.account_type && filters.account_type !== "all") {
    params.push(filters.account_type);
    clauses.push(`la.account_type = $${params.length}`);
  }
  if (filters.organization_id != null) {
    params.push(filters.organization_id);
    clauses.push(`la.organization_id = $${params.length}`);
  }
  if (filters.branch_id != null) {
    params.push(filters.branch_id);
    clauses.push(`la.branch_id = $${params.length}`);
  }
  if (filters.success === "success") {
    clauses.push("la.success = true");
  } else if (filters.success === "failure") {
    clauses.push("la.success = false");
  }
  if (filters.failure_reason) {
    params.push(filters.failure_reason);
    clauses.push(`la.failure_reason = $${params.length}`);
  }
  if (filters.date_from) {
    params.push(filters.date_from);
    clauses.push(`la.created_at >= $${params.length}::date`);
  }
  if (filters.date_to) {
    params.push(filters.date_to);
    clauses.push(`la.created_at < ($${params.length}::date + interval '1 day')`);
  }

  return clauses;
}

function mapLoginAttemptRow(row) {
  const mapped = {
    id: row.id,
    account_type: row.account_type,
    account_id: row.account_id,
    identifier_display: maskLoginIdentifier(row.identifier_normalized),
    success: row.success,
    failure_reason: row.failure_reason,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    ip_address: maskIpAddress(row.ip_address),
    user_agent_preview: truncateMeta(row.user_agent, 80),
    created_at: row.created_at,
    detail_link: null,
  };
  if (row.account_id) {
    mapped.detail_link = buildAccountDetailLink(mapped);
  }
  return mapped;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} filters
 */
async function listRecentLoginAttempts(pool, filters = {}) {
  const params = [];
  const clauses = buildAttemptFilterClauses(filters, params);
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const countSql = `
    SELECT count(*)::int AS total
    FROM public.church_login_attempts la
    ${where}`;
  const countRes = await pool.query(countSql, params);
  const total = countRes.rows[0]?.total || 0;

  const page = Math.max(Number(filters.page) || 1, 1);
  const limit = Math.min(Math.max(Number(filters.limit) || 50, 1), 100);
  const offset = (page - 1) * limit;

  params.push(limit, offset);
  const r = await pool.query(
    `SELECT la.*,
            o.name AS organization_name,
            b.name AS branch_name
     FROM public.church_login_attempts la
     LEFT JOIN public.church_organizations o ON o.id = la.organization_id
     LEFT JOIN public.church_branches b ON b.id = la.branch_id
     ${where}
     ORDER BY la.created_at DESC, la.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    items: r.rows.map(mapLoginAttemptRow),
    total,
    page,
    limit,
    totalPages: total > 0 ? Math.ceil(total / limit) : 0,
  };
}

async function countLockedAccountsByType(pool) {
  const types = ["member", "branch_admin", "hq_admin", "ministry_leader"];
  const out = {};
  await Promise.all(
    types.map(async (accountType) => {
      const table = resolveTable(accountType);
      const r = await pool.query(
        `SELECT count(*)::int AS count
         FROM public.${table}
         WHERE login_locked_until IS NOT NULL AND login_locked_until > now()`
      );
      out[accountType] = r.rows[0]?.count || 0;
    })
  );
  return out;
}

async function countRecentFailedAttempts(pool, hours = 24) {
  const r = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.church_login_attempts
     WHERE success = false
       AND created_at >= now() - ($1 || ' hours')::interval`,
    [String(Math.min(Math.max(Number(hours) || 24, 1), 168))]
  );
  return r.rows[0]?.count || 0;
}

async function countRecentSuccessfulLogins(pool, hours = 24) {
  const r = await pool.query(
    `SELECT count(*)::int AS count
     FROM public.church_login_attempts
     WHERE success = true
       AND created_at >= now() - ($1 || ' hours')::interval`,
    [String(Math.min(Math.max(Number(hours) || 24, 1), 168))]
  );
  return r.rows[0]?.count || 0;
}

/**
 * @param {import("pg").Pool} pool
 */
async function getSecuritySummary(pool) {
  const [lockedByType, failedLast24h, successfulLast24h, passwordResetRateLimited24h, recentBlockedResetAttempts] =
    await Promise.all([
    countLockedAccountsByType(pool),
    countRecentFailedAttempts(pool, 24),
    countRecentSuccessfulLogins(pool, 24),
    passwordResetRateLimitsRepo.countRateLimitedEventsSince(pool, 24),
    passwordResetRateLimitsRepo.listRecentRateLimitedEvents(pool, { hours: 24, limit: 10 }),
  ]);
  return {
    locked_members: lockedByType.member || 0,
    locked_branch_admins: lockedByType.branch_admin || 0,
    locked_hq_admins: lockedByType.hq_admin || 0,
    locked_ministry_leaders: lockedByType.ministry_leader || 0,
    locked_total:
      (lockedByType.member || 0) +
      (lockedByType.branch_admin || 0) +
      (lockedByType.hq_admin || 0) +
      (lockedByType.ministry_leader || 0),
    failed_attempts_last_24h: failedLast24h,
    successful_logins_last_24h: successfulLast24h,
    password_reset_rate_limited_24h: passwordResetRateLimited24h,
    recent_blocked_reset_attempts: recentBlockedResetAttempts.map(mapBlockedResetAttemptRow),
  };
}

function mapBlockedResetAttemptRow(row) {
  const isIpBucket = String(row.identifier_normalized || "").startsWith(IP_BUCKET_PREFIX);
  return {
    id: row.id,
    request_type: row.request_type,
    organization_id: row.organization_id,
    organization_name: row.organization_name,
    branch_id: row.branch_id,
    branch_name: row.branch_name,
    identifier_preview: isIpBucket
      ? maskIpAddress(row.ip_address || row.identifier_normalized.replace(IP_BUCKET_PREFIX, ""))
      : maskLoginIdentifier(row.identifier_normalized),
    attempt_count: row.attempt_count,
    blocked_until: row.blocked_until,
    last_attempt_at: row.last_attempt_at,
  };
}

async function findAccountContextForUnlock(pool, accountType, accountId) {
  const table = resolveTable(accountType);
  if (accountType === "hq_admin") {
    const r = await pool.query(
      `SELECT id, organization_id, NULL::bigint AS branch_id, COALESCE(full_name, display_name) AS full_name
       FROM public.${table}
       WHERE id = $1
       LIMIT 1`,
      [accountId]
    );
    return r.rows[0] ?? null;
  }
  const r = await pool.query(
    `SELECT id, organization_id, branch_id, COALESCE(full_name, display_name) AS full_name
     FROM public.${table}
     WHERE id = $1
     LIMIT 1`,
    [accountId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {string} accountType
 * @param {number} accountId
 * @param {number | null} platformAdminId
 * @param {string | null} reason
 */
async function unlockAccountForPlatform(pool, accountType, accountId, platformAdminId, reason) {
  const table = resolveTable(accountType);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await findAccountContextForUnlock(client, accountType, accountId);
    if (!existing) {
      throw Object.assign(new Error("Account not found."), { code: "NOT_FOUND" });
    }

    const r = await client.query(
      `UPDATE public.${table}
       SET login_locked_until = NULL,
           failed_login_attempts = 0,
           updated_at = now()
       WHERE id = $1
       RETURNING id, organization_id, login_locked_until, failed_login_attempts, last_failed_login_at`,
      [accountId]
    );
    const updated = r.rows[0];

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: existing.organization_id,
      branch_id: existing.branch_id ?? null,
      actor_type: "platform_admin",
      actor_id: platformAdminId ?? null,
      actor_label: "Platform admin",
      action: "platform_login_account_unlocked",
      entity_type: LOCK_ENTITY_TYPES[accountType],
      entity_id: accountId,
      target_label: existing.full_name,
      metadata_json: {
        account_type: accountType,
        account_id: accountId,
        organization_id: existing.organization_id,
        branch_id: existing.branch_id ?? null,
        reason: reason || null,
        action_source: "platform_security",
      },
    });

    await client.query("COMMIT");
    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  listLockedAccounts,
  listRecentLoginAttempts,
  unlockAccountForPlatform,
  getSecuritySummary,
  countLockedAccountsByType,
  countRecentFailedAttempts,
  countRecentSuccessfulLogins,
  buildAccountDetailLink,
};
