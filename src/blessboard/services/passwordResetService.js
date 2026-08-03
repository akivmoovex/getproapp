"use strict";

/**
 * Secure BlessBoard password-reset request + completion.
 * Enumeration-safe public responses. Tokens hashed at rest.
 */

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const authRepo = require("../repositories/blessBoardAuthRepository");
const tokenRepo = require("../repositories/userActionTokenRepository");
const { normalizeEmail } = require("./createBlessBoardUser");
const { hashSessionToken } = require("../../platform/session/sessionToken");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
const { getApexOrigin } = require("../http/tenantLoginHelpers");
const {
  sendPasswordResetEmail,
  DELIVERY_CODE,
} = require("./passwordResetEmailDelivery");

const PURPOSE = "password_reset";
const TTL_MS = 60 * 60 * 1000; // 1 hour
const BCRYPT_ROUNDS = 12;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_EMAIL = 5;
const RATE_MAX_IP = 20;

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TOKEN: "invalid_token",
  EXPIRED: "expired",
  CONSUMED: "consumed",
  WEAK_PASSWORD: "weak_password",
  MISMATCH: "mismatch",
  RATE_LIMITED: "rate_limited",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const NEUTRAL_MESSAGE =
  "If an eligible account exists for that email, we have sent password reset instructions.";

function generateRawToken() {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashSessionToken(rawToken) };
}

function hashIp(ip) {
  const raw = String(ip || "").trim().slice(0, 128);
  if (!raw) return null;
  return crypto.createHash("sha256").update(`bb-reset-ip:${raw}`).digest("hex");
}

