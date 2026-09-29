"use strict";

/**
 * Fail-open V5 session loader. Invalid/expired session → unauthenticated, not process failure.
 * Transient store failures keep cookie intact and surface reason "lookup_error" / "pool_unavailable"
 * so gates can return 503 instead of a false login redirect.
 */

const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");
const { readV5Session } = require("../session/readV5Session");
const { readV5SessionCookie } = require("../session/v5SessionCookie");
const { hashSessionToken } = require("../session/sessionToken");
const { createV5AuthLogger } = require("./v5AuthObservability");
const {
  resolveSessionExpectedProductCode,
} = require("../session/deploymentApplicationCompatibility");

/**
 * @param {string | null | undefined} rawToken
 * @returns {string | null}
 */
function truncatedSessionFingerprint(rawToken) {
  if (!rawToken) return null;
  try {
    return hashSessionToken(rawToken).slice(0, 12);
  } catch {
    return null;
  }
}

/**
 * @param {string} pathOnly
 */
function wantsSessionDiagnostics(pathOnly) {
  const p = String(pathOnly || "");
  return (
    p === "/admin" ||
    p.startsWith("/admin/") ||
    p === "/branch-admin" ||
    p.startsWith("/branch-admin/") ||
    p === "/hq" ||
    p.startsWith("/hq/")
  );
}

/**
 * @param {{
 *   getPool?: () => { query: Function } | null | undefined,
 *   getDeploymentCode?: () => { ok: boolean, code: string | null },
 *   readSession?: Function,
 *   log?: (line: string) => void,
 *   env?: NodeJS.ProcessEnv,
 * }} [deps]
 */
function createLoadV5Session(deps) {
  const options = deps && typeof deps === "object" ? deps : {};
  const getPool = options.getPool;
  const getDeployment =
    options.getDeploymentCode || (() => getPlatformDeploymentCode(options.env));
  const readSession = options.readSession || readV5Session;
  const authLog = createV5AuthLogger({ log: options.log });
  const env = options.env;

  return async function loadV5Session(req, res, next) {
    req.v5Session = { authenticated: false, reason: "none", session: null };
    const pathOnly = String(req.path || "").split("?")[0];
    const diagnose = wantsSessionDiagnostics(pathOnly);
    let rawToken = null;
    try {
      const identity = getDeployment();
      if (!identity || !identity.ok || !identity.code) {
        req.v5Session = {
          authenticated: false,
          reason: "deployment_unavailable",
          session: null,
        };
        if (diagnose) {
          authLog.logAuthEvent(req, "v5_session_lookup_failed", {
            outcome: "unauthenticated",
            failureCategory: "deployment_unavailable",
            cookieHeaderPresent: Boolean(req.headers && req.headers.cookie),
            sessionFound: false,
            sessionLookupResult: "deployment_unavailable",
          });
        }
        return next();
      }
      rawToken = readV5SessionCookie(req, env);
      if (!rawToken) {
        if (diagnose) {
          authLog.logAuthEvent(req, "v5_session_cookie_missing", {
            outcome: "unauthenticated",
            cookieHeaderPresent: Boolean(req.headers && req.headers.cookie),
            sessionFound: false,
            sessionLookupResult: "no_session_cookie",
          });
        }
        return next();
      }
      if (typeof getPool !== "function") {
        req.v5Session = { authenticated: false, reason: "pool_unavailable", session: null };
        if (diagnose) {
          authLog.logAuthEvent(req, "v5_session_lookup_failed", {
            outcome: "unauthenticated",
            failureCategory: "pool_unavailable",
            cookieHeaderPresent: true,
            sessionFound: false,
            sessionLookupResult: "pool_unavailable",
            sessionFingerprint: truncatedSessionFingerprint(rawToken),
          });
        }
        return next();
      }
      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        req.v5Session = { authenticated: false, reason: "pool_unavailable", session: null };
        if (diagnose) {
          authLog.logAuthEvent(req, "v5_session_lookup_failed", {
            outcome: "unauthenticated",
            failureCategory: "pool_unavailable",
            cookieHeaderPresent: true,
            sessionFound: false,
            sessionLookupResult: "pool_unavailable",
            sessionFingerprint: truncatedSessionFingerprint(rawToken),
          });
        }
        return next();
      }

      let result = null;
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          result = await readSession(pool, {
            rawToken,
            deploymentCode: identity.code,
            touch: true,
            expectedProductCode: resolveSessionExpectedProductCode(req, env),
          });
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
          if (attempt === 0) continue;
        }
      }
      if (lastError) {
        req.v5Session = { authenticated: false, reason: "lookup_error", session: null };
        if (diagnose) {
          authLog.logAuthEvent(req, "v5_session_lookup_failed", {
            outcome: "unauthenticated",
            failureCategory: "lookup_error",
            cookieHeaderPresent: true,
            sessionFound: false,
            sessionLookupResult: "lookup_error",
            sessionFingerprint: truncatedSessionFingerprint(rawToken),
          });
        }
        return next();
      }

      if (!result || !result.ok) {
        const code = (result && result.code) || "unauthenticated";
        req.v5Session = { authenticated: false, reason: code, session: null };
        if (diagnose) {
          authLog.logAuthEvent(req, "v5_session_lookup_failed", {
            outcome: "unauthenticated",
            failureCategory: code,
            cookieHeaderPresent: true,
            sessionFound: false,
            sessionLookupResult: code,
            sessionFingerprint: truncatedSessionFingerprint(rawToken),
          });
        }
        return next();
      }
      req.v5Session = { authenticated: true, reason: "ok", session: result.session };
      if (diagnose) {
        authLog.logAuthEvent(req, "v5_session_loaded", {
          outcome: "ok",
          cookieHeaderPresent: true,
          sessionFound: true,
          authenticatedUserPresent: Boolean(
            result.session && result.session.user && result.session.user.id
          ),
          principalType: result.session && result.session.principalType
            ? result.session.principalType
            : null,
          sessionLookupResult: "ok",
          sessionFingerprint: truncatedSessionFingerprint(rawToken),
        });
      }
    } catch {
      req.v5Session = { authenticated: false, reason: "lookup_error", session: null };
      if (diagnose) {
        authLog.logAuthEvent(req, "v5_session_lookup_failed", {
          outcome: "unauthenticated",
          failureCategory: "lookup_error",
          cookieHeaderPresent: Boolean(req.headers && req.headers.cookie),
          sessionFound: false,
          sessionLookupResult: "lookup_error",
          sessionFingerprint: truncatedSessionFingerprint(rawToken),
        });
      }
    }
    return next();
  };
}

module.exports = {
  createLoadV5Session,
  truncatedSessionFingerprint,
  wantsSessionDiagnostics,
};
