"use strict";

/**
 * Provider-neutral BlessBoard OTP service (Prompt 11F).
 * Stores hashed codes only. Test provider never loads in production.
 */

const crypto = require("crypto");
const { normalizeBlessBoardPhone } = require("../normalizeBlessBoardPhone");
const { isOtpPurpose } = require("./otpPurposes");
const { resolveOtpProvider } = require("./otpProviders");
const { peekTestCode } = require("./otpProviders/testProvider");
const repo = require("../../repositories/blessBoardOtpRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  RATE_LIMITED: "rate_limited",
  PROVIDER_ERROR: "provider_error",
  NOT_FOUND: "not_found",
  EXPIRED: "expired",
  CANCELLED: "cancelled",
  EXHAUSTED: "exhausted",
  INVALID_CODE: "invalid_code",
  PURPOSE_MISMATCH: "purpose_mismatch",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const DEFAULTS = Object.freeze({
  codeLength: 6,
  ttlSeconds: 5 * 60,
  resendDelaySeconds: 30,
  maxAttempts: 5,
  dailySendCap: 10,
  perPhoneHourlyCap: 5,
  perIpHourlyCap: 20,
  perOrgHourlyCap: 100,
});

function readInt(env, key, fallback) {
  const raw = env && env[key] != null ? String(env[key]).trim() : "";
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function policyFromEnv(env) {
  const e = env || process.env;
  return {
    codeLength: readInt(e, "BLESSBOARD_OTP_CODE_LENGTH", DEFAULTS.codeLength),
    ttlSeconds: readInt(e, "BLESSBOARD_OTP_TTL_SECONDS", DEFAULTS.ttlSeconds),
    resendDelaySeconds: readInt(
      e,
      "BLESSBOARD_OTP_RESEND_DELAY_SECONDS",
      DEFAULTS.resendDelaySeconds
    ),
    maxAttempts: readInt(e, "BLESSBOARD_OTP_MAX_ATTEMPTS", DEFAULTS.maxAttempts),
    dailySendCap: readInt(e, "BLESSBOARD_OTP_DAILY_SEND_CAP", DEFAULTS.dailySendCap),
    perPhoneHourlyCap: readInt(
      e,
      "BLESSBOARD_OTP_PHONE_HOURLY_CAP",
      DEFAULTS.perPhoneHourlyCap
    ),
    perIpHourlyCap: readInt(e, "BLESSBOARD_OTP_IP_HOURLY_CAP", DEFAULTS.perIpHourlyCap),
    perOrgHourlyCap: readInt(e, "BLESSBOARD_OTP_ORG_HOURLY_CAP", DEFAULTS.perOrgHourlyCap),
    countryAllowList: String(e.BLESSBOARD_OTP_COUNTRY_ALLOWLIST || "ZM")
      .split(",")
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean),
  };
}

function otpPepper(env) {
  const e = env || process.env;
  const pepper = String(e.BLESSBOARD_OTP_PEPPER || e.SESSION_SECRET || "blessboard-otp-dev-pepper")
    .trim();
  return pepper;
}

function hashOtpCode(code, pepper) {
  return crypto.createHmac("sha256", pepper).update(String(code)).digest("hex");
}

function generateNumericCode(length) {
  const len = Math.min(Math.max(Number(length) || 6, 4), 8);
  const max = 10 ** len;
  const n = crypto.randomInt(0, max);
  return String(n).padStart(len, "0");
}

function phoneCountryAllowed(normalizedPhone, allowList) {
  if (!allowList || allowList.length === 0) return true;
  // Modest prefix map for foundation allow-list.
  const prefixes = {
    ZM: "+260",
    ZA: "+27",
    KE: "+254",
    NG: "+234",
    GB: "+44",
    US: "+1",
  };
  return allowList.some((cc) => {
    const p = prefixes[cc];
    return p && String(normalizedPhone).startsWith(p);
  });
}

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function publicChallenge(row) {
  if (!row) return null;
  return {
    id: row.id,
    purpose: row.purpose,
    status: row.status,
    normalizedPhoneMasked: row.normalizedPhone
      ? `${row.normalizedPhone.slice(0, 6)}***${row.normalizedPhone.slice(-2)}`
      : null,
    expiresAt: row.expiresAt,
    attemptCount: row.attemptCount,
    maxAttempts: row.maxAttempts,
    resendAvailableAt:
      row.lastSentAt &&
      new Date(new Date(row.lastSentAt).getTime() + DEFAULTS.resendDelaySeconds * 1000).toISOString(),
  };
}

/**
 * Start a purpose-bound OTP challenge.
 */
async function startVerification(db, input, env) {
  const e = env || process.env;
  const policy = policyFromEnv(e);
  const purpose = String((input && input.purpose) || "").trim();
  if (!isOtpPurpose(purpose)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "purpose" };
  }

  const phone = normalizeBlessBoardPhone(input && input.phone, {
    country: input && input.country,
    defaultCountry: "ZM",
  });
  if (!phone.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "phone", message: phone.error };
  }
  if (!phoneCountryAllowed(phone.normalized, policy.countryAllowList)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "country_not_allowed" };
  }

  const organizationId =
    input && input.organizationId != null && String(input.organizationId).trim()
      ? String(input.organizationId).trim()
      : null;
  const userId =
    input && input.userId != null && String(input.userId).trim()
      ? String(input.userId).trim()
      : null;
  const requestIp = input && input.requestIp != null ? String(input.requestIp).slice(0, 80) : null;
  const sessionFingerprint =
    input && input.sessionFingerprint != null
      ? String(input.sessionFingerprint).slice(0, 128)
      : null;

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const existing = await repo.findLatestPending(client, {
          normalizedPhone: phone.normalized,
          purpose,
          organizationId,
        });
        if (existing) {
          const elapsed =
            Date.now() - new Date(existing.lastSentAt || existing.createdAt).getTime();
          if (elapsed < policy.resendDelaySeconds * 1000) {
            await client.query("ROLLBACK");
            return {
              ok: false,
              status: STATUS.RATE_LIMITED,
              reason: "resend_cooldown",
              challenge: publicChallenge(existing),
            };
          }
          await repo.markCancelled(client, existing.id);
        }

        const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const hourly = await repo.countSentSince(client, {
          normalizedPhone: phone.normalized,
          organizationId,
          requestIp,
          purpose,
          since: hourAgo,
        });
        const daily = await repo.countSentSince(client, {
          normalizedPhone: phone.normalized,
          organizationId,
          requestIp,
          purpose,
          since: dayAgo,
        });
        if (Number(daily.phone_count) >= policy.dailySendCap) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.RATE_LIMITED, reason: "daily_cap" };
        }
        if (Number(hourly.phone_count) >= policy.perPhoneHourlyCap) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.RATE_LIMITED, reason: "phone_hourly_cap" };
        }
        if (requestIp && Number(hourly.ip_count) >= policy.perIpHourlyCap) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.RATE_LIMITED, reason: "ip_hourly_cap" };
        }
        if (organizationId && Number(hourly.org_count) >= policy.perOrgHourlyCap) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.RATE_LIMITED, reason: "org_hourly_cap" };
        }

        const provider = resolveOtpProvider(e);
        const code = generateNumericCode(policy.codeLength);
        const codeHash = hashOtpCode(code, otpPepper(e));
        const expiresAt = new Date(Date.now() + policy.ttlSeconds * 1000).toISOString();

        const row = await repo.insertVerification(client, {
          organizationId,
          userId,
          normalizedPhone: phone.normalized,
          purpose,
          provider: provider.name,
          codeHash,
          maxAttempts: policy.maxAttempts,
          expiresAt,
          requestIp,
          sessionFingerprint,
        });

        const sent = await provider.send({
          verificationId: row.id,
          normalizedPhone: phone.normalized,
          code,
          purpose,
        });
        if (!sent || !sent.ok) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.PROVIDER_ERROR,
            reason: (sent && sent.reason) || "send_failed",
          };
        }
        if (sent.providerVerificationId) {
          await repo.updateProviderId(client, row.id, sent.providerVerificationId);
        }

        await client.query("COMMIT");

        const result = {
          ok: true,
          status: STATUS.OK,
          challenge: publicChallenge(row),
        };
        // Expose test code only through explicit test helper — never in normal result.
        if (provider.name === "test" && e.BLESSBOARD_OTP_EXPOSE_TEST_CODE === "1") {
          result.testCode = peekTestCode(row.id);
        }
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    if (err && err.code === "test_provider_production_guard") {
      return { ok: false, status: STATUS.FORBIDDEN, reason: "test_provider_production_guard" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

async function checkVerification(db, input, env) {
  const e = env || process.env;
  const verificationId = String((input && input.verificationId) || "").trim();
  const purpose = String((input && input.purpose) || "").trim();
  const code = String((input && input.code) || "").trim();
  if (!verificationId || !purpose || !code) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (!isOtpPurpose(purpose)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "purpose" };
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const row = await repo.findById(client, verificationId, { forUpdate: true });
        if (!row) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
        }
        if (row.purpose !== purpose) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.PURPOSE_MISMATCH, reason: "purpose_mismatch" };
        }
        if (row.status === "cancelled") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.CANCELLED, reason: "cancelled" };
        }
        if (row.status === "exhausted") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.EXHAUSTED, reason: "exhausted" };
        }
        if (row.status === "verified") {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.INVALID_CODE, reason: "already_used" };
        }
        if (row.status !== "pending" || new Date(row.expiresAt).getTime() <= Date.now()) {
          await repo.markExpired(client, row.id);
          await client.query("COMMIT");
          return { ok: false, status: STATUS.EXPIRED, reason: "expired" };
        }

        const hashRow = await client.query(
          `SELECT code_hash FROM blessboard.phone_otp_verifications WHERE id = $1`,
          [verificationId]
        );
        const stored = String(hashRow.rows[0].code_hash);
        const expected = hashOtpCode(code, otpPepper(e));
        const okCode =
          stored.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(expected));

        if (!okCode) {
          const nextAttempts = row.attemptCount + 1;
          const exhausted = nextAttempts >= row.maxAttempts;
          await repo.recordFailedAttempt(client, row.id, { exhausted });
          await client.query("COMMIT");
          return {
            ok: false,
            status: exhausted ? STATUS.EXHAUSTED : STATUS.INVALID_CODE,
            reason: exhausted ? "exhausted" : "invalid_code",
          };
        }

        const verified = await repo.markVerified(client, row.id);
        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          challenge: publicChallenge(verified),
          normalizedPhone: row.normalizedPhone,
          userId: row.userId,
          organizationId: row.organizationId,
          purpose: row.purpose,
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
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

async function cancelVerification(db, input) {
  const verificationId = String((input && input.verificationId) || "").trim();
  if (!verificationId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const row = await repo.markCancelled(client, verificationId);
      if (!row) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      return { ok: true, status: STATUS.OK, challenge: publicChallenge(row) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

async function getStatus(db, input) {
  const verificationId = String((input && input.verificationId) || "").trim();
  if (!verificationId) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const row = await repo.findById(client, verificationId);
      if (!row) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      if (row.status === "pending" && new Date(row.expiresAt).getTime() <= Date.now()) {
        const expired = await repo.markExpired(client, row.id);
        return { ok: true, status: STATUS.OK, challenge: publicChallenge(expired || row) };
      }
      return { ok: true, status: STATUS.OK, challenge: publicChallenge(row) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message).slice(0, 120) : "error",
    };
  }
}

module.exports = {
  STATUS,
  DEFAULTS,
  startVerification,
  checkVerification,
  cancelVerification,
  getStatus,
  policyFromEnv,
  hashOtpCode,
  peekTestCode,
};
