"use strict";

/**
 * ActiveClinic password recovery for platform identities (AC-V6-09).
 * Enumeration-safe public responses. Tokens hashed. Delivery optional.
 */

const crypto = require("crypto");
const tokenRepo = require("../../platform/repositories/platformIdentityActionTokenRepository");
const identityRepo = require("../../platform/repositories/platformIdentityRepository");
const staffRepo = require("../repositories/staffMemberRepository");
const { hashSessionToken } = require("../../platform/session/sessionToken");
const {
  revokeSessionsByPlatformIdentity,
} = require("../../platform/session/revokeV5Session");
const {
  setPlatformIdentityPassword,
  validatePasswordPolicy,
  RESULT: CRED_RESULT,
} = require("../../platform/services/platformIdentityCredentialService");
const {
  isIdentityUsable,
  mapIdentity,
} = require("../../platform/services/platformIdentityService");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  normalizeActiveClinicPhone,
  normalizeActiveClinicEmail,
} = require("./normalizeActiveClinicContact");
const {
  buildResetPasswordUrl,
  DELIVERY,
  resolvePublicOrigin,
} = require("./activeClinicShareLinks");

const PURPOSE_RESET = "activeclinic_password_reset";
const PRODUCT_KEY = "activeclinic";
const TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_IDENTIFIER = 5;
const RATE_MAX_IP = 20;

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_TOKEN: "invalid_token",
  EXPIRED: "expired",
  REVOKED: "revoked",
  CONSUMED: "consumed",
  WEAK_PASSWORD: "weak_password",
  MISMATCH: "mismatch",
  FORBIDDEN: "forbidden",
  STAFF_NOT_FOUND: "staff_not_found",
  NOT_ELIGIBLE: "not_eligible",
});

const NEUTRAL_MESSAGE =
  "If an eligible ActiveClinic account exists for that phone or email, reset instructions are available to authorized administrators when delivery is configured.";

/**
 * Safe structured recovery observability. Never logs tokens, passwords, or full contacts.
 * @param {Record<string, unknown>} fields
 */
function logPasswordRecoveryTrace(fields) {
  const payload = {
    event: "activeclinic_password_recovery",
    requestId: fields && fields.requestId != null ? String(fields.requestId).slice(0, 64) : null,
    identifierType: fields && fields.identifierType ? String(fields.identifierType).slice(0, 16) : null,
    identityFound: Boolean(fields && fields.identityFound),
    tokenGenerated: Boolean(fields && fields.tokenGenerated),
    adapterSelected: fields && fields.adapterSelected != null ? String(fields.adapterSelected).slice(0, 40) : null,
    deliveryOutcome:
      fields && fields.deliveryOutcome != null ? String(fields.deliveryOutcome).slice(0, 40) : null,
    rateLimited: Boolean(fields && fields.rateLimited),
  };
  console.log(`[activeclinic-password-recovery] ${JSON.stringify(payload)}`);
}

function generateRawToken() {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  return { rawToken, tokenHash: hashSessionToken(rawToken) };
}

function hashIp(ip) {
  const raw = String(ip || "").trim().slice(0, 128);
  if (!raw) return null;
  return crypto.createHash("sha256").update(`ac-reset-ip:${raw}`).digest("hex");
}

