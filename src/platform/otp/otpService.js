"use strict";

/**
 * Platform OTP challenge lifecycle for BlessBoard and ActiveClinic.
 * One engine. No message delivery. No production activation.
 * Plaintext codes are hashed and then discarded.
 */

const crypto = require("crypto");
const { OTP_POLICY, CHANNELS, PRODUCTS } = require("./otpPolicy");
const { getProtectedAction } = require("./otpProtectedActions");
const { isFixedOtpPermitted, isProductionSignal } = require("./otpEnvironment");
const { createMemoryOtpStore } = require("./otpChallengeStore");
const { createInactiveOtpProvider, resolveOtpProvider } = require("./otpProviders");
const { normalizeZambiaSms } = require("./otpPhone");
const { sanitizeDelivery } = require("./otpDelivery");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_ACCEPTED = Object.freeze({ ok: true, status: "accepted" });
const PUBLIC_FAILED = Object.freeze({ ok: false, status: "verification_failed" });

const HOUR_MS = 60 * 60 * 1000;

let randomIntImpl = (min, max) => crypto.randomInt(min, max);

function setOtpRandomIntForTests(fn) {
  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
    throw new Error("otp_generator_override_forbidden");
  }
  randomIntImpl = typeof fn === "function" ? fn : (min, max) => crypto.randomInt(min, max);
}

function generateProductionOtpCode(randomInt) {
  const rng = typeof randomInt === "function" ? randomInt : randomIntImpl;
  let code = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const n = Number(rng(0, 10 ** OTP_POLICY.codeLength));
    if (!Number.isInteger(n) || n < 0 || n >= 10 ** OTP_POLICY.codeLength) {
      continue;
    }
    code = String(n).padStart(OTP_POLICY.codeLength, "0");
    if (code !== OTP_POLICY.testingCode && code !== "001234") return code;
  }
  throw Object.assign(new Error("otp_generation_failed"), { code: "otp_generation_failed" });
}

function hashOtpCode(code, pepper) {
  return crypto.createHmac("sha256", pepper).update(String(code)).digest("hex");
}

function hashesEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function pepperFrom(env) {
  const source = env || {};
  const pepper = String(source.GETPRO_OTP_PEPPER || source.SESSION_SECRET || "").trim();
  if (pepper.length < 32) return null;
  return pepper;
}

function hashIdentifier(productCode, channel, identifier) {
  return crypto
    .createHash("sha256")
    .update(`otp-id:${productCode}:${channel}:${identifier}`)
    .digest("hex");
}

function hashContext(context) {
  return crypto.createHash("sha256").update(`otp-ctx:${context}`).digest("hex");
}

function normalizeIdentifier(channel, raw, env) {
  const value = String(raw || "").trim();
  if (channel === "email") {
    const email = value.toLowerCase();
    if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
    return email;
  }
  if (channel === "sms") return normalizeZambiaSms(value, env);
  return null;
}

function denied(reason) {
  return {
    public: PUBLIC_FAILED,
    server: { ok: false, reason, sessionComplete: false },
  };
}

