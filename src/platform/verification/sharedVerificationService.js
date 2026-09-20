"use strict";

/**
 * Shared email/phone verification for BlessBoard + ActiveClinic (V8).
 * Hashed OTP only. QA delivery via testing outbox. No OTP in production logs.
 */

const crypto = require("crypto");
const repo = require("../repositories/platformVerificationChallengeRepository");
const {
  CHANNEL,
  SUBJECT_KIND,
  VERIFICATION_STATUS,
  resolveVerificationPolicy,
  classifyVerificationStatus,
  evaluateVerificationGate,
} = require("./sharedVerificationPolicy");
const {
  isTestingDeliveryEnv,
  recordVerificationDelivery,
  peekVerificationCode,
} = require("./verificationTestingOutbox");
const { normalizeEmail } = require("../../blessboard/services/createBlessBoardUser");
const {
  normalizeBlessBoardPhone,
} = require("../../blessboard/services/normalizeBlessBoardPhone");
const {
  normalizeActiveClinicPhone,
} = require("../../activeclinic/services/normalizeActiveClinicContact");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  RATE_LIMITED: "rate_limited",
  NOT_FOUND: "not_found",
  EXPIRED: "expired",
  EXHAUSTED: "exhausted",
  INVALID_CODE: "invalid_code",
  MISMATCH: "account_mismatch",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
  DELIVERY_UNAVAILABLE: "delivery_unavailable",
});

function withClient(db, fn) {
  if (db && typeof db.query === "function" && typeof db.release === "function") {
    return fn(db);
  }
  if (db && typeof db.connect === "function") {
    return db.connect().then(async (client) => {
      try {
        return await fn(client);
      } finally {
        client.release();
      }
    });
  }
  return fn(db);
}

function otpPepper(env) {
  const source = env || process.env;
  return String(
    source.GETPRO_VERIFICATION_PEPPER ||
      source.BLESSBOARD_OTP_PEPPER ||
      source.SESSION_SECRET ||
      "getpro-verification-dev-pepper"
  ).trim();
}

function hashCode(code, pepper) {
  return crypto.createHmac("sha256", pepper).update(String(code)).digest("hex");
}

function generateNumericCode(length) {
  const len = Math.min(Math.max(Number(length) || 6, 4), 8);
  const max = 10 ** len;
  return String(crypto.randomInt(0, max)).padStart(len, "0");
}

function hashIp(ip) {
  const raw = String(ip || "").trim().slice(0, 128);
  if (!raw) return null;
  return crypto.createHash("sha256").update(`v8-verify-ip:${raw}`).digest("hex");
}

/**
 * Safe public challenge shape — never includes code/hash.
 */
function publicChallenge(row, policy) {
  if (!row) return null;
  const resendDelayMs = (policy.resendDelaySeconds || 45) * 1000;
  const lastSent = row.lastSentAt ? new Date(row.lastSentAt).getTime() : 0;
  return {
    id: row.id,
    channel: row.channel,
    purpose: row.purpose,
    status: row.status,
    productKey: row.productKey,
    identifierMasked: maskIdentifier(row.channel, row.identifierNormalized),
    expiresAt: row.expiresAt,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    resendAvailableAt:
      lastSent > 0 ? new Date(lastSent + resendDelayMs).toISOString() : null,
  };
}

function maskIdentifier(channel, identifier) {
  const raw = String(identifier || "");
  if (!raw) return null;
  if (channel === CHANNEL.EMAIL) {
    const [user, domain] = raw.split("@");
    if (!domain) return "***";
    const u = user.length <= 2 ? "*" : `${user.slice(0, 1)}***`;
    return `${u}@${domain}`;
  }
  if (raw.length < 8) return "***";
  return `${raw.slice(0, 6)}***${raw.slice(-2)}`;
}

function normalizeIdentifier(channel, raw, opts) {
  if (channel === CHANNEL.EMAIL) {
    const email = normalizeEmail(raw);
    if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) {
      return { ok: false, reason: "email" };
    }
    return { ok: true, normalized: email };
  }
  if (channel === CHANNEL.PHONE) {
    const productKey = opts && opts.productKey;
    if (productKey === "activeclinic") {
      const phone = normalizeActiveClinicPhone(raw, {
        country: opts && opts.country,
      });
      if (!phone.ok) return { ok: false, reason: "phone" };
      return { ok: true, normalized: phone.normalized };
    }
    const phone = normalizeBlessBoardPhone(raw, {
      country: opts && opts.country,
      defaultCountry: "ZM",
    });
    if (!phone.ok) return { ok: false, reason: "phone", message: phone.error };
    return { ok: true, normalized: phone.normalized };
  }
  return { ok: false, reason: "channel" };
}

/**
 * Load subject row and current verified_at for channel.
 */
