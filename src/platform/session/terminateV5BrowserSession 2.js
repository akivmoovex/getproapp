"use strict";

/**
 * Canonical V5 browser-session termination.
 * Logout is a session-termination operation: it must complete even when
 * tenant/org/facility/product context is stale. Cookie names always come
 * from the same deployment/session resolver used at login.
 *
 * Revoke is always scoped by deployment_code so a V8 logout cannot invalidate
 * V7 session rows that share the same PostgreSQL database.
 */

const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { buildHostOnlyCookieOptions } = require("../config/v8DeploymentIsolation");
const {
  readV5SessionCookie,
  clearV5SessionCookie,
  getV5SessionCookieName,
} = require("./v5SessionCookie");
const { revokeV5Session } = require("./revokeV5Session");

/**
 * @param {import('express').Response} res
 * @param {string} cookieName
 * @param {{ secure?: boolean, env?: NodeJS.ProcessEnv }} opts
 */
function clearHostOnlyCookie(res, cookieName, opts) {
  const name = String(cookieName || "").trim();
  if (!name) return;
  const env = (opts && opts.env) || process.env;
  const base = buildHostOnlyCookieOptions(env);
  const secure = opts && opts.secure !== undefined ? opts.secure : base.secure;
  res.clearCookie(name, {
    ...base,
    secure,
    // CSRF cookies are readable; clear with matching path/host-only attrs.
    httpOnly: false,
  });
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   isProduction?: boolean,
 *   getPool?: () => { query: Function },
 *   csrfCookieName?: string|null,
 *   extraCookieNames?: string[],
 * }} [deps]
 */
async function terminateV5BrowserSession(req, res, deps) {
  const options = deps || {};
  const env = options.env || process.env;
  const isProduction = options.isProduction === true;
  const getPool = options.getPool;
  const extraCookieNames = Array.isArray(options.extraCookieNames)
    ? options.extraCookieNames
    : [];

  const sessionCookieName = getV5SessionCookieName(env, req);
  const csrfCookieName = options.csrfCookieName
    ? String(options.csrfCookieName)
    : null;
  const deployment = getPlatformDeploymentCode(env);
  const rawToken = readV5SessionCookie(req, env);
  let revoked = false;

  try {
    if (rawToken && deployment.ok && deployment.code && typeof getPool === "function") {
      const pool = getPool();
      if (pool && typeof pool.query === "function") {
        const result = await revokeV5Session(pool, {
          rawToken,
          deploymentCode: deployment.code,
        });
        revoked = Boolean(result && result.revoked);
      }
    }
  } catch {
    /* fail-open: still clear cookies so the browser is not trapped */
  }

  clearV5SessionCookie(res, { secure: isProduction, env, req });
  if (csrfCookieName) {
    clearHostOnlyCookie(res, csrfCookieName, { secure: isProduction, env });
  }
  for (const name of extraCookieNames) {
    const cookieName = String(name || "").trim();
    if (!cookieName) continue;
    const base = buildHostOnlyCookieOptions(env);
    const secure = isProduction ? true : base.secure;
    // Clear once with host-only attrs (covers HttpOnly session-like cookies).
    res.clearCookie(cookieName, { ...base, secure });
    // And once with httpOnly:false for double-submit CSRF-style cookies.
    clearHostOnlyCookie(res, cookieName, { secure, env });
  }

  return {
    ok: true,
    sessionCookieName,
    csrfCookieName,
    hadSessionCookie: Boolean(rawToken),
    revoked,
    deploymentCode: deployment.ok ? deployment.code : null,
  };
}

module.exports = {
  terminateV5BrowserSession,
  clearHostOnlyCookie,
};