function hashIdentifier(value) {
  return crypto
    .createHash("sha256")
    .update(`ac-reset-id:${String(value || "")}`)
    .digest("hex");
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

function parseIdentifier(raw, options) {
  const opts = options && typeof options === "object" ? options : {};
  const text = String(raw || "").trim();
  if (!text) return { kind: null, normalized: null };
  if (text.includes("@")) {
    const email = normalizeActiveClinicEmail(text);
    if (!email.ok) return { kind: "email", normalized: null, invalid: true };
    return { kind: "email", normalized: email.normalized };
  }
  const phone = normalizeActiveClinicPhone(text, {
    country: opts.country || opts.phoneCountry || null,
    clinicDefaultCountry: opts.clinicDefaultCountry || null,
    defaultCountry: opts.defaultCountry || "ZM",
  });
  if (!phone.ok) return { kind: "phone", normalized: null, invalid: true };
  return { kind: "phone", normalized: phone.normalized };
}

async function findEligibleIdentityForReset(db, identifier) {
  const rows = await identityRepo.findIdentitiesByNormalizedContact(db, {
    phoneNormalized: identifier.kind === "phone" ? identifier.normalized : null,
    emailNormalized: identifier.kind === "email" ? identifier.normalized : null,
  });
  if (!rows.length || rows.length > 1) return null;
  const row = rows[0];
  if (!isIdentityUsable(row)) return null;
  if (!row.password_hash) return null;

  const staffRows = await staffRepo.listByPlatformIdentity(db, row.id);
  const eligibleStaff = staffRows.filter((s) =>
    ["active", "invited", "inactive"].includes(String(s.status))
  );
  if (!eligibleStaff.length) return null;

  return { identity: mapIdentity(row), staffRows: eligibleStaff };
}

/**
 * Public forgot-password. Always neutral. Does not expose reset link.
 */
async function requestActiveClinicPasswordReset(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const deploymentCode = src.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;
  const requestId = src.requestId || null;
  const identifier = parseIdentifier(src.identifier || src.phone || src.email, {
    country: src.country || src.phoneCountry || src.phone_country || null,
  });
  const ipHash = hashIp(src.requestIp);
  // Public forgot-password does not send mail yet (delivery deferred). Adapter stays unavailable.
  const adapterSelected = "unavailable";

  const neutral = {
    ok: true,
    code: RESULT.OK,
    message: NEUTRAL_MESSAGE,
    sent: false,
    deliveryStatus: DELIVERY.UNAVAILABLE,
  };

  if (!identifier.normalized || identifier.invalid) {
    logPasswordRecoveryTrace({
      requestId,
      identifierType: identifier.kind || "unknown",
      identityFound: false,
      tokenGenerated: false,
      adapterSelected,
      deliveryOutcome: "skipped_invalid_identifier",
    });
    return neutral;
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      if (ipHash) {
        const ipLimit = await tokenRepo.consumeRateLimitSlot(client, {
          scopeKind: "ip",
          scopeKey: ipHash,
          windowMs: RATE_WINDOW_MS,
          maxAttempts: RATE_MAX_IP,
        });
        if (ipLimit.limited) {
          await client.query("COMMIT");
          logPasswordRecoveryTrace({
            requestId,
            identifierType: identifier.kind,
            identityFound: false,
            tokenGenerated: false,
            adapterSelected,
            deliveryOutcome: "rate_limited",
            rateLimited: true,
          });
          return { ...neutral, rateLimited: true };
        }
      }

      const idLimit = await tokenRepo.consumeRateLimitSlot(client, {
        scopeKind: "identifier",
        scopeKey: hashIdentifier(identifier.normalized),
        windowMs: RATE_WINDOW_MS,
        maxAttempts: RATE_MAX_IDENTIFIER,
      });
      if (idLimit.limited) {
        await client.query("COMMIT");
        logPasswordRecoveryTrace({
          requestId,
          identifierType: identifier.kind,
          identityFound: false,
          tokenGenerated: false,
          adapterSelected,
          deliveryOutcome: "rate_limited",
          rateLimited: true,
        });
        return { ...neutral, rateLimited: true };
      }

      const eligible = await findEligibleIdentityForReset(client, identifier);
      if (!eligible) {
        await recordAuditEventSafe(client, {
          deploymentCode,
          organizationId: null,
          actorUserId: null,
          actionKey: "activeclinic.password_reset.requested",
          entityType: "platform_identity",
          entityId: null,
          outcome: "success",
          metadataJson: {
            actor_kind: "public",
            eligible: false,
            channel: identifier.kind,
          },
        });
        await client.query("COMMIT");
        logPasswordRecoveryTrace({
          requestId,
          identifierType: identifier.kind,
          identityFound: false,
          tokenGenerated: false,
          adapterSelected,
          deliveryOutcome: "skipped_unknown_or_ineligible",
        });
        return neutral;
      }

      await tokenRepo.revokeActiveTokens(client, {
        platformIdentityId: eligible.identity.id,
        purpose: PURPOSE_RESET,
        deploymentCode,
      });

      const { rawToken, tokenHash } = generateRawToken();
      const expiresAt = new Date(Date.now() + TTL_MS);
      const primaryStaff = eligible.staffRows[0];
      await tokenRepo.insertActionToken(client, {
        platformIdentityId: eligible.identity.id,
        purpose: PURPOSE_RESET,
        tokenHash,
        expiresAt,
        createdByPlatformIdentityId: null,
        deploymentCode,
        productKey: PRODUCT_KEY,
        organizationId: primaryStaff.organization_id,
        staffMemberId: primaryStaff.id,
        requestIpHash: ipHash,
        metadataJson: { channel: identifier.kind },
      });

      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId: primaryStaff.organization_id,
        actorUserId: null,
        actionKey: "activeclinic.password_reset.requested",
        entityType: "platform_identity",
        entityId: eligible.identity.id,
        outcome: "success",
        metadataJson: {
          actor_kind: "public",
          eligible: true,
          channel: identifier.kind,
          delivery: DELIVERY.UNAVAILABLE,
        },
      });
      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId: primaryStaff.organization_id,
        actorUserId: null,
        actionKey: "activeclinic.delivery.unavailable",
        entityType: "platform_identity",
        entityId: eligible.identity.id,
        outcome: "success",
        metadataJson: { actor_kind: "system", purpose: PURPOSE_RESET },
      });

      await client.query("COMMIT");

      // Public path never returns the raw token. Outbound email/SMS not wired yet.
      void rawToken;
      logPasswordRecoveryTrace({
        requestId,
        identifierType: identifier.kind,
        identityFound: true,
        tokenGenerated: true,
        adapterSelected,
        deliveryOutcome: DELIVERY.UNAVAILABLE,
      });
      return {
        ...neutral,
        deliveryStatus: DELIVERY.UNAVAILABLE,
      };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}