async function loadSubject(db, input) {
  if (input.subjectKind === SUBJECT_KIND.PLATFORM_IDENTITY) {
    const r = await db.query(
      `SELECT id, phone_normalized, email_normalized,
              phone_verified_at, email_verified_at, status, created_at
         FROM platform.identities WHERE id = $1 LIMIT 1`,
      [input.subjectId]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      kind: SUBJECT_KIND.PLATFORM_IDENTITY,
      id: String(row.id),
      phoneNormalized: row.phone_normalized || null,
      emailNormalized: row.email_normalized || null,
      phoneVerifiedAt: row.phone_verified_at || null,
      emailVerifiedAt: row.email_verified_at || null,
      status: row.status,
      createdAt: row.created_at,
    };
  }
  if (input.subjectKind === SUBJECT_KIND.BLESSBOARD_USER) {
    const r = await db.query(
      `SELECT id, phone_normalized, email_normalized,
              phone_verified_at, email_verified_at, status, created_at
         FROM blessboard.users WHERE id = $1 LIMIT 1`,
      [input.subjectId]
    );
    const row = r.rows[0];
    if (!row) return null;
    return {
      kind: SUBJECT_KIND.BLESSBOARD_USER,
      id: String(row.id),
      phoneNormalized: row.phone_normalized || null,
      emailNormalized: row.email_normalized || null,
      phoneVerifiedAt: row.phone_verified_at || null,
      emailVerifiedAt: row.email_verified_at || null,
      status: row.status,
      createdAt: row.created_at,
    };
  }
  return null;
}

async function markSubjectChannelVerified(db, input) {
  if (input.subjectKind === SUBJECT_KIND.PLATFORM_IDENTITY) {
    if (input.channel === CHANNEL.PHONE) {
      await db.query(
        `UPDATE platform.identities
            SET phone_verified_at = now(), updated_at = now()
          WHERE id = $1
            AND phone_normalized = $2`,
        [input.subjectId, input.identifierNormalized]
      );
      return;
    }
    await db.query(
      `UPDATE platform.identities
          SET email_verified_at = now(), updated_at = now()
        WHERE id = $1
          AND email_normalized = $2`,
      [input.subjectId, input.identifierNormalized]
    );
    return;
  }
  if (input.channel === CHANNEL.PHONE) {
    await db.query(
      `UPDATE blessboard.users
          SET phone_verified_at = now(), updated_at = now()
        WHERE id = $1
          AND phone_normalized = $2`,
      [input.subjectId, input.identifierNormalized]
    );
    return;
  }
  await db.query(
    `UPDATE blessboard.users
        SET email_verified_at = now(), updated_at = now()
      WHERE id = $1
        AND email_normalized = $2`,
    [input.subjectId, input.identifierNormalized]
  );
}

function logVerificationTrace(fields) {
  // Never log OTP/code/token values.
  const payload = {
    event: "shared_verification",
    challengeId: fields.challengeId || null,
    channel: fields.channel || null,
    productKey: fields.productKey || null,
    subjectKind: fields.subjectKind || null,
    outcome: fields.outcome || null,
    rateLimited: Boolean(fields.rateLimited),
  };
  // eslint-disable-next-line no-console
  console.log(`[shared-verification] ${JSON.stringify(payload)}`);
}

/**
 * Start or resend a verification challenge bound to subject + identifier.
 */