function createOtpService(options) {
  const opts = options || {};
  const store = opts.store || createMemoryOtpStore();
  const provider = opts.provider || createInactiveOtpProvider();
  if (provider && provider.deliveryActivated === true) {
    throw new Error("otp_delivery_activation_forbidden");
  }

  function audit(event) {
    const row = store.appendAudit(event);
    if (typeof opts.log === "function") {
      const safe = { ...row };
      delete safe.code;
      delete safe.otp;
      delete safe.codeHash;
      opts.log(safe);
    }
    return row;
  }

  function issueCode(env) {
    if (isFixedOtpPermitted(env)) return OTP_POLICY.testingCode;
    if (isProductionSignal(env)) return generateProductionOtpCode(crypto.randomInt);
    return generateProductionOtpCode(randomIntImpl);
  }

  async function beginChallenge(input, env) {
    const action = getProtectedAction(input && input.action);
    if (!action || action.mandatory !== true) {
      return denied("unknown_action");
    }
    const productCode = String((input && input.productCode) || "").trim().toLowerCase();
    if (!PRODUCTS.includes(productCode)) return denied("unknown_product");
    const channel = String((input && input.channel) || "").trim().toLowerCase();
    if (!CHANNELS.includes(channel)) return denied("channel");
    const organizationId = String((input && input.organizationId) || "").trim();
    const accountId = String((input && input.accountId) || "").trim();
    if (!UUID_RE.test(organizationId) || !UUID_RE.test(accountId)) return denied("binding");
    const sessionIdRaw = input && input.sessionId != null ? String(input.sessionId).trim() : "";
    if (action.requiresSession && !UUID_RE.test(sessionIdRaw)) return denied("session_required");
    const sessionId = sessionIdRaw || null;
    const identifier = normalizeIdentifier(channel, input && input.identifier, env);
    if (!identifier) return denied("identifier");
    const pepper = pepperFrom(env);
    if (!pepper) return denied("pepper");

    const preAuth = action.preAuth === true;
    if (preAuth && input && input.accountResolved === false) {
      audit({
        type: "otp.suppressed",
        reason: "account_unresolved",
        productCode,
        channel,
        action: input.action,
      });
      return { public: PUBLIC_ACCEPTED, server: { ok: true, issued: false, sessionComplete: false } };
    }

    const now = nowMs(opts);
    const attemptId = crypto.randomUUID();
    const existing = store.findPending({
      productCode,
      organizationId,
      accountId,
      purpose: action.purpose,
      channel,
      sessionId,
    });
    if (existing) {
      const elapsed = now - existing.lastSentAt;
      if (elapsed < OTP_POLICY.resendCooldownSeconds * 1000) {
        audit({
          type: "otp.rate_limited",
          reason: "resend_cooldown",
          productCode,
          channel,
          action: input.action,
        });
        return preAuth
          ? { public: PUBLIC_ACCEPTED, server: { ok: false, reason: "resend_cooldown", sessionComplete: false } }
          : denied("resend_cooldown");
      }
    }

    const identifierHash = hashIdentifier(productCode, channel, identifier);
    const contextHash = hashContext(
      String((input && input.context) || sessionId || "unscoped")
    );
    const limits = [
      [`account:${productCode}:${organizationId}:${accountId}:${action.purpose}`, OTP_POLICY.accountHourlyCap],
      [`identifier:${identifierHash}:${action.purpose}`, OTP_POLICY.identifierHourlyCap],
      [`context:${contextHash}:${action.purpose}`, OTP_POLICY.contextHourlyCap],
    ];
    for (const [key, cap] of limits) {
      let count;
      try {
        count = store.consumeRate(key, now, HOUR_MS);
      } catch {
        return denied("rate_limit_unavailable");
      }
      if (count > cap) {
        audit({
          type: "otp.rate_limited",
          reason: "cap",
          productCode,
          channel,
          action: input.action,
        });
        return preAuth
          ? { public: PUBLIC_ACCEPTED, server: { ok: false, reason: "rate_limited", sessionComplete: false } }
          : denied("rate_limited");
      }
    }

    if (existing) {
      store.update(existing.id, { status: "cancelled" });
    }

    let code;
    try {
      code = issueCode(env);
    } catch {
      return denied("generation_failed");
    }
    const codeHash = hashOtpCode(code, pepper);
    const record = store.insert({
      id: crypto.randomUUID(),
      productCode,
      organizationId,
      accountId,
      sessionId,
      attemptId,
      purpose: action.purpose,
      action: String(input.action),
      channel,
      identifierHash,
      codeHash,
      contextHash,
      maxAttempts: OTP_POLICY.maxAttempts,
      createdAt: now,
      expiresAt: now + OTP_POLICY.ttlSeconds * 1000,
    });
    audit({
      type: "otp.issued",
      reason: "issued",
      productCode,
      channel,
      action: input.action,
      challengeId: record.id,
    });
    const active = opts.provider || resolveOtpProvider(env, opts);
    if (active && active.deliveryActivated === true) {
      return denied("delivery_forbidden");
    }
    const delivery = await dispatchChallenge(active, store, {
      channel,
      destination: identifier,
      code,
      env,
      now,
      cap: isProductionSignal(env)
        ? OTP_POLICY.providerHourlyCap
        : Number(opts.providerHourlyCap) || OTP_POLICY.providerHourlyCap,
    });
    audit({
      type: "otp.delivery",
      reason: delivery.reason,
      productCode,
      channel,
      action: input.action,
      providerName: delivery.providerName,
      attemptCount: delivery.attempts,
    });
    const server = {
      ok: delivery.publicStatus !== "failed",
      issued: true,
      challengeId: record.id,
      attemptId,
      sessionComplete: false,
      delivery: delivery.publicStatus,
      reason: delivery.reason,
    };
    if (delivery.publicStatus === "failed" && !preAuth) {
      return { public: PUBLIC_FAILED, server };
    }
    return { public: PUBLIC_ACCEPTED, server };
  }

  async function verifyChallenge(input, env) {
    const action = getProtectedAction(input && input.action);
    if (!action) return denied("unknown_action");
    const pepper = pepperFrom(env);
    if (!pepper) return denied("pepper");
    const organizationId = String((input && input.organizationId) || "").trim();
    const accountId = String((input && input.accountId) || "").trim();
    const attemptId = String((input && input.attemptId) || "").trim();
    const productCode = String((input && input.productCode) || "").trim().toLowerCase();
    const channel = String((input && input.channel) || "").trim().toLowerCase();
    const sessionId = input && input.sessionId != null ? String(input.sessionId).trim() : null;
    if (!UUID_RE.test(organizationId) || !UUID_RE.test(accountId) || !attemptId) {
      return denied("binding");
    }
    const suppliedPurpose = String((input && input.purpose) || action.purpose);
    if (suppliedPurpose !== action.purpose) {
      audit({
        type: "otp.denied",
        reason: "wrong_purpose",
        productCode,
        channel,
        action: input.action,
      });
      return denied("wrong_purpose");
    }

    const row = store.findByAttempt({
      productCode,
      organizationId: null,
      accountId,
      purpose: action.purpose,
      channel,
      attemptId,
      sessionId,
    });
    if (!row) return denied("verification_failed");
    if (row.organizationId !== organizationId || row.productCode !== productCode) {
      audit({ type: "otp.denied", reason: "cross_tenant", productCode, channel, action: input.action });
      return denied("cross_tenant");
    }
    if (action.requiresSession && (!sessionId || row.sessionId !== sessionId)) {
      return denied("session_required");
    }
    if (input && input.challengeId && String(input.challengeId) !== row.id) {
      return denied("challenge_mismatch");
    }
    const now = nowMs(opts);
    if (row.status === "verified") {
      audit({ type: "otp.denied", reason: "replay", productCode, channel, action: input.action });
      return denied("replay");
    }
    if (row.status === "exhausted") return denied("exhausted");
    if (row.status !== "pending") return denied("verification_failed");
    if (now >= row.expiresAt) {
      store.update(row.id, { status: "expired" });
      audit({ type: "otp.denied", reason: "expired", productCode, channel, action: input.action });
      return denied("expired");
    }
    if (row.attemptCount >= row.maxAttempts) {
      store.update(row.id, { status: "exhausted" });
      return denied("exhausted");
    }

    const submitted = String((input && input.code) || "").trim();
    if (isProductionSignal(env) && submitted === OTP_POLICY.testingCode) {
      store.update(row.id, { attemptCount: row.attemptCount + 1 });
      audit({ type: "otp.denied", reason: "testing_code_rejected", productCode, channel, action: input.action });
      return denied("testing_code_rejected");
    }
    const expected = hashOtpCode(submitted, pepper);
    if (!hashesEqual(expected, row.codeHash)) {
      const next = row.attemptCount + 1;
      const exhausted = next >= row.maxAttempts;
      store.update(row.id, {
        attemptCount: next,
        status: exhausted ? "exhausted" : "pending",
      });
      audit({
        type: "otp.denied",
        reason: exhausted ? "exhausted" : "invalid_code",
        productCode,
        channel,
        action: input.action,
      });
      return denied(exhausted ? "exhausted" : "invalid_code");
    }

    store.update(row.id, { status: "verified", verifiedAt: now });
    audit({ type: "otp.verified", reason: "verified", productCode, channel, action: input.action });
    return {
      public: Object.freeze({ ok: true, status: "verified" }),
      server: {
        ok: true,
        reason: "verified",
        challengeId: row.id,
        attemptId,
        purpose: row.purpose,
        action: row.action,
        productCode: row.productCode,
        organizationId: row.organizationId,
        accountId: row.accountId,
        sessionId: row.sessionId,
        sessionComplete: false,
      },
    };
  }

  function completeProtectedAction(verification, actionName) {
    const action = getProtectedAction(actionName);
    const server = verification && verification.server;
    if (!action || action.mandatory !== true || !server || server.ok !== true || server.reason !== "verified") {
      return { ok: false, sessionComplete: false, otpRequired: true, reason: "otp_required" };
    }
    if (server.action !== actionName || server.purpose !== action.purpose) {
      return { ok: false, sessionComplete: false, otpRequired: true, reason: "wrong_purpose" };
    }
    const row = store.findByAttempt({
      productCode: server.productCode,
      organizationId: server.organizationId,
      accountId: server.accountId,
      purpose: server.purpose,
      channel: verification.channel || undefined,
      attemptId: server.attemptId,
      sessionId: server.sessionId,
    });
    if (!row || row.status !== "verified" || row.consumed === true) {
      return { ok: false, sessionComplete: false, otpRequired: true, reason: "otp_required" };
    }
    if (row.channel && verification.channel && row.channel !== verification.channel) {
      return { ok: false, sessionComplete: false, otpRequired: true, reason: "otp_required" };
    }
    store.update(row.id, { consumed: true });
    return {
      ok: true,
      sessionComplete: true,
      otpRequired: false,
      reason: "otp_satisfied",
    };
  }

  return {
    beginChallenge,
    verifyChallenge,
    completeProtectedAction,
    provider,
    store,
  };
}

