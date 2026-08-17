"use strict";

/**
 * ActiveClinic HTML-aware error handler (AC-V6-S08).
 * JSON/API and non-HTML requests keep the shared V5 safe handler.
 */

const {
  createV5ErrorHandler,
  buildSafeErrorLog,
} = require("../../platform/http/v5SafeLogging");
const {
  renderAccessStatePage,
} = require("./renderActiveClinicAccessState");
const {
  STATE,
} = require("../services/activeClinicStateTaxonomy");
const { issueCsrfToken, setCsrfCookie, CSRF_FIELD } = require("../../platform/http/v5Csrf");

function wantsHtml(req) {
  const accept = String((req.headers && req.headers.accept) || "");
  if (accept.includes("application/json") && !accept.includes("text/html")) {
    return false;
  }
  const path = String((req.path || req.url || "").split("?")[0]);
  if (path.startsWith("/__ac/") || path.startsWith("/api/")) return false;
  return accept.includes("text/html") || accept.includes("*/*") || !accept;
}

function isAuthPublicPath(path) {
  return (
    path === "/login" ||
    path === "/logout" ||
    path.startsWith("/login/") ||
    path.startsWith("/activate") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/reset-password") ||
    path === "/account/change-password"
  );
}

/**
 * @param {{ isProduction?: boolean, log?: Function, env?: NodeJS.ProcessEnv }} deps
 */
function createActiveClinicErrorHandler(deps) {
  const isProduction = deps && deps.isProduction === true;
  const env = (deps && deps.env) || process.env;
  const log = (deps && deps.log) || console.error;
  const fallback = createV5ErrorHandler({ isProduction, log });

  return function activeClinicErrorHandler(err, req, res, next) {
    if (res.headersSent) return next(err);

    const status =
      (err && (err.statusCode || err.status) && Number(err.statusCode || err.status)) ||
      500;
    const path = String((req && (req.path || req.url)) || "").split("?")[0];

    try {
      log(buildSafeErrorLog(err, req, { includeMessage: !isProduction }));
    } catch (_logErr) {
      /* ignore */
    }

    if (!wantsHtml(req)) {
      return fallback(err, req, res, next);
    }

    const requestId = (req && req.requestId) || null;
    const supportReference =
      requestId && String(requestId).length <= 32 ? String(requestId) : null;

    if (status === 404) {
      const html = renderAccessStatePage({
        stateKey: STATE.NOT_FOUND,
        pageId: "not-found",
        primaryHref: isAuthPublicPath(path) ? "/login" : "/app",
        primaryLabel: isAuthPublicPath(path) ? "Sign in" : "Back to home",
      });
      return res.status(404).type("html").send(html);
    }

    if (status === 401) {
      const html = renderAccessStatePage({
        stateKey: STATE.SESSION_EXPIRED,
        pageId: "session-expired",
        primaryHref: "/login?expired=1",
        primaryLabel: "Sign in",
      });
      return res.status(401).type("html").send(html);
    }

    if (status === 403) {
      const showLogout = !isAuthPublicPath(path);
      let csrfToken = "";
      if (showLogout) {
        csrfToken = issueCsrfToken(env);
        setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
      }
      const html = renderAccessStatePage({
        stateKey: STATE.ACCESS_RESTRICTED,
        pageId: "access-denied",
        primaryHref: isAuthPublicPath(path) ? "/login" : "/app",
        primaryLabel: isAuthPublicPath(path) ? "Sign in" : "Back to home",
        showLogout,
        csrfField: CSRF_FIELD,
        csrfToken,
      });
      return res.status(403).type("html").send(html);
    }

    if (status === 503) {
      const html = renderAccessStatePage({
        stateKey: STATE.SERVICE_UNAVAILABLE,
        pageId: "service-unavailable",
        supportReference,
        primaryHref: path || "/app",
        primaryLabel: "Try again",
      });
      return res.status(503).type("html").send(html);
    }

    const html = renderAccessStatePage({
      stateKey: STATE.REQUEST_ERROR,
      pageId: "error",
      supportReference: isProduction ? supportReference : supportReference,
      primaryHref: isAuthPublicPath(path) ? "/login" : "/app",
      primaryLabel: isAuthPublicPath(path) ? "Sign in" : "Back to home",
    });
    return res.status(status >= 400 ? status : 500).type("html").send(html);
  };
}

module.exports = {
  createActiveClinicErrorHandler,
  wantsHtml,
};
