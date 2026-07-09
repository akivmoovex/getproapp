"use strict";

const loginAttemptsRepo = require("../../db/pg/church/loginAttemptsRepo");
const {
  GENERIC_LOGIN_FAILURE,
  LOCKOUT_MESSAGE,
  MISSING_FIELDS_MESSAGE,
  normalizeLoginIdentifier,
  requestLoginMeta,
} = require("../../church/loginProtection");

/**
 * @param {import("pg").Pool} pool
 * @param {import("express").Request} req
 * @param {object} opts
 * @returns {Promise<{ ok: boolean, account: object | null, error: string | null, clearSession?: boolean }>}
 */
async function authenticateWithLoginProtection(pool, req, opts) {
  const identifier = String(opts.identifier || "").trim();
  const password = String(opts.password || "");
  const accountType = opts.accountType;
  const organizationId = opts.organizationId ?? null;
  const branchId = opts.branchId ?? null;
  const normalizedIdentifier = normalizeLoginIdentifier(identifier);
  const meta = requestLoginMeta(req);

  const baseAttempt = {
    organization_id: organizationId,
    branch_id: branchId,
    account_type: accountType,
    identifier_normalized: normalizedIdentifier,
    ip_address: meta.ip_address,
    user_agent: meta.user_agent,
  };

  if (!identifier || !password) {
    return { ok: false, account: null, error: MISSING_FIELDS_MESSAGE };
  }

  const row = await opts.findAccount(pool, identifier);
  if (!row) {
    await loginAttemptsRepo.recordLoginAttempt(pool, {
      ...baseAttempt,
      account_id: null,
      success: false,
      failure_reason: "invalid_identifier",
    });
    return { ok: false, account: null, error: GENERIC_LOGIN_FAILURE };
  }

  if (row.login_locked_until && !loginAttemptsRepo.isAccountLocked(row)) {
    await loginAttemptsRepo.clearExpiredLoginLockForAccount(pool, accountType, row.id);
    row.login_locked_until = null;
    row.failed_login_attempts = 0;
  }

  if (loginAttemptsRepo.isAccountLocked(row)) {
    await loginAttemptsRepo.recordLoginAttempt(pool, {
      ...baseAttempt,
      account_id: row.id,
      success: false,
      failure_reason: "locked",
    });
    return { ok: false, account: null, error: LOCKOUT_MESSAGE };
  }

  const passwordOk = await opts.verifyPassword(password, row.password_hash);
  if (!passwordOk) {
    const { failedAttempts, locked } = await loginAttemptsRepo.incrementFailedLoginForAccount(
      pool,
      accountType,
      row.id
    );
    await loginAttemptsRepo.recordLoginAttempt(pool, {
      ...baseAttempt,
      account_id: row.id,
      success: false,
      failure_reason: locked ? "locked_after_failure" : "invalid_password",
    });
    if (locked) {
      await loginAttemptsRepo.recordLoginLockAudit(pool, {
        accountType,
        accountId: row.id,
        organizationId,
        branchId,
        identifierNormalized: normalizedIdentifier,
        failedAttempts,
      });
      return { ok: false, account: null, error: LOCKOUT_MESSAGE };
    }
    return { ok: false, account: null, error: GENERIC_LOGIN_FAILURE };
  }

  if (typeof opts.validateAccountStatus === "function") {
    const statusResult = opts.validateAccountStatus(row);
    if (statusResult && !statusResult.ok) {
      await loginAttemptsRepo.recordLoginAttempt(pool, {
        ...baseAttempt,
        account_id: row.id,
        success: false,
        failure_reason: "account_status",
      });
      return {
        ok: false,
        account: row,
        error: statusResult.error,
        clearSession: Boolean(statusResult.clearSession),
      };
    }
  }

  await loginAttemptsRepo.resetFailedLoginForAccount(pool, accountType, row.id);
  await loginAttemptsRepo.recordLoginAttempt(pool, {
    ...baseAttempt,
    account_id: row.id,
    success: true,
    failure_reason: null,
  });
  return { ok: true, account: row, error: null };
}

module.exports = {
  authenticateWithLoginProtection,
};
