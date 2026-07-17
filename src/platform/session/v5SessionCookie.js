"use strict";

/**
 * V5 session cookie helpers. Cookie name from SESSION_COOKIE_NAME or deployment default.
 */

const { SESSION_TTL_MS } = require("../session/sessionToken");

const DEFAULT_V5_COOKIE = "blessboard_org_v5_sid";

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function getV5SessionCookieName(env) {
  const source = env || process.env;
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
  const secure =
    opts && opts.secure !== undefined ? opts.secure : String(env.NODE_ENV || "") === "production";
  res.cookie(getV5SessionCookieName(env), rawToken, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

/**
 * @param {import('express').Response} res
 * @param {{ secure?: boolean, env?: NodeJS.ProcessEnv }} [opts]
 */
function clearV5SessionCookie(res, opts) {
  const env = (opts && opts.env) || process.env;
  const secure =
    opts && opts.secure !== undefined ? opts.secure : String(env.NODE_ENV || "") === "production";
  res.clearCookie(getV5SessionCookieName(env), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} [env]
 */
function readV5SessionCookie(req, env) {
  const name = getV5SessionCookieName(env);
  if (req.cookies && req.cookies[name]) return String(req.cookies[name]);
  // Manual Cookie header parse when cookie-parser is absent
  const header = req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    if (key === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

module.exports = {
  DEFAULT_V5_COOKIE,
  getV5SessionCookieName,
  setV5SessionCookie,
  clearV5SessionCookie,
  readV5SessionCookie,
};