async function startSharedVerification(db, input, env) {
  const source = env || process.env;
  const policy = resolveVerificationPolicy(source);
  const subjectKind = String((input && input.subjectKind) || "").trim();
  const subjectId = String((input && input.subjectId) || "").trim();
  const productKey = String((input && input.productKey) || "").trim();
  const channel = String((input && input.channel) || "").trim();
  const purpose = String((input && input.purpose) || "account_verification").trim();
  const ipHash = hashIp(input && input.requestIp);

  if (
    !subjectId ||
    (subjectKind !== SUBJECT_KIND.PLATFORM_IDENTITY &&
      subjectKind !== SUBJECT_KIND.BLESSBOARD_USER)
  ) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "subject" };
  }
  if (channel !== CHANNEL.PHONE && channel !== CHANNEL.EMAIL) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "channel" };
  }
  if (!["blessboard", "activeclinic", "platform"].includes(productKey)) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: "product" };
  }

  const identifier = normalizeIdentifier(channel, input && input.identifier, {
    productKey,
    country: input && input.country,
  });
  if (!identifier.ok) {
    return { ok: false, code: RESULT.INVALID_INPUT, reason: identifier.reason };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const subject = await loadSubject(client, { subjectKind, subjectId });
        if (!subject) {
          await client.query("ROLLBACK");
          return { ok: false, code: RESULT.NOT_FOUND, reason: "subject" };
        }

        const bound =
          channel === CHANNEL.PHONE
            ? subject.phoneNormalized
            : subject.emailNormalized;
        if (!bound || bound !== identifier.normalized) {
          await client.query("ROLLBACK");
          return { ok: false, code: RESULT.MISMATCH, reason: "identifier_not_bound" };
        }

        if (ipHash) {
          const ipLimit = await repo.consumeRateLimitSlot(client, {
            scopeKind: "ip",
            scopeKey: ipHash,
            windowMs: 60 * 60 * 1000,
            maxAttempts: policy.ipHourlyCap,
          });
          if (ipLimit.limited) {
            await client.query("COMMIT");
            logVerificationTrace({
              channel,
              productKey,
              subjectKind,
              outcome: "rate_limited_ip",
              rateLimited: true,
            });
            return { ok: false, code: RESULT.RATE_LIMITED, reason: "ip_cap" };
          }
        }

        const idLimit = await repo.consumeRateLimitSlot(client, {
          scopeKind: "identifier",
          scopeKey: `${channel}:${identifier.normalized}`,
          windowMs: 60 * 60 * 1000,
          maxAttempts: policy.identifierHourlyCap,
        });
        if (idLimit.limited) {
          await client.query("COMMIT");
          return { ok: false, code: RESULT.RATE_LIMITED, reason: "identifier_cap" };
        }

        const subjectLimit = await repo.consumeRateLimitSlot(client, {
          scopeKind: "subject",
          scopeKey: `${subjectKind}:${subjectId}`,
          windowMs: 60 * 60 * 1000,
          maxAttempts: policy.subjectHourlyCap,
        });
        if (subjectLimit.limited) {
          await client.query("COMMIT");
          return { ok: false, code: RESULT.RATE_LIMITED, reason: "subject_cap" };
        }

        const existing = await repo.findLatestPending(client, {
          subjectKind,
          subjectId,
          channel,
          purpose,
        });
        if (existing) {
          const elapsed =
            Date.now() - new Date(existing.lastSentAt || existing.createdAt).getTime();
          if (elapsed < policy.resendDelaySeconds * 1000) {
            await client.query("COMMIT");
            return {
              ok: false,
              code: RESULT.RATE_LIMITED,
              reason: "resend_cooldown",
              challenge: publicChallenge(existing, policy),
            };
          }
        }

        // Cancel concurrent pending challenges for this subject+channel+purpose.
        await repo.cancelPendingForSubject(client, {
          subjectKind,
          subjectId,
          channel,
          purpose,
        });

        const code = generateNumericCode(policy.codeLength);
        const codeHash = hashCode(code, otpPepper(source));
        const expiresAt = new Date(
          Date.now() + policy.ttlSeconds * 1000
        ).toISOString();

        const deliveryProvider = isTestingDeliveryEnv(source)
          ? "testing_outbox"
          : "unavailable";

        const challenge = await repo.insertChallenge(client, {
          subjectKind,
          subjectId,
          productKey,
          channel,
          purpose,
          identifierNormalized: identifier.normalized,
          codeHash,
          maxAttempts: policy.maxAttempts,
          expiresAt,
          requestIpHash: ipHash,
          deliveryProvider,
          metadataJson: {
            source: input && input.source ? String(input.source).slice(0, 64) : null,
          },
        });

        let delivered = false;
        if (deliveryProvider === "testing_outbox") {
          const recorded = recordVerificationDelivery(
            {
              challengeId: challenge.id,
              code,
              channel,
              productKey,
              subjectKind,
              subjectId,
              identifierNormalized: identifier.normalized,
              expiresAt,
            },
            source
          );
          delivered = Boolean(recorded.recorded);
        }

        await client.query("COMMIT");
        logVerificationTrace({
          challengeId: challenge.id,
          channel,
          productKey,
          subjectKind,
          outcome: delivered ? "started_delivered" : "started_undelivered",
        });

        return {
          ok: true,
          code: RESULT.OK,
          challenge: publicChallenge(challenge, policy),
          delivered,
          deliveryProvider,
          // Test-only peek helper is separate; never return code here.
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
  } catch {
    return { ok: false, code: RESULT.LOOKUP_ERROR };
  }
}

/**
 * Verify a code for a challenge. Bound to subject + identifier.
 */
