"use strict";

/**
 * Shared V5 session gate: distinguish missing/invalid sessions from transient store failures.
 * Store errors must not force a login redirect (cookie remains valid; retry should succeed).
 */

const { createV5AuthLogger } = require("./v5AuthObservability");
const { readV5SessionCookie } = require("../session/v5SessionCookie");
const { setV5PrivateNoStore } = require("./v5PrivateNoStore");

/** @typedef {'no_session_cookie'|'session_not_found'|'session_expired'|'session_revoked'|'inactive_user'|'deployment_mismatch'|'deployment_unavailable'|'role_not_authorized'|'tenant_context_missing'|'session_store_error'|'unauthenticated'} V5AuthReasonCode */

const STORE_ERROR_REASONS = new Set([
  "lookup_error",
  "pool_unavailable",
  "deployment_unavailable",
  "session_store_error",
]);

/**
 * @param {unknown} rawReason
 * @param {{ cookiePresent?: boolean }} [opts]
 * @returns {V5AuthReasonCode}
 */
function mapV5SessionReasonToAuthCode(rawReason, opts) {
  const reason = String(rawReason || "").trim();
  const cookiePresent = Boolean(opts && opts.cookiePresent);
  if (!cookiePresent && (!reason || reason === "none")) return "no_session_cookie";
  if (STORE_ERROR_REASONS.has(reason)) return "session_store_error";
  if (reason === "expired") return "session_expired";
  if (reason === "revoked") return "session_revoked";
  if (reason === "inactive_user") return "inactive_user";
  if (reason === "deployment_mismatch") return "deployment_mismatch";
  if (reason === "deployment_unavailable") return "deployment_unavailable";
  if (reason === "unauthenticated") {
    return cookiePresent ? "session_not_found" : "no_session_cookie";
  }
  if (reason === "ok") return "unauthenticated";
  return cookiePresent ? "session_not_found" : "no_session_cookie";
}

/**
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function hasV5SessionCookie(req) {
  return Boolean(readV5SessionCookie(req));
}

/**
 * @param {import('express').Request} req
 * @returns {{ authenticated: boolean, reason: string, authCode: V5AuthReasonCode, cookiePresent: boolean }}
 */
function inspectV5SessionAuth(req) {
  const cookiePresent = hasV5SessionCookie(req);
  const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
  const reason =
    (req.v5Session && req.v5Session.reason) || (cookiePresent ? "unauthenticated" : "none");
  return {
    authenticated,
    reason: String(reason),
    authCode: mapV5SessionReasonToAuthCode(reason, { cookiePresent }),
    cookiePresent,
  };
}

/**
 * @param {import('express').Response} res
 * @param {string} authCode
 */
function setAuthReasonHeader(res, authCode) {
  try {
    res.setHeader("X-BB-Auth-Reason", String(authCode || "").slice(0, 64));
  } catch {
    /* headers may be unavailable */
  }
}

/**
 * @param {{
 *   loginNext: string,
 *   log?: (line: string) => void,
 *   sendStoreUnavailable?: (req: import('express').Request, res: import('express').Response, authCode: string) => unknown,
 * }} deps
 */
function createRequireV5AuthenticatedSession(deps) {
  const loginNextDefault = String((deps && deps.loginNext) || "/login");
  const authLog = createV5AuthLogger({ log: deps && deps.log });
  const sendStoreUnavailable =
    typeof deps.sendStoreUnavailable === "function"
      ? deps.sendStoreUnavailable
      : defaultSendStoreUnavailable;

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {{ loginNext?: string }} [opts]
   * @returns {boolean} true when the request may continue
   */
  return function requireV5AuthenticatedSession(req, res, opts) {
    const inspected = inspectV5SessionAuth(req);
    if (inspected.authenticated) return true;

    const loginNext = String((opts && opts.loginNext) || loginNextDefault || "/login");
    const authCode = inspected.authCode;
    setV5PrivateNoStore(res);
    setAuthReasonHeader(res, authCode);

    authLog.logAuthEvent(req, "v5_session_auth_gate", {
      outcome: authCode === "session_store_error" ? "store_unavailable" : "login_redirect",
      failureCategory: authCode,
      redirectTo: authCode === "session_store_error" ? null : `/login?next=${loginNext}`,
      cookieHeaderPresent: inspected.cookiePresent,
      sessionFound: false,
      authenticatedUserPresent: false,
      sessionLookupResult: inspected.reason,
      redirectReason: authCode,
      tenantContextPresent: Boolean(
        req.blessBoardTenantContext && req.blessBoardTenantContext.resolved === true
      ),
    });

    if (authCode === "session_store_error") {
      sendStoreUnavailable(req, res, authCode);
      return false;
    }

    const wantsHtml = String(req.get("accept") || "").includes("text/html");
    if (wantsHtml) {
      res.redirect(303, `/login?next=${encodeURIComponent(loginNext)}`);
      return false;
    }
    res.status(401).type("text").send("Sign-in is required.");
    return false;
  };
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} authCode
 */
function defaultSendStoreUnavailable(req, res, authCode) {
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  const message =
    "Your session could not be verified right now. Refresh the page and try again — you should not need to sign in again.";
  if (!wantsHtml) {
    return res.status(503).type("text").send(message);
  }
  return res.status(503).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Temporarily unavailable · BlessBoard</title>
</head>
<body>
  <main>
    <h1>Temporarily unavailable</h1>
    <p>${message}</p>
    <p><a href="${escapeHtmlAttr(req.originalUrl || "/")}">Try again</a></p>
  </main>
</body>
</html>`);
}

/**
 * @param {unknown} value
 */
function escapeHtmlAttr(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

module.exports = {
  STORE_ERROR_REASONS,
  mapV5SessionReasonToAuthCode,
  hasV5SessionCookie,
  inspectV5SessionAuth,
  setAuthReasonHeader,
  createRequireV5AuthenticatedSession,
  defaultSendStoreUnavailable,
};