async function dispatchChallenge(provider, store, input) {
  const name = provider && provider.name ? String(provider.name) : "inactive";
  if (name !== "inactive") {
    let count = 0;
    try {
      count = store.consumeRate(`provider:${name}:${input.channel}`, input.now, HOUR_MS);
    } catch {
      return sanitizeDelivery({
        publicStatus: "failed",
        reason: "rate_limit_unavailable",
        providerName: name,
      });
    }
    if (count > input.cap) {
      return sanitizeDelivery({
        publicStatus: "failed",
        reason: "provider_rate_limited",
        providerName: name,
        attempts: 1,
      });
    }
  }
  if (!provider || typeof provider.dispatch !== "function") {
    return sanitizeDelivery({
      publicStatus: "not_activated",
      reason: "delivery_not_activated",
      providerName: name,
    });
  }
  try {
    const raw = await provider.dispatch({
      channel: input.channel,
      destination: input.destination,
      code: input.code,
      env: input.env,
    });
    return sanitizeDelivery(raw);
  } catch {
    return sanitizeDelivery({
      publicStatus: "failed",
      reason: "delivery_failed",
      providerName: name,
    });
  }
}

function nowMs(opts) {
  if (opts && typeof opts.clock === "function") return opts.clock();
  return Date.now();
}

module.exports = {
  PUBLIC_ACCEPTED,
  PUBLIC_FAILED,
  createOtpService,
  generateProductionOtpCode,
  hashOtpCode,
  setOtpRandomIntForTests,
};
