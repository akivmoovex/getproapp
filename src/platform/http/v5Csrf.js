"use strict";

/**
 * V5 signed double-submit CSRF (independent of express-session / legacy tables).
 * Cookie + form field must match; HMAC uses SESSION_SECRET.
 * Cookie name is resolved from the authoritative deployment profile.
 */

const crypto = require("crypto");

/** BlessBoard historical default — kept as export alias for existing tests. */
const DEFAULT_CSRF_COOKIE = "blessboard_org_csrf";
/** @deprecated Prefer getCsrfCookieName(env). Equals BlessBoard default. */
const CSRF_COOKIE = DEFAULT_CSRF_COOKIE;
const CSRF_PREFIX = "v5c1";
const CSRF_FIELD = "_csrf";

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function getCsrfCookieName(env) {
  const source = env || process.env;
  const {
    hasAuthoritativeDeploymentProfile,
    getDeploymentProfile,
  } = require("../config/deploymentProfiles");
  if (hasAuthoritativeDeploymentProfile(source)) {
    const profile = getDeploymentProfile(source);
    if (profile && profile.csrfCookieName) {
      return String(profile.csrfCookieName);
    }
    throw new Error(
      `Deployment profile ${(profile && profile.deploymentCode) || "(unknown)"} is missing csrfCookieName`
    );
  }
  return DEFAULT_CSRF_COOKIE;
}

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
  const cookieName = getCsrfCookieName(env);
  const cookieToken =
    (req.cookies && req.cookies[cookieName]) ||
    (req.signedCookies && req.signedCookies[cookieName]) ||
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
 * @param {{ secure?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 */
function setCsrfCookie(res, token, opts) {
  const env = (opts && opts.env) || process.env;
  const secure =
    opts && opts.secure !== undefined ? opts.secure : String(env.NODE_ENV || "") === "production";
  const cookieName = getCsrfCookieName(env);
  res.cookie(cookieName, token, {
    httpOnly: false, // double-submit must be readable by form issuance from server; value is HMAC-signed
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60 * 1000,
  });
}

module.exports = {
  CSRF_COOKIE,
  DEFAULT_CSRF_COOKIE,
  CSRF_FIELD,
  CSRF_PREFIX,
  getCsrfCookieName,
  getCsrfSecret,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
  verifySignedToken,
};
