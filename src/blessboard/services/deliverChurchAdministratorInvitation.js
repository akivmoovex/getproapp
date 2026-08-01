"use strict";

/**
 * Canonical post-provisioning church administrator invitation delivery.
 * Call only after the provisioning transaction has committed.
 * Never rolls back provisioning when email fails.
 */

const inviteRepo = require("../repositories/userInvitationRepository");
const {
  sendChurchAdministratorInvitationEmail,
  DELIVERY_CODE,
} = require("./churchAdministratorInvitationDelivery");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
const { getApexOrigin } = require("../http/tenantLoginHelpers");

const STATUS = Object.freeze({
  OK: "ok",
  SKIPPED: "skipped",
  INVALID_INPUT: "invalid_input",
  DELIVERY_FAILED: "delivery_failed",
  DELIVERY_UNAVAILABLE: "delivery_unavailable",
});

/**
 * @param {{ query: Function }} db
 * @param {{
 *   invitationId?: string|null,
 *   rawToken?: string|null,
 *   churchName: string,
 *   administratorName?: string|null,
 *   recipientEmail: string,
 *   organizationId?: string|null,
 *   churchId?: string|null,
 *   actorUserId?: string|null,
 *   existingActiveUser?: boolean,
 *   env?: NodeJS.ProcessEnv|Record<string,string>,
 *   publicBaseUrl?: string|null,
 *   expiresAt?: Date|string|null,
 *   idempotencyKey?: string|null,
 * }} input
 * @param {{ emailAdapter?: object }} [deps]
 */
async function deliverChurchAdministratorInvitation(db, input, deps = {}) {
  const src = input && typeof input === "object" ? input : {};
  const existingActiveUser = Boolean(src.existingActiveUser);
  const forceResend = Boolean(src.forceResend);
  const env = src.env || process.env;
  const publicBaseUrl =
    src.publicBaseUrl != null && String(src.publicBaseUrl).trim()
      ? String(src.publicBaseUrl).trim()
      : getApexOrigin(env);

  if (!src.churchName || !src.recipientEmail) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "missing_fields" };
  }

  if (!existingActiveUser && !src.rawToken) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "missing_token" };
  }

  // Idempotent provisioning retries: do not re-send when delivery already succeeded.
  if (!forceResend && src.invitationId && db && typeof db.query === "function") {
    try {
      const prior = await db.query(
        `SELECT delivery_status
           FROM blessboard.user_invitations
          WHERE id = $1
          LIMIT 1`,
        [src.invitationId]
      );
      const status = prior.rows[0] && prior.rows[0].delivery_status;
      if (status === "sent") {
        return {
          ok: true,
          status: STATUS.SKIPPED,
          reason: "already_sent",
          delivery: { ok: true, code: DELIVERY_CODE.SENT, skipped: true },
        };
      }
    } catch {
      // Columns may be absent until migration; continue to attempt delivery.
    }
  }

  const inviteUrl =
    !existingActiveUser && src.rawToken
      ? `${String(publicBaseUrl).replace(/\/+$/, "")}/invite/accept?token=${encodeURIComponent(String(src.rawToken))}`
      : null;

  const delivery = await sendChurchAdministratorInvitationEmail(
    {
      churchName: src.churchName,
      administratorName: src.administratorName || null,
      recipientEmail: src.recipientEmail,
      inviteUrl,
      publicBaseUrl,
      expiresAt: src.expiresAt || null,
      kind: existingActiveUser ? "access_confirmation" : "setup_invitation",
    },
    { adapter: deps.emailAdapter }
  );

  if (src.invitationId && db && typeof db.query === "function") {
    try {
      await db.query(
        `UPDATE blessboard.user_invitations
            SET delivery_status = $2,
                delivery_attempted_at = now(),
                delivery_error_code = $3,
                updated_at = now()
          WHERE id = $1`,
        [
          src.invitationId,
          delivery.ok ? "sent" : delivery.code === DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE
            ? "sending_unavailable"
            : "failed",
          delivery.ok ? null : String(delivery.code || "failed").slice(0, 80),
        ]
      );
    } catch {
      // Delivery columns may be absent until migration; provisioning must still succeed.
    }
  }

  if (src.organizationId) {
    await recordBlessBoardAudit(db, {
      organizationId: src.organizationId,
      churchId: src.churchId || null,
      actorUserId: src.actorUserId || null,
      actionKey: existingActiveUser
        ? "invitation.access_email_attempted"
        : "invitation.email_attempted",
      entityType: "user_invitation",
      entityId: src.invitationId || null,
      outcome: delivery.ok ? "success" : "failure",
      metadata: {
        delivery_code: delivery.code,
        sending_available: delivery.sendingAvailable,
        kind: existingActiveUser ? "access_confirmation" : "setup_invitation",
        idempotency_key: src.idempotencyKey || null,
        // Never include token or invite URL.
      },
    }).catch(() => null);
  }

  if (delivery.ok) {
    return {
      ok: true,
      status: STATUS.OK,
      delivery,
    };
  }

  return {
    ok: false,
    status:
      delivery.code === DELIVERY_CODE.EMAIL_SENDING_UNAVAILABLE
        ? STATUS.DELIVERY_UNAVAILABLE
        : STATUS.DELIVERY_FAILED,
    delivery,
  };
}

module.exports = {
  STATUS,
  DELIVERY_CODE,
  deliverChurchAdministratorInvitation,
};
