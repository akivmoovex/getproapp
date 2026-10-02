"use strict";

/**
 * Support-context cookie (separate from V5 session — no impersonation).
 */

const crypto = require("crypto");

const DEFAULT_COOKIE = "blessboard_support_ctx";
const MAX_AGE_SECONDS = 20 * 60;

function cookieName(env) {
  const fromEnv =
    env && env.SUPPORT_CONTEXT_COOKIE_NAME
      ? String(env.SUPPORT_CONTEXT_COOKIE_NAME).trim()
      : "";
  return fromEnv || DEFAULT_COOKIE;
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(String(rawToken || ""), "utf8").digest("hex");
}

function mintRawToken() {
  return crypto.randomBytes(32).toString("hex");
}

function readSupportContextCookie(req, env) {
  const name = cookieName(env);
  const header = req && req.headers ? String(req.headers.cookie || "") : "";
  if (!header) return null;
  const parts = header.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    if (k !== name) continue;
    const v = part.slice(eq + 1).trim();
    return v || null;
  }
  if (req.cookies && typeof req.cookies === "object" && req.cookies[name]) {
    return String(req.cookies[name]);
  }
  return null;
}

function setSupportContextCookie(res, rawToken, { secure, env, maxAgeSeconds } = {}) {
  const name = cookieName(env);
  const maxAge =
    Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0
      ? Math.floor(maxAgeSeconds)
      : MAX_AGE_SECONDS;
  const parts = [
    `${name}=${encodeURIComponent(String(rawToken))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

function clearSupportContextCookie(res, { secure, env } = {}) {
  const name = cookieName(env);
  const parts = [
    `${name}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

module.exports = {
  DEFAULT_COOKIE,
  MAX_AGE_SECONDS,
  cookieName,
  hashToken,
  mintRawToken,
  readSupportContextCookie,
  setSupportContextCookie,
  clearSupportContextCookie,
};
