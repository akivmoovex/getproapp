"use strict";

/**
 * Platform Admin staff account recovery.
 * Reuses password-reset, invitation, and session services.
 * Never views, retrieves, emails, or logs passwords or reset tokens.
 */

const crypto = require("crypto");
const { recordAuditEventSafe } = require("./auditEventService");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const {
  authorize,
} = require("../../blessboard/services/blessBoardRbacAuthorizationService");
const {
  platformAdminRequestPasswordReset,
  STATUS: RESET_STATUS,
} = require("../../blessboard/services/passwordResetService");
const {
  inviteBlessBoardStaff,
  STATUS: INVITE_STATUS,
} = require("../../blessboard/services/inviteBlessBoardStaff");
const {
  deliverChurchAdministratorInvitation,
} = require("../../blessboard/services/deliverChurchAdministratorInvitation");
const authRepo = require("../../blessboard/repositories/blessBoardAuthRepository");
const tokenRepo = require("../../blessboard/repositories/userActionTokenRepository");
const { getApexOrigin } = require("../../blessboard/http/tenantLoginHelpers");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  RATE_LIMITED: "rate_limited",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_PA_ACTION = 8;
const RATE_MAX_INVITE = 5;

function deploymentCode(env) {
  const id = getPlatformDeploymentCode(env || process.env);
  return id && id.ok ? id.code : "blessboard-org-v5";
}

async function withClient(db, fn) {
  if (db && typeof db.query === "function" && typeof db.release === "function") {
    return fn(db);
  }
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }
  return fn(db);
}

async function assertPlatformPermission(db, actorUserId, permissionKey) {
  const userId = String(actorUserId || "").trim();
  if (!UUID_RE.test(userId)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "unauthenticated" };
  }
  const decision = await authorize(db, {
    actor: { userId },
    permission: permissionKey,
    tenantContext: {
      organizationId: null,
      churchId: null,
      primaryBranchId: null,
    },
    resourceContext: {
      organizationId: null,
      churchId: null,
      branchId: null,
    },
  });
  if (decision && decision.allowed === true) {
    return { ok: true };
  }
  const roles = await db.query(
    `SELECT 1
       FROM blessboard.user_roles
      WHERE user_id = $1
        AND role_key = 'platform_admin'
        AND status = 'active'
      LIMIT 1`,
    [userId]
  );
  if (roles.rows[0]) {
    return { ok: true };
  }
  return {
    ok: false,
    status: STATUS.FORBIDDEN,
    reason: (decision && decision.reasonCode) || "forbidden",
  };
}

async function loadTargetUser(db, userId) {
  return resolvePlatformManagedUser(db, userId);
}

/**
 * Canonical Platform Admin user resolver for /admin/users/:userId.
 * Route param is blessboard.users.id (not invitation id, member id, or session id).
 * @param {{ query?: Function, connect?: Function }} db
 * @param {string} userId
 */
async function resolvePlatformManagedUser(db, userId) {
  const id = String(userId || "").trim();
  if (!UUID_RE.test(id)) return null;
  const user = await authRepo.findUserById(db, id);
  if (!user) return null;
  return {
    ...user,
    // Explicit aliases for callers that must not confuse profile vs auth ids.
    platformUserId: String(user.id),
    authenticationUserId: String(user.id),
  };
}

async function consumePaActionRate(client, userId, actionKey) {
  const scopeKey = crypto
    .createHash("sha256")
    .update(`bb-pa-recovery:${actionKey}:${userId}`)
    .digest("hex");
  const slot = await tokenRepo.consumeRateLimitSlot(client, {
    scopeKind: "email",
    scopeKey,
    windowMs: RATE_WINDOW_MS,
    maxAttempts: RATE_MAX_PA_ACTION,
  });
  return Boolean(slot && slot.limited);
}

async function auditRecovery(db, input) {
  await recordAuditEventSafe(db, {
    deploymentCode: deploymentCode(input.env),
    organizationId: input.organizationId || null,
    churchId: input.churchId || null,
    actorUserId: input.actorUserId,
    actionKey: input.actionKey,
    entityType: "user",
    entityId: input.userId,
    outcome: "success",
    metadata: {
      source: "platform_admin",
      actor_type: "platform_admin",
      reason_code: input.reasonCode || null,
      from_status: input.fromStatus || null,
      to_status: input.toStatus || null,
      count: input.count != null ? input.count : null,
      status: input.status || null,
      delivery_channel: input.deliveryChannel || null,
      delivery_status: input.deliveryStatus || null,
      already_unlocked: input.alreadyUnlocked === true ? true : null,
    },
  });
}

