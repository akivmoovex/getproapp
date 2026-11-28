"use strict";

/**
 * ActiveClinic patient-login email OTP.
 * Isolated observer only. The clinic in the URL must match the sealed clinic.
 * A failed send does not open a patient session.
 */

const crypto = require("crypto");
const { OTP_POLICY } = require("../../platform/otp/otpPolicy");
const { resolveOtpActivation } = require("../../platform/otp/otpActivation");
const { evaluateOtpSessionGate } = require("../../platform/otp/otpSessionGate");
const { acPatientLoginOtpObserverAuthorized } = require("../../platform/otp/otpQaLoginObserver");

const WORKFLOW = "activeclinic.patient_login";
const COOKIE = "ac_patient_login_otp";
const ACCEPTED_DELIVERY = new Set(["fake_accepted"]);
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function patientLoginOtpActive(env) {
  return acPatientLoginOtpObserverAuthorized(env);
}

function resolveServerLoginBinding(account) {
  const source = account || {};
  const organizationId = String(source.organizationId || "").trim();
  const accountId = String(source.accountId || "").trim();
  const healthcareOrganizationId = String(source.healthcareOrganizationId || "").trim();
  const clinicKey = String(source.clinicKey || "").trim();
  const destination = String(source.verifiedEmail || "").trim().toLowerCase();
  if (!UUID_RE.test(organizationId) || !UUID_RE.test(accountId) || !UUID_RE.test(healthcareOrganizationId)) {
    return { ok: false, reason: "binding" };
  }
  if (!/^[a-z0-9-]{2,80}$/.test(clinicKey)) return { ok: false, reason: "binding" };
  if (!EMAIL_RE.test(destination)) return { ok: false, reason: "missing_verified_email" };
  return {
    ok: true,
    workflow: WORKFLOW,
    purpose: "login",
    productCode: "activeclinic",
    channel: "email",
    organizationId,
    accountId,
    healthcareOrganizationId,
    clinicKey,
    patientId: source.patientId || null,
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
  const mac = crypto.createHmac("sha256", secret).update(`ac-patient-login-otp.${body}`).digest("base64url");
  return `${body}.${mac}`;
}

function openPendingLogin(token, env) {
  const secret = signingSecret(env);
  const raw = String(token || "");
  const dot = raw.lastIndexOf(".");
  if (!secret || dot <= 0) return null;
  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(`ac-patient-login-otp.${body}`).digest("base64url");
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
  return { ...binding, attemptId: String(parsed.attemptId), deliveryAccepted: parsed.deliveryAccepted === true };
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
      healthcareOrganizationId: pending.healthcareOrganizationId,
      clinicKey: pending.clinicKey,
      patientId: pending.patientId || null,
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

function deliveryWasAccepted(started, env) {
  if (!started || !started.attemptId) return false;
  const reason = String(started.reason || "");
  if (ACCEPTED_DELIVERY.has(reason)) return true;
  return reason === "qa_observer_accepted" && patientLoginOtpActive(env);
}

function gateActivation(env) {
  if (patientLoginOtpActive(env) && resolveOtpActivation(env, "ACTIVE").status === "ACTIVE") return "ACTIVE";
  return undefined;
}

async function beginPatientLoginChallenge(binding, env, service) {
  const activation = gateActivation(env);
  if (!activation) {
    return { sessionAllowed: false, attemptId: null, reason: "delivery_not_activated", deliveryAccepted: false };
  }
  const gate = await evaluateOtpSessionGate(
    { ...gateInput(binding), ...(service ? { service } : {}), activation },
    env
  );
  return { ...gate, deliveryAccepted: deliveryWasAccepted(gate, env) };
}

async function completePatientLoginChallenge(pending, code, env, service) {
  const activation = gateActivation(env);
  if (!activation) {
    return { sessionAllowed: false, sessionComplete: false, reason: "delivery_not_activated" };
  }
  return evaluateOtpSessionGate(
    {
      ...gateInput(pending, { attemptId: pending.attemptId, code: String(code || "").trim() }),
      ...(service ? { service } : {}),
      activation,
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
  return "A verification code could not be sent. Try again shortly.";
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
  patientLoginOtpActive,
  resolveServerLoginBinding,
  sealPendingLogin,
  openPendingLogin,
  readPendingLogin,
  writePendingCookie,
  clearPendingCookie,
  beginPatientLoginChallenge,
  completePatientLoginChallenge,
  verificationMessage,
  maskDestination,
};
