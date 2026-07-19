"use strict";

/**
 * Reset a BlessBoard V5 user password (ops CLI / services).
 * Never logs or returns plaintext passwords or hashes.
 */

const bcrypt = require("bcryptjs");
const repo = require("../repositories/blessBoardAuthRepository");
const { normalizeEmail } = require("./createBlessBoardUser");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  resolveManageTransactionOption,
  openProvisioningSession,
} = require("../../platform/db/provisioningTransaction");

const STATUS = Object.freeze({
  RESET: "reset",
  DRY_RUN_WOULD_RESET: "dry_run_would_reset",
  INVALID_INPUT: "invalid_input",
  USER_NOT_FOUND: "user_not_found",
  USER_INACTIVE: "user_inactive",
  WEAK_PASSWORD: "weak_password",
  ARGV_PASSWORD_FORBIDDEN: "argv_password_forbidden",
  TRANSACTION_ERROR: "transaction_error",
});

/** Match createBlessBoardUser bcrypt cost. */
const BCRYPT_ROUNDS = 12;

/**
 * Same length policy as createBlessBoardUser (10–200).
 * @param {unknown} password
 */
function validatePasswordPolicy(password) {
  const value = password != null ? String(password) : "";
  if (!value || value.length < 10 || value.length > 200) {
    return { ok: false, reason: "password" };
  }
  return { ok: true, value };
}

/**
 * @param {object} input
 */
function validateResetInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  if (raw.passwordFromArgv === true) {
    return { ok: false, status: STATUS.ARGV_PASSWORD_FORBIDDEN, reason: "argv_password" };
  }
  const email = normalizeEmail(raw.email);
  if (!email) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "email" };
  }
  const dryRun = Boolean(raw.dryRun);
  let password = null;
  let passwordPolicyOk = null;
  if (raw.password != null && String(raw.password) !== "") {
    const policy = validatePasswordPolicy(raw.password);
    if (!policy.ok) {
      return { ok: false, status: STATUS.WEAK_PASSWORD, reason: "password" };
    }
    password = policy.value;
    passwordPolicyOk = true;
  } else if (!dryRun) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "password_required" };
  } else {
    passwordPolicyOk = false;
  }

  const deploymentCode = String(raw.deploymentCode || "blessboard-org-v5")
    .trim()
    .toLowerCase();

  return {
    ok: true,
    value: {
      email,
      password,
      passwordPolicyOk,
      dryRun,
      deploymentCode,
    },
  };
}

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {{
 *   email: string,
 *   password?: string|null,
 *   dryRun?: boolean,
 *   passwordFromArgv?: boolean,
 *   deploymentCode?: string,
 * }} input
 * @param {{ manageTransaction?: boolean }} [options]
 */
async function resetBlessBoardUserPassword(db, input, options) {
  const validated = validateResetInput(input);
  if (!validated.ok) {
    return {
      ok: false,
      status: validated.status || STATUS.INVALID_INPUT,
      message: `invalid_input:${validated.reason}`,
      preview: null,
      result: null,
    };
  }
  const req = validated.value;

  const resolved = resolveManageTransactionOption(db, options);
  if (!resolved.ok) {
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: resolved.message,
      preview: null,
      result: null,
    };
  }

  let session = null;
  try {
    session = await openProvisioningSession(resolved);
    const client = session.client;

    const user = await repo.findUserByEmail(client, req.email);
    if (!user) {
      await session.rollbackIfManaged();
      return {
        ok: false,
        status: STATUS.USER_NOT_FOUND,
        message: "user_not_found",
        preview: null,
        result: null,
      };
    }

    const accountStatus = String(user.status || "");
    if (accountStatus !== "active") {
      await session.rollbackIfManaged();
      return {
        ok: false,
        status: STATUS.USER_INACTIVE,
        message: "user_inactive",
        preview: {
          emailNormalized: String(user.email_normalized),
          accountStatus,
          hasActivePlatformAdminRole: false,
          activeSessionCount: 0,
          passwordMeetsPolicy: req.passwordPolicyOk,
          requiresConfirm: true,
          loginEligible: false,
        },
        result: null,
      };
    }

    const hasPlatformAdmin = await repo.userHasActivePlatformAdminRole(client, user.id);
    const activeSessionCount = await repo.countActiveSessionsForUser(client, user.id);

    const preview = {
      emailNormalized: String(user.email_normalized),
      accountStatus,
      hasActivePlatformAdminRole: hasPlatformAdmin,
      activeSessionCount,
      passwordMeetsPolicy: req.passwordPolicyOk === true,
      requiresConfirm: true,
      loginEligible: true,
    };

    if (req.dryRun) {
      await session.rollbackIfManaged();
      return {
        ok: true,
        status: STATUS.DRY_RUN_WOULD_RESET,
        message: "dry_run_would_reset",
        preview,
        result: null,
      };
    }

    const passwordHash = await bcrypt.hash(req.password, BCRYPT_ROUNDS);
    await repo.updateUserPasswordHash(client, user.id, passwordHash);
    const revokedCount = await repo.revokeAllSessionsForUser(client, user.id);

    const organizationId = await repo.findAuditOrganizationIdForUser(client, user.id);
    if (organizationId) {
      await recordAuditEventSafe(client, {
        deploymentCode: req.deploymentCode,
        organizationId,
        actorUserId: user.id,
        outcome: "success",
        actionKey: "user.password_reset",
        entityType: "blessboard_user",
        entityId: user.id,
        metadata: {
          category: "auth",
          status: "reset",
          count: revokedCount,
          actor_type: "ops_cli",
          source: "blessboard_user_password_reset",
          reason_code: hasPlatformAdmin ? "platform_admin" : "staff_user",
        },
      });
    }

    await session.commitIfManaged();
    return {
      ok: true,
      status: STATUS.RESET,
      message: "password_reset",
      preview: {
        ...preview,
        activeSessionCount: 0,
        requiresConfirm: false,
      },
      result: {
        sessionsRevoked: revokedCount,
        audited: Boolean(organizationId),
      },
    };
  } catch {
    if (session) {
      await session.safeRollbackOnError();
    }
    return {
      ok: false,
      status: STATUS.TRANSACTION_ERROR,
      message: "transaction_error",
      preview: null,
      result: null,
    };
  } finally {
    if (session) {
      session.releaseIfOwned();
    }
  }
}

module.exports = {
  STATUS,
  BCRYPT_ROUNDS,
  validatePasswordPolicy,
  validateResetInput,
  resetBlessBoardUserPassword,
};