async function sendPasswordReset(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.reset_access"
  );
  if (!gate.ok) return { ok: false, status: gate.status, reason: gate.reason };

  const user = await loadTargetUser(db, input.userId);
  if (!user) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  if (String(user.status) !== "active" || !user.password_hash) {
    return { ok: false, status: STATUS.CONFLICT, reason: "reset_unavailable" };
  }

  const orgId = await authRepo.findAuditOrganizationIdForUser(db, user.id);
  const result = await platformAdminRequestPasswordReset(
    db,
    {
      userId: user.id,
      email: user.email_normalized,
      actorUserId: input.actorUserId,
      organizationId: orgId,
      churchId: null,
      requestIp: input.requestIp,
      env: input.env,
      publicBaseUrl: input.publicBaseUrl || getApexOrigin(input.env || process.env),
    },
    input.deps || {}
  );

  if (!result.ok) {
    if (result.status === RESET_STATUS.FORBIDDEN) {
      return {
        ok: false,
        status: STATUS.CONFLICT,
        reason: result.reason || "reset_unavailable",
      };
    }
    if (result.status === RESET_STATUS.INVALID_INPUT) {
      return { ok: false, status: STATUS.CONFLICT, reason: "reset_unavailable" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "reset_failed" };
  }

  await auditRecovery(db, {
    env: input.env,
    organizationId: orgId,
    actorUserId: input.actorUserId,
    userId: user.id,
    actionKey: "platform.user.password_reset_requested",
    reasonCode: result.rateLimited
      ? "rate_limited_neutral"
      : result.deliveryStatus || (result.sent ? "sent" : "recorded"),
    status: result.sent ? "sent" : "recorded",
    deliveryChannel: result.deliveryChannel || null,
    deliveryStatus: result.deliveryStatus || null,
  });

  return {
    ok: true,
    status: STATUS.OK,
    sent: Boolean(result.sent),
    rateLimited: Boolean(result.rateLimited),
    deliveryChannel: result.deliveryChannel || null,
    deliveryStatus: result.deliveryStatus || null,
  };
}

