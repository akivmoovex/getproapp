"use strict";

/**
 * V5 session cookie helpers. Cookie name from deployment profile or SESSION_COOKIE_NAME.
 * Cookies are host-only (no Domain=), HttpOnly, SameSite=Lax; Secure when NODE_ENV=production.
 */

const { SESSION_TTL_MS } = require("../session/sessionToken");
const { getDeploymentProfile, V5_SESSION_COOKIE } = require("../config/deploymentProfiles");

const DEFAULT_V5_COOKIE = V5_SESSION_COOKIE;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function getV5SessionCookieName(env, req) {
  if (req && req.platform && req.platform.sessionCookieName) {
    return req.platform.sessionCookieName;
  }
  const source = env || process.env;
  const { hasAuthoritativeDeploymentProfile, getDeploymentProfile } = require("../config/deploymentProfiles");
  if (hasAuthoritativeDeploymentProfile(source)) {
    const profile = getDeploymentProfile(source);
    if (profile) return profile.sessionCookieName;
  }
  const raw = String(source.SESSION_COOKIE_NAME || "").trim();
  return raw || DEFAULT_V5_COOKIE;
}

/**
 * @param {import('express').Response} res
 * @param {string} rawToken
 * @param {{ secure?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 */
function setV5SessionCookie(res, rawToken, opts) {
  const env = (opts && opts.env) || process.env;
  const req = opts && opts.req;
  const secure =
    opts && opts.secure !== undefined ? opts.secure : String(env.NODE_ENV || "") === "production";
  res.cookie(getV5SessionCookieName(env, req), rawToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

/**
 * @param {import('express').Response} res
 * @param {{ secure?: boolean, env?: NodeJS.ProcessEnv, req?: import('express').Request }} [opts]
 */
function clearV5SessionCookie(res, opts) {
  const env = (opts && opts.env) || process.env;
  const req = opts && opts.req;
  const secure =
    opts && opts.secure !== undefined ? opts.secure : String(env.NODE_ENV || "") === "production";
  res.clearCookie(getV5SessionCookieName(env, req), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * @param {string} header
 * @param {string} name
 * @returns {string | null}
 */
function readNamedCookieFromHeader(header, name) {
  const raw = String(header || "");
  if (!raw || !name) return null;
  const parts = raw.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    const val = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(val);
    } catch {
      return val;
    }
  }
  return null;
}

/**
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} [env]
 */
function readV5SessionCookie(req, env) {
  const name = getV5SessionCookieName(env, req);
  const header = req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
  const fromHeader = readNamedCookieFromHeader(header, name);
  if (fromHeader) return fromHeader;
  if (req.cookies && req.cookies[name]) return String(req.cookies[name]);
  return null;
}

/**
 * Safe boolean: Cookie header includes a session cookie name (`*_sid=`).
 * Does not return or log cookie values.
 * @param {import('express').Request} req
 */
function cookieHeaderHasSessionSid(req) {
  const header = req && req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
  return /(?:^|;\s*)[^=;\s]*_sid=/i.test(header);
}

module.exports = {
  DEFAULT_V5_COOKIE,
  getV5SessionCookieName,
  setV5SessionCookie,
  clearV5SessionCookie,
  readV5SessionCookie,
  cookieHeaderHasSessionSid,
};
