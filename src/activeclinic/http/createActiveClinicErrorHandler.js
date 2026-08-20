"use strict";

/**
 * ActiveClinic HTML-aware error handler (AC-V6-S08 / ACW11).
 * JSON/API and non-HTML requests keep the shared V5 safe handler.
 * Public platform paths use public chrome; /app keeps staff access-state.
 * Status codes stay real (404/503/500) even when a styled page exists.
 */

const {
  createV5ErrorHandler,
  buildSafeErrorLog,
} = require("../../platform/http/v5SafeLogging");
const {
  renderAccessStatePage,
} = require("./renderActiveClinicAccessState");
const {
  renderPublicSystemStatePage,
} = require("./renderActiveClinicPublic");
const {
  STATE,
  buildFullPageState,
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

function isAppSurfacePath(path) {
  return path === "/app" || path.startsWith("/app/");
}

function isPublicPlatformErrorPath(path) {
  return !isAppSurfacePath(path) && !isAuthPublicPath(path);
}

function safeRetryHref(req) {
  const raw = String((req && (req.originalUrl || req.url || req.path)) || "/");
  const pathOnly = raw.split("?")[0];
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//") || pathOnly.includes("\\")) {
    return "/";
  }
  return pathOnly || "/";
}

function sendPublicSystem(res, status, input, fallbackHtml) {
  try {
    return res.status(status).type("html").send(renderPublicSystemStatePage(input));
  } catch (_err) {
    return res.status(status).type("html").send(fallbackHtml);
  }
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
    const publicSurface = isPublicPlatformErrorPath(path);

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
      if (publicSurface) {
        const built = buildFullPageState(STATE.NOT_FOUND, {});
        return sendPublicSystem(
          res,
          404,
          {
            pageId: "public-system-not-found",
            pageTitle: built.pageTitle,
            acwScreen: "ACW11-404",
            statePageId: "not-found",
            stateKey: STATE.NOT_FOUND,
            heading: built.heading,
            message: "We could not find that page. Use Home, Find a Clinic, or Login to continue.",
            actions: [
              { href: "/", label: "Home", primary: true },
              { href: "/clinics", label: "Find a Clinic" },
              { href: "/login", label: "Login" },
            ],
          },
          renderAccessStatePage({
            stateKey: STATE.NOT_FOUND,
            pageId: "not-found",
            primaryHref: "/",
            primaryLabel: "Home",
          })
        );
      }
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
      const retryHref = publicSurface ? safeRetryHref(req) : path || "/app";
      if (publicSurface) {
        const built = buildFullPageState(STATE.SERVICE_UNAVAILABLE, {});
        return sendPublicSystem(
          res,
          503,
          {
            pageId: "public-system-unavailable",
            pageTitle: built.pageTitle,
            acwScreen: "ACW11-503",
            statePageId: "service-unavailable",
            stateKey: STATE.SERVICE_UNAVAILABLE,
            heading: built.heading,
            message: built.message,
            supportReference,
            actions: [
              { href: retryHref, label: "Try again", primary: true },
              { href: "/", label: "Home" },
              { href: "/clinics", label: "Find a Clinic" },
            ],
          },
          renderAccessStatePage({
            stateKey: STATE.SERVICE_UNAVAILABLE,
            pageId: "service-unavailable",
            supportReference,
            primaryHref: retryHref,
            primaryLabel: "Try again",
          })
        );
      }
      const html = renderAccessStatePage({
        stateKey: STATE.SERVICE_UNAVAILABLE,
        pageId: "service-unavailable",
        supportReference,
        primaryHref: retryHref,
        primaryLabel: "Try again",
      });
      return res.status(503).type("html").send(html);
    }

    const errorStatus = status >= 400 ? status : 500;
    if (publicSurface) {
      const built = buildFullPageState(STATE.REQUEST_ERROR, {});
      return sendPublicSystem(
        res,
        errorStatus,
        {
          pageId: "public-system-error",
          pageTitle: built.pageTitle,
          acwScreen: "ACW11-error",
          statePageId: "error",
          stateKey: STATE.REQUEST_ERROR,
          heading: built.heading,
          message: "Please try again. If the problem continues, return home or sign in later.",
          supportReference: isProduction ? supportReference : supportReference,
          actions: [
            { href: "/", label: "Home", primary: true },
            { href: "/login", label: "Login" },
            { href: safeRetryHref(req), label: "Try again" },
          ],
        },
        renderAccessStatePage({
          stateKey: STATE.REQUEST_ERROR,
          pageId: "error",
          supportReference: isProduction ? supportReference : supportReference,
          primaryHref: "/",
          primaryLabel: "Home",
        })
      );
    }

    const html = renderAccessStatePage({
      stateKey: STATE.REQUEST_ERROR,
      pageId: "error",
      supportReference: isProduction ? supportReference : supportReference,
      primaryHref: isAuthPublicPath(path) ? "/login" : "/app",
      primaryLabel: isAuthPublicPath(path) ? "Sign in" : "Back to home",
    });
    return res.status(errorStatus).type("html").send(html);
  };
}

module.exports = {
  createActiveClinicErrorHandler,
  wantsHtml,
};