async function resendInvitation(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.reset_access"
  );
  if (!gate.ok) return { ok: false, status: gate.status, reason: gate.reason };

  const user = await loadTargetUser(db, input.userId);
  if (!user) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };

  return withClient(db, async (client) => {
    if (await consumePaActionRate(client, user.id, "invite_resend")) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }
    const emailKey = crypto
      .createHash("sha256")
      .update(`bb-invite-resend:${user.email_normalized}`)
      .digest("hex");
    const emailLimit = await tokenRepo.consumeRateLimitSlot(client, {
      scopeKind: "email",
      scopeKey: emailKey,
      windowMs: RATE_WINDOW_MS,
      maxAttempts: RATE_MAX_INVITE,
    });
    if (emailLimit.limited) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }

    const pending = await client.query(
      `SELECT id, organization_id, church_id, branch_id, role_key, display_name
         FROM blessboard.user_invitations
        WHERE lower(email_normalized) = $1 AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1`,
      [user.email_normalized]
    );

    let organizationId = null;
    let churchId = null;
    let branchId = null;
    let roleKey = "church_hq_admin";
    let displayName = user.display_name || user.email_display;

    if (pending.rows[0]) {
      organizationId = pending.rows[0].organization_id;
      churchId = pending.rows[0].church_id;
      branchId = pending.rows[0].branch_id;
      roleKey = pending.rows[0].role_key;
      displayName = pending.rows[0].display_name || displayName;
    } else {
      const scope = await client.query(
        `SELECT organization_id, church_id, branch_id, role_key
           FROM blessboard.user_roles
          WHERE user_id = $1
            AND role_key IN ('church_hq_admin', 'branch_admin')
          ORDER BY CASE WHEN status = 'active' THEN 0 ELSE 1 END, created_at DESC
          LIMIT 1`,
        [user.id]
      );
      if (!scope.rows[0]) {
        return { ok: false, status: STATUS.CONFLICT, reason: "invite_unavailable" };
      }
      organizationId = scope.rows[0].organization_id;
      churchId = scope.rows[0].church_id;
      branchId = scope.rows[0].branch_id;
      roleKey = scope.rows[0].role_key;
    }

    if (!organizationId || !churchId) {
      return { ok: false, status: STATUS.CONFLICT, reason: "invite_scope_missing" };
    }
    if (!["church_hq_admin", "branch_admin"].includes(String(roleKey))) {
      roleKey = branchId ? "branch_admin" : "church_hq_admin";
    }

    const invited = await inviteBlessBoardStaff(db, {
      organizationId,
      churchId,
      actorUserId: input.actorUserId,
      email: user.email_display || user.email_normalized,
      roleKey,
      displayName,
      branchId,
      env: input.env,
      deploymentCode: deploymentCode(input.env),
    });
    if (!invited.ok) {
      return {
        ok: false,
        status:
          invited.status === INVITE_STATUS.CONFLICT
            ? STATUS.CONFLICT
            : invited.status === INVITE_STATUS.FORBIDDEN
              ? STATUS.FORBIDDEN
              : STATUS.LOOKUP_ERROR,
        reason: invited.reason || "invite_failed",
      };
    }

    let deliveryOk = false;
    try {
      const churchName = await client.query(
        `SELECT display_name FROM blessboard.churches WHERE id = $1 LIMIT 1`,
        [churchId]
      );
      const delivered = await deliverChurchAdministratorInvitation(db, {
        invitationId: invited.invitation && invited.invitation.id,
        rawToken: invited.rawToken,
        churchName: churchName.rows[0]
          ? churchName.rows[0].display_name
          : "BlessBoard",
        administratorName: displayName,
        recipientEmail: user.email_normalized,
        organizationId,
        churchId,
        actorUserId: input.actorUserId,
        existingActiveUser: String(user.status) === "active",
        forceResend: true,
        env: input.env,
        idempotencyKey: `pa-resend:${(invited.invitation && invited.invitation.id) || user.id}`,
      });
      deliveryOk = Boolean(delivered && delivered.ok);
    } catch {
      deliveryOk = false;
    }

    await auditRecovery(db, {
      env: input.env,
      organizationId,
      churchId,
      actorUserId: input.actorUserId,
      userId: user.id,
      actionKey: "platform.user.invitation_resent",
      reasonCode: deliveryOk ? "resent_delivered" : "resent_recorded",
      status: roleKey,
    });

    return { ok: true, status: STATUS.OK, sent: deliveryOk };
  });
}

async function revokeSessions(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.revoke_sessions"
  );
  if (!gate.ok) return { ok: false, status: gate.status, reason: gate.reason };

  const user = await loadTargetUser(db, input.userId);
  if (!user) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };

  return withClient(db, async (client) => {
    if (await consumePaActionRate(client, user.id, "revoke_sessions")) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }
    const count = await authRepo.revokeAllSessionsForUser(client, user.id);
    const orgId = await authRepo.findAuditOrganizationIdForUser(client, user.id);
    await auditRecovery(db, {
      env: input.env,
      organizationId: orgId,
      actorUserId: input.actorUserId,
      userId: user.id,
      actionKey: "platform.user.sessions_revoked",
      count,
      reasonCode: "revoked",
    });
    return { ok: true, status: STATUS.OK, revokedCount: count };
  });
}

async function requirePasswordChange(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.reset_access"
  );
  if (!gate.ok) return { ok: false, status: gate.status, reason: gate.reason };

  const user = await loadTargetUser(db, input.userId);
  if (!user) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  if (String(user.status) !== "active" || !user.password_hash) {
    return { ok: false, status: STATUS.CONFLICT, reason: "require_change_unavailable" };
  }

  return withClient(db, async (client) => {
    if (await consumePaActionRate(client, user.id, "require_password_change")) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }
    await authRepo.setPasswordChangeRequired(client, user.id, true);
    const revokedCount = await authRepo.revokeAllSessionsForUser(client, user.id);
    const orgId = await authRepo.findAuditOrganizationIdForUser(client, user.id);
    await auditRecovery(db, {
      env: input.env,
      organizationId: orgId,
      actorUserId: input.actorUserId,
      userId: user.id,
      actionKey: "platform.user.password_change_required",
      count: revokedCount,
      reasonCode: "required",
    });
    return { ok: true, status: STATUS.OK, revokedCount };
  });
}

