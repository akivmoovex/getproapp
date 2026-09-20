"use strict";

/**
 * Shared BB/AC session security helpers (V8).
 * Cookie names stay deployment-scoped (V7 vs V8 already differ).
 * Logout / revoke always filter by deployment_code so V8 cannot wipe V7 rows.
 */

const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { isV8Deployment } = require("../config/v8DeploymentIsolation");
const {
  readV5SessionCookie,
  setV5SessionCookie,
  clearV5SessionCookie,
  getV5SessionCookieName,
} = require("./v5SessionCookie");
const { revokeV5Session } = require("./revokeV5Session");
const { terminateV5BrowserSession } = require("./terminateV5BrowserSession");
const { setV5PrivateNoStore } = require("../http/v5PrivateNoStore");
const { buildHostOnlyCookieOptions } = require("../config/v8DeploymentIsolation");

/**
 * Prefer SESSION_SECRET_V8 on V8 deployments; otherwise SESSION_SECRET.
 * Session token hashes are SHA-256 of the raw token (not HMAC), so secrets
 * primarily isolate CSRF signing between V7/V8 processes.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function resolveSessionSigningSecret(env) {
  const source = env || process.env;
  if (isV8Deployment(source)) {
    const v8 = String(source.SESSION_SECRET_V8 || "").trim();
    if (v8) return v8;
  }
  const shared = String(source.SESSION_SECRET || "").trim();
  if (shared) return shared;
  if (String(source.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("SESSION_SECRET is required for session security in production");
  }
  return "dev_session_signing_secret_change_me";
}

/**
 * Lazy require avoids a cycle with v5Csrf (which resolves secrets here).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {import('express').Request} [req]
 */
function resolveCsrfCookieName(env, req) {
  const { getCsrfCookieName } = require("../http/v5Csrf");
  return getCsrfCookieName(env, req);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function describeSessionCookieIsolation(env) {
  const source = env || process.env;
  const deployment = getPlatformDeploymentCode(source);
  const cookieOpts = buildHostOnlyCookieOptions(source);
  return {
    platformLine: isV8Deployment(source) ? "v8" : "v7",
    deploymentCode: deployment.ok ? deployment.code : null,
    sessionCookieName: getV5SessionCookieName(source),
    csrfCookieName: resolveCsrfCookieName(source),
    hostOnly: !Object.prototype.hasOwnProperty.call(cookieOpts, "domain"),
    httpOnly: cookieOpts.httpOnly === true,
    sameSite: cookieOpts.sameSite,
    secure: cookieOpts.secure === true,
    signingSecretSource: isV8Deployment(source) && String(source.SESSION_SECRET_V8 || "").trim()
      ? "SESSION_SECRET_V8"
      : "SESSION_SECRET",
  };
}

/**
 * Apply no-store headers for authenticated / sensitive responses.
 * @param {import('express').Response} res
 */
function applyAuthenticatedResponseHeaders(res) {
  setV5PrivateNoStore(res);
}

/**
 * Logout / post-auth transition: prevent Back-button restoration via caches.
 * Clear-Site-Data is origin-scoped (neuniversity vs pronline stay isolated).
 * @param {import('express').Response} res
 */
function applyLogoutResponseHeaders(res) {
  setV5PrivateNoStore(res);
  try {
    res.setHeader("Clear-Site-Data", '"cache"');
    res.setHeader("Expires", "0");
  } catch {
    /* headers may be unavailable */
  }
}

/**
 * Issue a new session cookie after authentication.
 * Regenerates browser session identity by revoking any prior cookie for *this*
 * deployment only (never touches other deployment_code rows).
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   rawToken: string,
 *   env?: NodeJS.ProcessEnv,
 *   isProduction?: boolean,
 *   getPool?: () => { query: Function },
 * }} opts
 */
async function issueAuthenticatedSessionCookie(req, res, opts) {
  const options = opts || {};
  const env = options.env || process.env;
  const rawToken = String(options.rawToken || "");
  if (!rawToken) {
    return { ok: false, code: "missing_token", priorRevoked: false };
  }

  const prior = readV5SessionCookie(req, env);
  const deployment = getPlatformDeploymentCode(env);
  let priorRevoked = false;

  if (
    prior &&
    prior !== rawToken &&
    deployment.ok &&
    deployment.code &&
    typeof options.getPool === "function"
  ) {
    try {
      const pool = options.getPool();
      if (pool && typeof pool.query === "function") {
        const result = await revokeV5Session(pool, {
          rawToken: prior,
          deploymentCode: deployment.code,
        });
        priorRevoked = Boolean(result && result.revoked);
      }
    } catch {
      /* fail-open: still set the new cookie */
    }
  }

  setV5SessionCookie(res, rawToken, {
    secure: options.isProduction === true,
    env,
    req,
  });
  applyAuthenticatedResponseHeaders(res);

  return {
    ok: true,
    code: "issued",
    priorRevoked,
    sessionCookieName: getV5SessionCookieName(env, req),
    deploymentCode: deployment.ok ? deployment.code : null,
  };
}

/**
 * Shared logout: deployment-scoped revoke + clear host-only cookies + no-store.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   isProduction?: boolean,
 *   getPool?: () => { query: Function },
 *   extraCookieNames?: string[],
 * }} [deps]
 */
async function logoutAuthenticatedBrowserSession(req, res, deps) {
  const options = deps || {};
  const env = options.env || process.env;
  const result = await terminateV5BrowserSession(req, res, {
    env,
    isProduction: options.isProduction === true,
    getPool: options.getPool,
    csrfCookieName: resolveCsrfCookieName(env, req),
    extraCookieNames: options.extraCookieNames,
  });
  applyLogoutResponseHeaders(res);
  return result;
}

/**
 * Middleware: once session is loaded, mark authenticated responses private/no-store.
 */
function createAuthenticatedResponseNoStoreMiddleware() {
  return function authenticatedResponseNoStore(req, res, next) {
    if (req.v5Session && req.v5Session.authenticated) {
      applyAuthenticatedResponseHeaders(res);
    }
    return next();
  };
}

/**
 * Prove V8 logout cannot revoke a V7 deployment session row (same user, different code).
 * Pure SQL helper for tests / ops checks — does not mutate when dry.
 *
 * @param {{ query: Function }} db
 * @param {{ userId: string, v7DeploymentCode: string, v8DeploymentCode: string }} input
 */
async function countActiveSessionsByDeployment(db, input) {
  const r = await db.query(
    `SELECT deployment_code, count(*)::int AS n
       FROM platform.deployment_sessions
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > now()
        AND deployment_code = ANY($2::text[])
      GROUP BY deployment_code`,
    [input.userId, [input.v7DeploymentCode, input.v8DeploymentCode]]
  );
  const map = Object.create(null);
  for (const row of r.rows) {
    map[String(row.deployment_code)] = Number(row.n) || 0;
  }
  return map;
}

module.exports = {
  resolveSessionSigningSecret,
  describeSessionCookieIsolation,
  applyAuthenticatedResponseHeaders,
  applyLogoutResponseHeaders,
  issueAuthenticatedSessionCookie,
  logoutAuthenticatedBrowserSession,
  createAuthenticatedResponseNoStoreMiddleware,
  countActiveSessionsByDeployment,
  clearV5SessionCookie,
};