function validatePassword(password) {
  const value = password != null ? String(password) : "";
  if (!value || value.length < 10 || value.length > 200) {
    return { ok: false, reason: "password" };
  }
  return { ok: true, value };
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

/**
 * Public forgot-password request. Always returns a neutral message when ok.
 */
async function requestPasswordReset(db, input, deps = {}) {
  const src = input && typeof input === "object" ? input : {};
  const email = normalizeEmail(src.email);
  const env = src.env || process.env;
  const publicBaseUrl =
    src.publicBaseUrl != null && String(src.publicBaseUrl).trim()
      ? String(src.publicBaseUrl).trim()
      : getApexOrigin(env);
  const ipHash = hashIp(src.requestIp);

  if (!email) {
    return {
      ok: true,
      status: STATUS.OK,
      message: NEUTRAL_MESSAGE,
      sent: false,
    };
  }

  try {
    return await withClient(db, async (client) => {
      if (typeof client.query === "function") {
        await client.query("BEGIN");
      }
      try {
        if (ipHash) {
          const ipLimit = await tokenRepo.consumeRateLimitSlot(client, {
            scopeKind: "ip",
            scopeKey: ipHash,
            windowMs: RATE_WINDOW_MS,
            maxAttempts: RATE_MAX_IP,
          });
          if (ipLimit.limited) {
            if (typeof client.query === "function") await client.query("COMMIT");
            return {
              ok: true,
              status: STATUS.OK,
              message: NEUTRAL_MESSAGE,
              sent: false,
              rateLimited: true,
            };
          }
        }

        const emailKey = crypto
          .createHash("sha256")
          .update(`bb-reset-email:${email}`)
          .digest("hex");
        const emailLimit = await tokenRepo.consumeRateLimitSlot(client, {
          scopeKind: "email",
          scopeKey: emailKey,
          windowMs: RATE_WINDOW_MS,
          maxAttempts: RATE_MAX_EMAIL,
        });
        if (emailLimit.limited) {
          if (typeof client.query === "function") await client.query("COMMIT");
          return {
            ok: true,
            status: STATUS.OK,
            message: NEUTRAL_MESSAGE,
            sent: false,
            rateLimited: true,
          };
        }

        const user = await authRepo.findUserByEmail(client, email);
        // Neutral path for missing / suspended / invited without password.
        const eligible =
          user &&
          String(user.status) === "active" &&
          user.password_hash;

        if (!eligible) {
          if (typeof client.query === "function") await client.query("COMMIT");
          return {
            ok: true,
            status: STATUS.OK,
            message: NEUTRAL_MESSAGE,
            sent: false,
          };
        }

        await tokenRepo.consumeActiveTokensForUserPurpose(client, {
          userId: String(user.id),
          purpose: PURPOSE,
        });

        const { rawToken, tokenHash } = generateRawToken();
        const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
        const token = await tokenRepo.insertActionToken(client, {
          userId: String(user.id),
          purpose: PURPOSE,
          tokenHash,
          expiresAt,
          createdByUserId: src.actorUserId || null,
          organizationId: src.organizationId || null,
          churchId: src.churchId || null,
          requestIpHash: ipHash,
          metadataJson: {
            source: src.source || "public_forgot_password",
          },
        });

        if (typeof client.query === "function") await client.query("COMMIT");

        const resetUrl = `${String(publicBaseUrl).replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
        const delivery = await sendPasswordResetEmail(
          {
            recipientEmail: email,
            publicBaseUrl,
            resetUrl,
            expiresAt,
          },
          { adapter: deps.emailAdapter }
        );

        await recordBlessBoardAudit(db, {
          organizationId: src.organizationId || null,
          churchId: src.churchId || null,
          actorUserId: src.actorUserId || null,
          actionKey: "user.password_reset_requested",
          entityType: "user",
          entityId: String(user.id),
          outcome: delivery.ok ? "success" : "failure",
          metadata: {
            delivery_code: delivery.code,
            token_id: token && token.id,
            source: src.source || "public_forgot_password",
            actor_type: src.actorUserId ? "platform_admin" : "public",
          },
        }).catch(() => null);

        return {
          ok: true,
          status: STATUS.OK,
          message: NEUTRAL_MESSAGE,
          sent: Boolean(delivery.ok),
          deliveryCode: delivery.code,
          // test-only fields omitted from HTTP responses by routes
          _testTokenId: token && token.id,
        };
      } catch (err) {
        if (typeof client.query === "function") {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* ignore */
          }
        }
        throw err;
      }
    });
  } catch {
    return {
      ok: true,
      status: STATUS.OK,
      message: NEUTRAL_MESSAGE,
      sent: false,
    };
  }
}

/**
 * Platform Admin initiates reset for a known user by id (email optional).
 * Creates a one-time token; delivers by email when available. Phone-only users
 * succeed with a safe non-email status — never fails merely because email is absent.
 * Never returns the raw token or reset URL to callers (sharing stays out-of-band).
 */
async function platformAdminRequestPasswordReset(db, input, deps = {}) {
  const src = input && typeof input === "object" ? input : {};
  if (!src.actorUserId) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "actor" };
  }

  const env = src.env || process.env;
  const publicBaseUrl =
    src.publicBaseUrl != null && String(src.publicBaseUrl).trim()
      ? String(src.publicBaseUrl).trim()
      : getApexOrigin(env);
  const ipHash = hashIp(src.requestIp);

  let user = null;
  if (src.userId) {
    user = await authRepo.findUserById(db, String(src.userId).trim());
  } else {
    const email = normalizeEmail(src.email);
    if (!email) {
      return { ok: false, status: STATUS.INVALID_INPUT, reason: "email" };
    }
    user = await authRepo.findUserByEmail(db, email);
  }

  if (!user) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "target" };
  }
  if (String(user.status) !== "active" || !user.password_hash) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "target_state" };
  }

  const email = normalizeEmail(user.email_normalized || user.email_display || src.email);
  const phone = user.phone_normalized ? String(user.phone_normalized) : null;

  try {
    return await withClient(db, async (client) => {
      if (typeof client.query === "function") await client.query("BEGIN");
      try {
        if (ipHash) {
          const ipLimit = await tokenRepo.consumeRateLimitSlot(client, {
            scopeKind: "ip",
            scopeKey: ipHash,
            windowMs: RATE_WINDOW_MS,
            maxAttempts: RATE_MAX_IP,
          });
          if (ipLimit.limited) {
            if (typeof client.query === "function") await client.query("COMMIT");
            return {
              ok: true,
              status: STATUS.OK,
              sent: false,
              rateLimited: true,
              deliveryChannel: email ? "email" : phone ? "phone" : "none",
              deliveryStatus: "rate_limited",
            };
          }
        }

        const rateScope = email
          ? crypto.createHash("sha256").update(`bb-reset-email:${email}`).digest("hex")
          : crypto
              .createHash("sha256")
              .update(`bb-reset-user:${String(user.id)}`)
              .digest("hex");
        const emailLimit = await tokenRepo.consumeRateLimitSlot(client, {
          scopeKind: "email",
          scopeKey: rateScope,
          windowMs: RATE_WINDOW_MS,
          maxAttempts: RATE_MAX_EMAIL,
        });
        if (emailLimit.limited) {
          if (typeof client.query === "function") await client.query("COMMIT");
          return {
            ok: true,
            status: STATUS.OK,
            sent: false,
            rateLimited: true,
            deliveryChannel: email ? "email" : phone ? "phone" : "none",
            deliveryStatus: "rate_limited",
          };
        }

        await tokenRepo.consumeActiveTokensForUserPurpose(client, {
          userId: String(user.id),
          purpose: PURPOSE,
        });

        const { rawToken, tokenHash } = generateRawToken();
        const expiresAt = new Date(Date.now() + TTL_MS).toISOString();
        const token = await tokenRepo.insertActionToken(client, {
          userId: String(user.id),
          purpose: PURPOSE,
          tokenHash,
          expiresAt,
          createdByUserId: src.actorUserId || null,
          organizationId: src.organizationId || null,
          churchId: src.churchId || null,
          requestIpHash: ipHash,
          metadataJson: {
            source: "platform_admin",
            has_email: Boolean(email),
            has_phone: Boolean(phone),
          },
        });

        if (typeof client.query === "function") await client.query("COMMIT");

        const resetUrl = `${String(publicBaseUrl).replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(rawToken)}`;
        let deliveryChannel = "none";
        let deliveryStatus = "recorded";
        let sent = false;
        let deliveryCode = null;

        if (email) {
          deliveryChannel = "email";
          const delivery = await sendPasswordResetEmail(
            {
              recipientEmail: email,
              publicBaseUrl,
              resetUrl,
              expiresAt,
            },
            { adapter: deps.emailAdapter }
          );
          sent = Boolean(delivery.ok);
          deliveryCode = delivery.code;
          deliveryStatus = delivery.ok ? "sent" : "email_unavailable";
        } else if (phone) {
          deliveryChannel = "phone";
          // Paid SMS is optional; do not claim delivery. Token exists for authorized sharing.
          deliveryStatus = "sms_unavailable_link_created";
          sent = false;
          deliveryCode = "sms_provider_unavailable";
        } else {
          deliveryStatus = "no_delivery_channel";
        }

        await recordBlessBoardAudit(db, {
          organizationId: src.organizationId || null,
          churchId: src.churchId || null,
          actorUserId: src.actorUserId || null,
          actionKey: "user.password_reset_requested",
          entityType: "user",
          entityId: String(user.id),
          outcome: "success",
          metadata: {
            delivery_code: deliveryCode,
            delivery_channel: deliveryChannel,
            delivery_status: deliveryStatus,
            token_id: token && token.id,
            source: "platform_admin",
            actor_type: "platform_admin",
          },
        }).catch(() => null);

        return {
          ok: true,
          status: STATUS.OK,
          sent,
          rateLimited: false,
          deliveryChannel,
          deliveryStatus,
          deliveryCode,
          _testTokenId: token && token.id,
        };
      } catch (err) {
        if (typeof client.query === "function") {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* ignore */
          }
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "reset_failed" };
  }
}

/**
 * Complete password reset with a raw token.
 */
async function completePasswordReset(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const rawToken = String(src.token || "").trim();
  if (!rawToken || rawToken.length < 20) {
    return { ok: false, status: STATUS.INVALID_TOKEN };
  }
  const passwordCheck = validatePassword(src.password);
  if (!passwordCheck.ok) {
    return { ok: false, status: STATUS.WEAK_PASSWORD, reason: "password" };
  }
  if (String(src.passwordConfirm != null ? src.passwordConfirm : "") !== passwordCheck.value) {
    return { ok: false, status: STATUS.MISMATCH, reason: "confirm" };
  }

  const tokenHash = hashSessionToken(rawToken);

  try {
    return await withClient(db, async (client) => {
      if (typeof client.query === "function") await client.query("BEGIN");
      try {
        const token = await tokenRepo.findByTokenHash(client, tokenHash);
        if (!token || token.purpose !== PURPOSE) {
          if (typeof client.query === "function") await client.query("ROLLBACK");
          return { ok: false, status: STATUS.INVALID_TOKEN };
        }
        if (token.consumedAt) {
          if (typeof client.query === "function") await client.query("ROLLBACK");
          return { ok: false, status: STATUS.CONSUMED };
        }
        if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
          if (typeof client.query === "function") await client.query("ROLLBACK");
          return { ok: false, status: STATUS.EXPIRED };
        }

        const user = await authRepo.findUserById(client, token.userId);
        if (!user || String(user.status) !== "active") {
          if (typeof client.query === "function") await client.query("ROLLBACK");
          return { ok: false, status: STATUS.INVALID_TOKEN };
        }

        const passwordHash = await bcrypt.hash(passwordCheck.value, BCRYPT_ROUNDS);
        await authRepo.updateUserPasswordHash(client, String(user.id), passwordHash);
        await authRepo.clearPasswordRecoveryFlags(client, String(user.id));
        await tokenRepo.markConsumed(client, token.id);
        await tokenRepo.consumeActiveTokensForUserPurpose(client, {
          userId: String(user.id),
          purpose: PURPOSE,
        });

        // Invalidate deployment sessions for this user.
        await client.query(
          `UPDATE platform.deployment_sessions
              SET revoked_at = now()
            WHERE user_id = $1
              AND revoked_at IS NULL`,
          [String(user.id)]
        );

        if (typeof client.query === "function") await client.query("COMMIT");

        await recordBlessBoardAudit(db, {
          organizationId: token.organizationId || null,
          churchId: token.churchId || null,
          actorUserId: String(user.id),
          actionKey: "user.password_reset_completed",
          entityType: "user",
          entityId: String(user.id),
          outcome: "success",
          metadata: {
            token_id: token.id,
            source: "password_reset_token",
          },
        }).catch(() => null);

        return { ok: true, status: STATUS.OK };
      } catch (err) {
        if (typeof client.query === "function") {
          try {
            await client.query("ROLLBACK");
          } catch {
            /* ignore */
          }
        }
        throw err;
      }
    });
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR };
  }
}

/**
 * Inspect token for GET reset page (no consume).
 */
async function inspectPasswordResetToken(db, rawToken) {
  const token = String(rawToken || "").trim();
  if (!token || token.length < 20) {
    return { ok: false, status: STATUS.INVALID_TOKEN };
  }
  const row = await tokenRepo.findByTokenHash(db, hashSessionToken(token));
  if (!row || row.purpose !== PURPOSE) {
    return { ok: false, status: STATUS.INVALID_TOKEN };
  }
  if (row.consumedAt) return { ok: false, status: STATUS.CONSUMED };
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()) {
    return { ok: false, status: STATUS.EXPIRED };
  }
  return { ok: true, status: STATUS.OK, expiresAt: row.expiresAt };
}

module.exports = {
  STATUS,
  PURPOSE,
  TTL_MS,
  NEUTRAL_MESSAGE,
  DELIVERY_CODE,
  requestPasswordReset,
  platformAdminRequestPasswordReset,
  completePasswordReset,
  inspectPasswordResetToken,
  validatePassword,
};