async function suspendSignIn(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.suspend"
  );
  if (!gate.ok) return { ok: false, status: gate.status, reason: gate.reason };

  const user = await loadTargetUser(db, input.userId);
  if (!user) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  if (String(user.id) === String(input.actorUserId)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "self_suspend" };
  }
  if (String(user.status) === "invited" || !user.password_hash) {
    return { ok: false, status: STATUS.CONFLICT, reason: "suspend_unavailable" };
  }
  if (String(user.status) === "suspended") {
    return { ok: true, status: STATUS.OK, idempotent: true };
  }

  return withClient(db, async (client) => {
    if (await consumePaActionRate(client, user.id, "suspend")) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }
    const fromStatus = String(user.status);
    await authRepo.updateUserStatus(client, user.id, "suspended");
    const revokedCount = await authRepo.revokeAllSessionsForUser(client, user.id);
    const orgId = await authRepo.findAuditOrganizationIdForUser(client, user.id);
    await auditRecovery(db, {
      env: input.env,
      organizationId: orgId,
      actorUserId: input.actorUserId,
      userId: user.id,
      actionKey: "platform.user.suspended",
      fromStatus,
      toStatus: "suspended",
      count: revokedCount,
    });
    return { ok: true, status: STATUS.OK, revokedCount };
  });
}

async function restoreSignIn(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.restore"
  );
  if (!gate.ok) return { ok: false, status: gate.status, reason: gate.reason };

  const user = await loadTargetUser(db, input.userId);
  if (!user) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  if (!user.password_hash) {
    return { ok: false, status: STATUS.CONFLICT, reason: "restore_unavailable" };
  }
  if (String(user.status) === "active") {
    return { ok: true, status: STATUS.OK, idempotent: true };
  }
  if (!["suspended", "inactive"].includes(String(user.status))) {
    return { ok: false, status: STATUS.CONFLICT, reason: "restore_unavailable" };
  }

  return withClient(db, async (client) => {
    if (await consumePaActionRate(client, user.id, "restore")) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }
    const fromStatus = String(user.status);
    // Status only — never reactivate revoked RBAC / legacy role rows.
    await authRepo.updateUserStatus(client, user.id, "active");
    const orgId = await authRepo.findAuditOrganizationIdForUser(client, user.id);
    await auditRecovery(db, {
      env: input.env,
      organizationId: orgId,
      actorUserId: input.actorUserId,
      userId: user.id,
      actionKey: "platform.user.restored",
      fromStatus,
      toStatus: "active",
      reasonCode: "status_only",
    });
    return { ok: true, status: STATUS.OK };
  });
}

async function unlockAccount(db, input) {
  const gate = await assertPlatformPermission(
    db,
    input.actorUserId,
    "platform.users.unlock"
  );
  if (!gate.ok) return { ok: false, status: gate.status, reason: gate.reason };

  const user = await loadTargetUser(db, input.userId);
  if (!user) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };

  const lockedUntil = user.sign_in_locked_until
    ? new Date(user.sign_in_locked_until)
    : null;
  const wasLocked =
    Boolean(lockedUntil) && !Number.isNaN(lockedUntil.getTime()) && lockedUntil.getTime() > Date.now();

  return withClient(db, async (client) => {
    if (await consumePaActionRate(client, user.id, "unlock")) {
      return { ok: false, status: STATUS.RATE_LIMITED, reason: "rate_limited" };
    }
    // Clears temporary lock only — does not unsuspend or clear password-change-required.
    await authRepo.clearSignInLock(client, user.id);
    const orgId = await authRepo.findAuditOrganizationIdForUser(client, user.id);
    await auditRecovery(db, {
      env: input.env,
      organizationId: orgId,
      actorUserId: input.actorUserId,
      userId: user.id,
      actionKey: "platform.user.unlocked",
      reasonCode: wasLocked ? "lock_cleared" : "already_unlocked",
      alreadyUnlocked: !wasLocked,
    });
    return {
      ok: true,
      status: STATUS.OK,
      alreadyUnlocked: !wasLocked,
    };
  });
}

module.exports = {
  STATUS,
  resolvePlatformManagedUser,
  sendPasswordReset,
  resendInvitation,
  revokeSessions,
  requirePasswordChange,
  suspendSignIn,
  restoreSignIn,
  unlockAccount,
};
