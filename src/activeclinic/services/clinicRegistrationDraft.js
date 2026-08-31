"use strict";

/**
 * HMAC-signed clinic registration wizard draft (httpOnly cookie).
 * Navigation-only steps (edit clinic/admin) use GET + draft read — no CSRF bypass.
 */

const crypto = require("crypto");

const COOKIE_NAME = "ac_reg_draft";
const MAX_AGE_MS = 60 * 60 * 1000;

function signingSecret(env) {
  const secret = String((env && env.SESSION_SECRET) || "").trim();
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters for registration draft cookies");
  }
  return secret;
}

function signPayload(payloadB64, secret) {
  return crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

function parseCookieHeader(header, name) {
  if (!header) return null;
  const parts = String(header).split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      return decodeURIComponent(trimmed.slice(name.length + 1));
    }
  }
  return null;
}

/**
 * @returns {{ formData: object, updatedAt?: number }|null}
 */
function readRegistrationDraft(req, env) {
  const raw =
    (req.cookies && req.cookies[COOKIE_NAME]) ||
    parseCookieHeader(req.headers && req.headers.cookie, COOKIE_NAME);
  if (!raw) return null;

  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = signPayload(payloadB64, signingSecret(env));
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch (_err) {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || !parsed.formData) return null;
  if (parsed.updatedAt && Date.now() - parsed.updatedAt > MAX_AGE_MS) return null;
  return parsed;
}

function writeRegistrationDraft(res, env, formData, { isProduction }) {
  const payload = {
    formData: formData || {},
    updatedAt: Date.now(),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signPayload(payloadB64, signingSecret(env));
  const value = `${payloadB64}.${sig}`;
  const secure = isProduction ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}${secure}`
  );
  return payload;
}

function clearRegistrationDraft(res, { isProduction }) {
  const secure = isProduction ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`
  );
}

module.exports = {
  COOKIE_NAME,
  readRegistrationDraft,
  writeRegistrationDraft,
  clearRegistrationDraft,
};
