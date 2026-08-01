"use strict";

/**
 * V5 signed double-submit CSRF (independent of express-session / legacy tables).
 * Cookie + form field must match; HMAC uses SESSION_SECRET.
 */

const crypto = require("crypto");

const CSRF_COOKIE = "blessboard_org_csrf";
const CSRF_PREFIX = "v5c1";
const CSRF_FIELD = "_csrf";

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function getCsrfSecret(env) {
  const source = env || process.env;
  const secret = String(source.SESSION_SECRET || "").trim();
  if (secret) return secret;
  if (String(source.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("SESSION_SECRET is required for V5 CSRF in production");
  }
  return "dev_v5_csrf_secret_change_me";
}

/**
 * @param {string} nonce
 * @param {string} secret
 */
function signNonce(nonce, secret) {
  const mac = crypto.createHmac("sha256", secret).update(`${CSRF_PREFIX}.${nonce}`).digest("base64url");
  return `${CSRF_PREFIX}.${nonce}.${mac}`;
}

/**
 * @param {string} token
 * @param {string} secret
 */
function verifySignedToken(token, secret) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts[0] !== CSRF_PREFIX) return false;
  const [prefix, nonce, mac] = parts;
  if (!nonce || !mac) return false;
  const expected = signNonce(nonce, secret);
  const left = Buffer.from(token, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function issueCsrfToken(env) {
  const secret = getCsrfSecret(env);
  const nonce = crypto.randomBytes(16).toString("base64url");
  return signNonce(nonce, secret);
}

/**
 * @param {import('express').Request} req
 * @param {string} submitted
 * @param {NodeJS.ProcessEnv} [env]
 */
function validateCsrf(req, submitted, env) {
  const secret = getCsrfSecret(env);
  const cookieToken =
    (req.cookies && req.cookies[CSRF_COOKIE]) ||
    (req.signedCookies && req.signedCookies[CSRF_COOKIE]) ||
    null;
  const bodyToken = submitted != null ? String(submitted) : "";
  if (!cookieToken || !bodyToken) return false;
  if (!verifySignedToken(cookieToken, secret)) return false;
  if (!verifySignedToken(bodyToken, secret)) return false;
  const left = Buffer.from(cookieToken, "utf8");
  const right = Buffer.from(bodyToken, "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

/**
 * @param {import('express').Response} res
 * @param {string} token
 * @param {{ secure?: boolean }} [opts]
 */
function setCsrfCookie(res, token, opts) {
  const secure = opts && opts.secure !== undefined ? opts.secure : process.env.NODE_ENV === "production";
  res.cookie(CSRF_COOKIE, token, {
    httpOnly: false, // double-submit must be readable by form issuance from server; value is HMAC-signed
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60 * 1000,
  });
}

module.exports = {
  CSRF_COOKIE,
  CSRF_FIELD,
  CSRF_PREFIX,
  getCsrfSecret,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
  verifySignedToken,
};
