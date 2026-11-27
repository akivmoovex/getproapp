"use strict";

/**
 * BlessBoard member-login OTP binding.
 * Identity comes from the authenticated server record. Browser fields cannot
 * choose the tenant, account, or destination. Delivery stays fail-closed.
 */

const crypto = require("crypto");
const { OTP_POLICY } = require("../../platform/otp/otpPolicy");
const { resolveOtpActivation } = require("../../platform/otp/otpActivation");
const { evaluateOtpSessionGate } = require("../../platform/otp/otpSessionGate");

const WORKFLOW = "blessboard.member_login";
const COOKIE = "bb_member_login_otp";
// Live Resend success is intentionally absent. A failed or inactive send must
// not become a completable login challenge.
const ACCEPTED_DELIVERY = new Set(["fake_accepted"]);
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function memberLoginOtpActive(env) {
  return resolveOtpActivation(env).status === "ACTIVE";
}

function resolveServerLoginBinding(account) {
  const source = account || {};
  const organizationId = String(source.organizationId || "").trim();
  const accountId = String(source.accountId || "").trim();
  const churchId = String(source.churchId || "").trim();
  const memberId = String(source.memberId || "").trim();
  const destination = String(source.verifiedEmail || "").trim().toLowerCase();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(accountId) || !churchId || !memberId) {
    return { ok: false, reason: "binding" };
  }
  if (!EMAIL_RE.test(destination)) return { ok: false, reason: "missing_verified_email" };
  return {
    ok: true,
    workflow: WORKFLOW,
    purpose: "login",
    productCode: "blessboard",
    channel: "email",
    organizationId,
    accountId,
    churchId,
    memberId,
    destination,
  };
}

function signingSecret(env) {
  const secret = String((env && env.SESSION_SECRET) || "").trim();
  return secret.length >= 32 ? secret : "";
}

function sealPendingLogin(payload, env) {
  const secret = signingSecret(env);
  if (!secret) return null;
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = crypto.createHmac("sha256", secret).update(`bb-member-login-otp.${body}`).digest("base64url");
  return `${body}.${mac}`;
}

function openPendingLogin(token, env) {
  const secret = signingSecret(env);
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (!secret || dot <= 0) return null;
  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(`bb-member-login-otp.${body}`).digest("base64url");
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || parsed.workflow !== WORKFLOW || !parsed.attemptId) return null;
  if (!Number.isFinite(parsed.exp) || Date.now() > parsed.exp) return null;
  const binding = resolveServerLoginBinding(parsed);
  if (!binding.ok) return null;
  return {
    ...binding,
    attemptId: String(parsed.attemptId),
    deliveryAccepted: parsed.deliveryAccepted === true,
  };
}

function readCookie(header, name) {
  const parts = String(header || "").split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) return decodeURIComponent(trimmed.slice(name.length + 1));
  }
  return "";
}

function readPendingLogin(req, env) {
  return openPendingLogin(readCookie(req && req.headers && req.headers.cookie, COOKIE), env);
}

function writePendingCookie(res, pending, env) {
  const token = sealPendingLogin(
    {
      workflow: WORKFLOW,
      attemptId: pending.attemptId,
      organizationId: pending.organizationId,
      accountId: pending.accountId,
      churchId: pending.churchId,
      memberId: pending.memberId,
      verifiedEmail: pending.destination,
      deliveryAccepted: pending.deliveryAccepted === true,
      exp: Date.now() + OTP_POLICY.ttlSeconds * 1000,
    },
    env
  );
  if (!token) return false;
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: String((env && env.NODE_ENV) || "") === "production",
    path: "/",
    maxAge: OTP_POLICY.ttlSeconds * 1000,
  });
  return true;
}

function clearPendingCookie(res) {
  res.clearCookie(COOKIE, { path: "/" });
}

function gateInput(binding, verification) {
  return {
    workflow: WORKFLOW,
    organizationId: binding.organizationId,
    accountId: binding.accountId,
    identifier: binding.destination,
    channel: "email",
    accountResolved: true,
    context: WORKFLOW,
    ...(verification ? { verification } : {}),
  };
}

function deliveryWasAccepted(started) {
  return Boolean(started && started.attemptId && ACCEPTED_DELIVERY.has(String(started.reason || "")));
}

async function beginMemberLoginChallenge(binding, env, service) {
  const gate = await evaluateOtpSessionGate(
    { ...gateInput(binding), ...(service ? { service } : {}) },
    env
  );
  return { ...gate, deliveryAccepted: deliveryWasAccepted(gate) };
}

async function completeMemberLoginChallenge(pending, code, env, service) {
  return evaluateOtpSessionGate(
    {
      ...gateInput(pending, { attemptId: pending.attemptId, code: String(code || "").trim() }),
      ...(service ? { service } : {}),
    },
    env
  );
}

function verificationMessage(reason) {
  if (reason === "invalid_code") return "That code is not correct.";
  if (reason === "expired") return "That code has expired. Sign in again.";
  if (reason === "exhausted") return "Too many attempts. Sign in again.";
  if (reason === "replay") return "That code was already used.";
  if (reason === "resend_cooldown") return "A new code is not available yet.";
  if (reason === "delivery_failed" || reason === "delivery_not_activated" || reason === "qa_live_delivery_not_authorized") {
    return "A verification code could not be sent. Try again shortly.";
  }
  return "Enter the verification code sent to your email.";
}

function maskDestination(email) {
  const value = String(email || "");
  const at = value.indexOf("@");
  if (at <= 1) return "your email";
  return `${value[0]}***${value.slice(at)}`;
}

module.exports = {
  WORKFLOW,
  COOKIE,
  OTP_CODE_LENGTH: OTP_POLICY.codeLength,
  memberLoginOtpActive,
  resolveServerLoginBinding,
  sealPendingLogin,
  openPendingLogin,
  readPendingLogin,
  writePendingCookie,
  clearPendingCookie,
  beginMemberLoginChallenge,
  completeMemberLoginChallenge,
  verificationMessage,
  maskDestination,
};