async function completeSharedVerification(db, input, env) {
  const source = env || process.env;
  const policy = resolveVerificationPolicy(source);
  const challengeId = String((input && input.challengeId) || "").trim();
  const rawCode = String((input && input.code) || "").trim();
  const subjectKind = String((input && input.subjectKind) || "").trim();
  const subjectId = String((input && input.subjectId) || "").trim();

  if (!challengeId || !rawCode || !subjectId || !subjectKind) {
    return { ok: false, code: RESULT.INVALID_INPUT };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const challenge = await repo.findById(client, challengeId, {
          forUpdate: true,
        });
        if (!challenge || challenge.status !== "pending") {
          await client.query("ROLLBACK");
          if (challenge && challenge.status === "exhausted") {
            return { ok: false, code: RESULT.EXHAUSTED };
          }
          if (challenge && challenge.status === "expired") {
            return { ok: false, code: RESULT.EXPIRED };
          }
          return { ok: false, code: RESULT.NOT_FOUND };
        }
        if (
          challenge.subjectKind !== subjectKind ||
          challenge.subjectId !== subjectId
        ) {
          await client.query("ROLLBACK");
          return { ok: false, code: RESULT.MISMATCH };
        }
        if (
          challenge.expiresAt &&
          new Date(challenge.expiresAt).getTime() <= Date.now()
        ) {
          await repo.markExpired(client, challenge.id);
          await client.query("COMMIT");
          return { ok: false, code: RESULT.EXPIRED };
        }

        const expected = hashCode(rawCode, otpPepper(source));
        if (expected !== challenge.codeHash) {
          const updated = await repo.recordFailedAttempt(client, challenge.id);
          await client.query("COMMIT");
          logVerificationTrace({
            challengeId,
            channel: challenge.channel,
            productKey: challenge.productKey,
            subjectKind,
            outcome: "invalid_code",
          });
          if (updated && updated.status === "exhausted") {
            return { ok: false, code: RESULT.EXHAUSTED };
          }
          return {
            ok: false,
            code: RESULT.INVALID_CODE,
            challenge: publicChallenge(updated || challenge, policy),
          };
        }

        const verified = await repo.markVerified(client, challenge.id);
        if (!verified) {
          await client.query("ROLLBACK");
          return { ok: false, code: RESULT.NOT_FOUND };
        }

        await markSubjectChannelVerified(client, {
          subjectKind,
          subjectId,
          channel: challenge.channel,
          identifierNormalized: challenge.identifierNormalized,
        });

        // Invalidate concurrent pending challenges for same subject/channel.
        await repo.cancelPendingForSubject(client, {
          subjectKind,
          subjectId,
          channel: challenge.channel,
          purpose: challenge.purpose,
        });

        await client.query("COMMIT");
        logVerificationTrace({
          challengeId,
          channel: challenge.channel,
          productKey: challenge.productKey,
          subjectKind,
          outcome: "verified",
        });
        return {
          ok: true,
          code: RESULT.OK,
          challenge: publicChallenge(verified, policy),
          channel: challenge.channel,
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
  } catch {
    return { ok: false, code: RESULT.LOOKUP_ERROR };
  }
}

/**
 * Status + enforcement gate for a subject channel.
 */
async function getSharedVerificationStatus(db, input, env) {
  const policy = resolveVerificationPolicy(env || process.env);
  const subject = await loadSubject(db, {
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
  });
  if (!subject) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  const channel = String(input.channel || CHANNEL.PHONE);
  const identifierPresent =
    channel === CHANNEL.PHONE
      ? Boolean(subject.phoneNormalized)
      : Boolean(subject.emailNormalized);
  const verifiedAt =
    channel === CHANNEL.PHONE ? subject.phoneVerifiedAt : subject.emailVerifiedAt;
  const status = classifyVerificationStatus({
    identifierPresent,
    verifiedAt,
  });
  const gate = evaluateVerificationGate({
    status,
    enforcement: policy.enforcement,
    action: input.action || "login",
  });
  return {
    ok: true,
    code: RESULT.OK,
    channel,
    status,
    verifiedAt: verifiedAt || null,
    identifierMasked: maskIdentifier(
      channel,
      channel === CHANNEL.PHONE ? subject.phoneNormalized : subject.emailNormalized
    ),
    enforcement: policy.enforcement,
    gate,
  };
}

/**
 * Testing-only code peek. Refuses outside testing env.
 */
function peekSharedVerificationCodeForTests(challengeId, env) {
  if (!isTestingDeliveryEnv(env || process.env)) {
    return { ok: false, code: RESULT.FORBIDDEN };
  }
  const code = peekVerificationCode(challengeId);
  if (!code) return { ok: false, code: RESULT.NOT_FOUND };
  return { ok: true, code: RESULT.OK, verificationCode: code };
}

module.exports = {
  RESULT,
  CHANNEL,
  SUBJECT_KIND,
  VERIFICATION_STATUS,
  startSharedVerification,
  completeSharedVerification,
  getSharedVerificationStatus,
  peekSharedVerificationCodeForTests,
  publicChallenge,
  normalizeIdentifier,
  evaluateVerificationGate,
  resolveVerificationPolicy,
};