/**
 * Authorized admin/testing recovery link issuance. Returns raw token to caller.
 */
async function issueAdminPasswordResetLink(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const organizationId = String(src.organizationId || "").trim();
  const staffMemberId = String(src.staffMemberId || "").trim();
  const deploymentCode = src.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;
  if (!organizationId || !staffMemberId) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const staffRow = await staffRepo.findByIdAndOrganization(client, {
        id: staffMemberId,
        organizationId,
      });
      if (!staffRow || !staffRow.platform_identity_id) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.STAFF_NOT_FOUND };
      }

      const identityRow = await identityRepo.findIdentityById(
        client,
        staffRow.platform_identity_id
      );
      if (!identityRow || !isIdentityUsable(identityRow) || !identityRow.password_hash) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.NOT_ELIGIBLE };
      }

      await tokenRepo.revokeActiveTokens(client, {
        platformIdentityId: identityRow.id,
        purpose: PURPOSE_RESET,
        deploymentCode,
      });

      const { rawToken, tokenHash } = generateRawToken();
      const expiresAt = new Date(Date.now() + TTL_MS);
      const token = await tokenRepo.insertActionToken(client, {
        platformIdentityId: identityRow.id,
        purpose: PURPOSE_RESET,
        tokenHash,
        expiresAt,
        createdByPlatformIdentityId: src.actorPlatformIdentityId || null,
        deploymentCode,
        productKey: PRODUCT_KEY,
        organizationId,
        staffMemberId,
        requestIpHash: hashIp(src.requestIp),
        metadataJson: { issued_by: "admin" },
      });

      const resetUrl = buildResetPasswordUrl({
        rawToken,
        env: src.env,
        deploymentCode,
        publicOrigin: src.publicOrigin,
      });

      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId,
        actorUserId: null,
        actionKey: "activeclinic.password_reset.admin_issued",
        entityType: "platform_identity",
        entityId: identityRow.id,
        outcome: "success",
        metadataJson: {
          actor_kind: "admin",
          staff_member_id: staffMemberId,
          delivery: DELIVERY.LINK_GENERATED,
        },
      });

      await client.query("COMMIT");
      return {
        ok: true,
        code: RESULT.OK,
        tokenId: token.id,
        rawToken,
        resetUrl,
        expiresAt,
        deliveryStatus: DELIVERY.LINK_GENERATED,
        share: {
          resetUrl,
          copyText: resetUrl,
          whatsappUrl: staffRow.phone_normalized
            ? require("./activeClinicShareLinks").buildWhatsAppShareUrl({
                phoneE164: staffRow.phone_normalized,
                message: `Reset your ActiveClinic password using this secure link: ${resetUrl}`,
              })
            : null,
          mailtoUrl: staffRow.email_normalized
            ? `mailto:${encodeURIComponent(
                staffRow.email_normalized
              )}?subject=${encodeURIComponent(
                "ActiveClinic password reset"
              )}&body=${encodeURIComponent(
                `Reset your ActiveClinic password using this secure link: ${resetUrl}`
              )}`
            : null,
          hasPhone: Boolean(staffRow.phone_normalized),
          hasEmail: Boolean(staffRow.email_normalized),
        },
      };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}

