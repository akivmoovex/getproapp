"use strict";

const auditLogsRepo = require("./auditLogsRepo");
const {
  LOGIN_PROTECTION,
  LOCK_AUDIT_ACTIONS,
  LOCK_ENTITY_TYPES,
  maskLoginIdentifier,
} = require("../../../church/loginProtection");

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

function isAccountLocked(row) {
  if (!row || !row.login_locked_until) return false;
  return new Date(row.login_locked_until).getTime() > Date.now();
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {object} entry
 */
async function recordLoginAttempt(pool, entry) {
  const r = await pool.query(
    `INSERT INTO public.church_login_attempts (
       organization_id, branch_id, account_type, account_id,
       identifier_normalized, ip_address, user_agent, success, failure_reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      entry.organization_id ?? null,
      entry.branch_id ?? null,
      entry.account_type,
      entry.account_id ?? null,
      entry.identifier_normalized,
      entry.ip_address ?? null,
      entry.user_agent ?? null,
      Boolean(entry.success),
      entry.failure_reason ?? null,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {string} accountType
 * @param {string} identifierNormalized
 * @param {{ sinceMinutes?: number, limit?: number }} opts
 */
async function getRecentFailedAttemptsForIdentifier(pool, accountType, identifierNormalized, opts = {}) {
  const sinceMinutes = Math.min(Math.max(Number(opts.sinceMinutes) || 60, 1), 24 * 60);
  const limit = Math.min(Math.max(Number(opts.limit) || 20, 1), 100);
  const r = await pool.query(
    `SELECT *
     FROM public.church_login_attempts
     WHERE account_type = $1
       AND identifier_normalized = $2
       AND success = false
       AND created_at >= now() - ($3 || ' minutes')::interval
     ORDER BY created_at DESC, id DESC
     LIMIT $4`,
    [accountType, identifierNormalized, String(sinceMinutes), limit]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {string} accountType
 * @param {number} accountId
 * @returns {Promise<{ failedAttempts: number, locked: boolean }>}
 */
async function incrementFailedLoginForAccount(pool, accountType, accountId) {
  const table = resolveTable(accountType);
  const r = await pool.query(
    `UPDATE public.${table}
     SET failed_login_attempts = failed_login_attempts + 1,
         last_failed_login_at = now(),
         updated_at = now()
     WHERE id = $1
     RETURNING failed_login_attempts`,
    [accountId]
  );
  const failedAttempts = Number(r.rows[0]?.failed_login_attempts || 0);
  let locked = false;
  if (failedAttempts >= LOGIN_PROTECTION.maxFailedAttempts) {
    await setLoginLockForAccount(pool, accountType, accountId);
    locked = true;
  }
  return { failedAttempts, locked };
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {string} accountType
 * @param {number} accountId
 */
async function resetFailedLoginForAccount(pool, accountType, accountId) {
  const table = resolveTable(accountType);
  const r = await pool.query(
    `UPDATE public.${table}
     SET failed_login_attempts = 0,
         login_locked_until = NULL,
         last_successful_login_at = now(),
         updated_at = now()
     WHERE id = $1
     RETURNING id, failed_login_attempts, login_locked_until, last_successful_login_at, last_failed_login_at`,
    [accountId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {string} accountType
 * @param {number} accountId
 */
async function clearExpiredLoginLockForAccount(pool, accountType, accountId) {
  const table = resolveTable(accountType);
  const r = await pool.query(
    `UPDATE public.${table}
     SET failed_login_attempts = 0,
         login_locked_until = NULL,
         updated_at = now()
     WHERE id = $1
       AND login_locked_until IS NOT NULL
       AND login_locked_until <= now()
     RETURNING id`,
    [accountId]
  );
  return Boolean(r.rows[0]);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {string} accountType
 * @param {number} accountId
 */
async function setLoginLockForAccount(pool, accountType, accountId) {
  const table = resolveTable(accountType);
  const minutes = LOGIN_PROTECTION.lockoutMinutes;
  const r = await pool.query(
    `UPDATE public.${table}
     SET login_locked_until = now() + ($2 || ' minutes')::interval,
         updated_at = now()
     WHERE id = $1
     RETURNING id, login_locked_until, failed_login_attempts`,
    [accountId, String(minutes)]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {object} entry
 */
async function recordLoginLockAudit(pool, entry) {
  const action = LOCK_AUDIT_ACTIONS[entry.accountType];
  const entityType = LOCK_ENTITY_TYPES[entry.accountType];
  if (!action || !entityType) return null;

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: entry.organizationId,
    branch_id: entry.branchId ?? null,
    actor_type: "system",
    actor_id: null,
    actor_label: "Login protection",
    action,
    entity_type: entityType,
    entity_id: entry.accountId,
    metadata_json: {
      account_type: entry.accountType,
      account_id: entry.accountId,
      identifier_normalized: maskLoginIdentifier(entry.identifierNormalized),
      failed_attempts: entry.failedAttempts,
      lockout_minutes: LOGIN_PROTECTION.lockoutMinutes,
      action_source: "login_protection",
    },
  });
}

/**
 * @param {object | null} row
 */
function getLoginProtectionSummaryForAccount(row) {
  if (!row) {
    return {
      failed_login_attempts: 0,
      login_locked_until: null,
      is_locked: false,
      last_failed_login_at: null,
      last_successful_login_at: null,
    };
  }
  return {
    failed_login_attempts: Number(row.failed_login_attempts || 0),
    login_locked_until: row.login_locked_until || null,
    is_locked: isAccountLocked(row),
    last_failed_login_at: row.last_failed_login_at || null,
    last_successful_login_at: row.last_successful_login_at || null,
  };
}

module.exports = {
  recordLoginAttempt,
  getRecentFailedAttemptsForIdentifier,
  incrementFailedLoginForAccount,
  resetFailedLoginForAccount,
  clearExpiredLoginLockForAccount,
  setLoginLockForAccount,
  isAccountLocked,
  recordLoginLockAudit,
  getLoginProtectionSummaryForAccount,
};