function classifyResetToken(token, expectedDeploymentCode) {
  if (!token) return { ok: false, code: RESULT.INVALID_TOKEN };
  if (token.purpose !== PURPOSE_RESET) {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }
  if (token.productKey !== "activeclinic") {
    return { ok: false, code: RESULT.INVALID_TOKEN };
  }
  if (
    expectedDeploymentCode &&
    token.deploymentCode !== expectedDeploymentCode
  ) {
    return { ok: false, code: RESULT.FORBIDDEN };
  }
  if (token.revokedAt) return { ok: false, code: RESULT.REVOKED, token };
  if (token.consumedAt) return { ok: false, code: RESULT.CONSUMED, token };
  if (token.expiresAt && new Date(token.expiresAt).getTime() <= Date.now()) {
    return { ok: false, code: RESULT.EXPIRED, token };
  }
  return { ok: true, code: RESULT.OK, token };
}

async function previewResetToken(db, input) {
  const rawToken = String((input && input.rawToken) || "").trim();
  const deploymentCode =
    (input && input.deploymentCode) || CODE_ACTIVECLINIC_ORG_V6;
  if (!rawToken) return { ok: false, code: RESULT.INVALID_TOKEN };
  const token = await tokenRepo.findByTokenHash(db, hashSessionToken(rawToken));
  const classified = classifyResetToken(token, deploymentCode);
  if (!classified.ok) return { ok: false, code: classified.code };
  return {
    ok: true,
    code: RESULT.OK,
    preview: {
      purpose: "Reset your ActiveClinic password",
      expiresAt: token.expiresAt,
    },
  };
}

async function completeActiveClinicPasswordReset(db, input) {
  const src = input && typeof input === "object" ? input : {};
  const rawToken = String(src.rawToken || "").trim();
  const deploymentCode = src.deploymentCode || CODE_ACTIVECLINIC_ORG_V6;
  if (!rawToken) return { ok: false, code: RESULT.INVALID_TOKEN };
  if (src.password !== src.passwordConfirm) {
    return { ok: false, code: RESULT.MISMATCH };
  }
  const policy = validatePasswordPolicy(src.password);
  if (!policy.ok) return { ok: false, code: RESULT.WEAK_PASSWORD };

  return withClient(db, async (client) => {
    await client.query("BEGIN");
    try {
      const token = await tokenRepo.findByTokenHash(
        client,
        hashSessionToken(rawToken)
      );
      const classified = classifyResetToken(token, deploymentCode);
      if (!classified.ok) {
        await client.query("ROLLBACK");
        return { ok: false, code: classified.code };
      }

      const consumed = await tokenRepo.markConsumed(client, token.id);
      if (!consumed) {
        await client.query("ROLLBACK");
        return { ok: false, code: RESULT.CONSUMED };
      }

      const pw = await setPlatformIdentityPassword(client, {
        identityId: token.platformIdentityId,
        password: policy.value,
        mustChangePassword: false,
      });
      if (!pw.ok) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          code:
            pw.code === CRED_RESULT.WEAK_PASSWORD
              ? RESULT.WEAK_PASSWORD
              : RESULT.INVALID_INPUT,
        };
      }

      const revoked = await revokeSessionsByPlatformIdentity(client, {
        platformIdentityId: token.platformIdentityId,
        deploymentCode,
      });

      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId: token.organizationId || null,
        actorUserId: null,
        actionKey: "activeclinic.password_reset.completed",
        entityType: "platform_identity",
        entityId: token.platformIdentityId,
        outcome: "success",
        metadataJson: {
          actor_kind: "invitee",
          sessions_revoked: revoked.revokedCount || 0,
        },
      });
      await recordAuditEventSafe(client, {
        deploymentCode,
        organizationId: token.organizationId || null,
        actorUserId: null,
        actionKey: "activeclinic.sessions.revoked",
        entityType: "platform_identity",
        entityId: token.platformIdentityId,
        outcome: "success",
        metadataJson: {
          actor_kind: "system",
          reason: "password_reset",
          revoked_count: revoked.revokedCount || 0,
        },
      });

      await client.query("COMMIT");
      return {
        ok: true,
        code: RESULT.OK,
        identity: pw.identity,
        sessionsRevoked: revoked.revokedCount || 0,
        redirectTo: "/reset-password/success",
      };
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  });
}

module.exports = {
  RESULT,
  PURPOSE_RESET,
  TTL_MS,
  NEUTRAL_MESSAGE,
  requestActiveClinicPasswordReset,
  issueAdminPasswordResetLink,
  previewResetToken,
  completeActiveClinicPasswordReset,
  resolvePublicOrigin,
};
