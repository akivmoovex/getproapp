"use strict";

/**
 * ActiveClinic auth HTTP routes (login, org select, logout, password change).
 * Views: AC-V6-S01 Stitch-backed auth layout.
 */

const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
  getCsrfCookieName,
} = require("../../platform/http/v5Csrf");
const {
  setV5SessionCookie,
  clearV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { terminateV5BrowserSession } = require("../../platform/session/terminateV5BrowserSession");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const { resolveHostname } = require("../../platform/host");
const {
  authenticateActiveClinicIdentity,
  completeActiveClinicOrganizationSelection,
  STATUS: AUTH_STATUS,
} = require("../services/authenticateActiveClinicIdentity");
const {
  changeActiveClinicPassword,
  RESULT: PW_RESULT,
} = require("../services/changeActiveClinicPassword");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const { createPlatformIdentitySession } = require("../../platform/session/createDeploymentSession");
const {
  renderLoginPage,
  renderOrgSelectPage,
  renderChangePasswordPage,
} = require("./renderActiveClinicAuth");

const SELECTION_COOKIE = "activeclinic_org_xfer";

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function clientIp(req) {
  return String(
    (req.headers && req.headers["x-forwarded-for"]) ||
      req.ip ||
      (req.socket && req.socket.remoteAddress) ||
      ""
  )
    .split(",")[0]
    .trim();
}

function safeNextPath(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s.startsWith("/") || s.startsWith("//")) return "/app";
  if (s.includes("://") || s.includes("\\")) return "/app";
  if (s.length > 200) return "/app";
  return s === "/" ? "/app" : s;
}

function loginErrorMessage(result) {
  if (result.status === AUTH_STATUS.ACCESS_UNAVAILABLE) {
    return "Access is not available for this account.";
  }
  if (result.failureCategory === "account_locked") {
    return "Sign-in is temporarily locked. Please wait and try again.";
  }
  return "Phone/email or password is incorrect.";
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicAuthRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const id = String((req.body && req.body.identifier) || "")
        .trim()
        .toLowerCase();
      return sha256Hex(`${id}|${clientIp(req)}`);
    },
    handler: (req, res) => {
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
      return res.status(429).type("html").send(
        renderLoginPage({
          csrfToken,
          error: "Too many sign-in attempts. Please wait a few minutes and try again.",
          identifier: "",
        })
      );
    },
  });

  function issuePageCsrf(res, req) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env, req });
    return token;
  }

  app.get("/login", (req, res) => {
    if (req.activeClinicAuth && req.activeClinicAuth.authenticated) {
      if (req.activeClinicAuth.mustChangePassword) {
        return res.redirect(303, "/account/change-password");
      }
      return res.redirect(303, "/app");
    }
    const csrfToken = issuePageCsrf(res, req);
    let notice = null;
    if (req.query && req.query.activated === "1") {
      notice = "Your account is activated. Sign in with your new password.";
    } else if (req.query && req.query.reset === "1") {
      notice = "Your password was updated. Sign in with your new password.";
    } else if (req.query && req.query.expired === "1") {
      notice = "Your session ended. Sign in again to continue.";
    }
    return res
      .status(200)
      .type("html")
      .send(renderLoginPage({ csrfToken, error: null, notice }));
  });

  app.post("/login", loginLimiter, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const csrfToken = issuePageCsrf(res, req);
        return res.status(403).type("html").send(
          renderLoginPage({
            csrfToken,
            error: "Your session expired. Please try again.",
            identifier: req.body && req.body.identifier,
          })
        );
      }
      const deployment = getPlatformDeploymentCode(env);
      if (!deployment.ok || !deployment.code) {
        return res.status(503).type("html").send("Deployment unavailable");
      }
      const result = await authenticateActiveClinicIdentity(getPool(), {
        identifier: req.body && req.body.identifier,
        password: req.body && req.body.password,
        deploymentCode: deployment.code,
        hostname: resolveHostname(req) || "activeclinic.org",
        country: String((req.body && req.body.phone_country) || "ZM")
          .trim()
          .toUpperCase() || "ZM",
        ip: clientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      if (result.status === AUTH_STATUS.SELECT_ORGANIZATION) {
        res.cookie(SELECTION_COOKIE, result.selectionToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: "lax",
          path: "/",
          maxAge: 5 * 60 * 1000,
        });
        const csrfToken = issuePageCsrf(res, req);
        return res.status(200).type("html").send(
          renderOrgSelectPage({
            csrfToken,
            error: null,
            organizations: result.organizations,
          })
        );
      }

      if (!result.ok) {
        const csrfToken = issuePageCsrf(res, req);
        return res.status(401).type("html").send(
          renderLoginPage({
            csrfToken,
            error: loginErrorMessage(result),
            identifier: req.body && req.body.identifier,
            phoneCountry: req.body && req.body.phone_country,
          })
        );
      }

      setV5SessionCookie(res, result.rawToken, { secure: isProduction, env, req });
      res.clearCookie(SELECTION_COOKIE, { path: "/" });
      if (result.mustChangePassword || result.status === AUTH_STATUS.MUST_CHANGE_PASSWORD) {
        return res.redirect(303, "/account/change-password");
      }
      return res.redirect(303, safeNextPath(req.body && req.body.next));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/login/select-organization", (req, res) => {
    const token = req.cookies && req.cookies[SELECTION_COOKIE];
    if (!token) return res.redirect(303, "/login");
    const csrfToken = issuePageCsrf(res, req);
    return res.status(200).type("html").send(
      renderOrgSelectPage({
        csrfToken,
        error: "Your organization selection expired. Sign in again to continue.",
        organizations: [],
      })
    );
  });

  app.post("/login/select-organization", async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.redirect(303, "/login");
      }
      const selectionToken = req.cookies && req.cookies[SELECTION_COOKIE];
      const deployment = getPlatformDeploymentCode(env);
      if (!deployment.ok || !selectionToken) {
        return res.redirect(303, "/login");
      }
      const completed = await completeActiveClinicOrganizationSelection(getPool(), {
        selectionToken,
        organizationId: req.body && req.body.organization_id,
        deploymentCode: deployment.code,
        hostname: resolveHostname(req) || "activeclinic.org",
        ip: clientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      if (!completed.ok) {
        const csrfToken = issuePageCsrf(res, req);
        return res.status(401).type("html").send(
          renderLoginPage({
            csrfToken,
            error: "Access is not available for this account.",
          })
        );
      }
      setV5SessionCookie(res, completed.rawSessionToken, { secure: isProduction, env, req });
      res.clearCookie(SELECTION_COOKIE, { path: "/" });
      if (completed.mustChangePassword) {
        return res.redirect(303, "/account/change-password");
      }
      return res.redirect(303, "/app");
    } catch (err) {
      return next(err);
    }
  });

  async function handleLogout(req, res) {
    try {
      const identityId =
        req.activeClinicAuth &&
        req.activeClinicAuth.platformIdentity &&
        req.activeClinicAuth.platformIdentity.id;
      if (identityId) {
        const editSessionService = require("../../platform/website/editSessionService");
        await editSessionService.closeOpenSessionsForEditor(
          getPool(),
          identityId,
          editSessionService.CLOSE_REASON.LOGOUT
        ).catch(() => {});
      }
      await terminateV5BrowserSession(req, res, {
        env,
        isProduction,
        getPool,
        csrfCookieName: getCsrfCookieName(env, req),
        extraCookieNames: [SELECTION_COOKIE],
      });
    } catch {
      try {
        clearV5SessionCookie(res, { secure: isProduction, env, req });
        res.clearCookie(getCsrfCookieName(env, req), { path: "/" });
        res.clearCookie(SELECTION_COOKIE, { path: "/" });
      } catch {
        /* ignore secondary clear failures */
      }
    }
    return res.redirect(303, "/login");
  }

  // GET is the recovery path for stale CSRF / bookmarks / https://host/logout.
  // POST remains the UI action. Neither depends on tenant/org/facility context.
  app.get("/logout", handleLogout);
  app.post("/logout", handleLogout);

  const requireAuthPw = createRequireActiveClinicAuth({
    allowPasswordChangeOnly: true,
    env,
    isProduction,
  });

  app.get("/account/change-password", requireAuthPw, (req, res) => {
    const csrfToken = issuePageCsrf(res, req);
    return res.status(200).type("html").send(renderChangePasswordPage({ csrfToken, error: null }));
  });

  app.post("/account/change-password", requireAuthPw, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const csrfToken = issuePageCsrf(res, req);
        return res.status(403).type("html").send(
          renderChangePasswordPage({
            csrfToken,
            error: "Your session expired. Please try again.",
          })
        );
      }
      const auth = req.activeClinicAuth;
      const deployment = getPlatformDeploymentCode(env);
      const changed = await changeActiveClinicPassword(getPool(), {
        platformIdentityId: auth.platformIdentity.id,
        currentPassword: req.body && req.body.current_password,
        newPassword: req.body && req.body.new_password,
        confirmPassword: req.body && req.body.confirm_password,
        deploymentCode: deployment.code,
        organizationId: auth.organization && auth.organization.id,
      });
      if (!changed.ok) {
        const csrfToken = issuePageCsrf(res, req);
        const error =
          changed.code === PW_RESULT.WEAK_PASSWORD
            ? "Password must be at least 10 characters."
            : changed.code === PW_RESULT.MISMATCH
              ? "New password and confirmation do not match."
              : "Current password is incorrect.";
        return res.status(400).type("html").send(renderChangePasswordPage({ csrfToken, error }));
      }

      const fresh = await createPlatformIdentitySession(getPool(), {
        deploymentCode: deployment.code,
        platformIdentityId: auth.platformIdentity.id,
        organizationId: auth.organization.id,
        ip: clientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      if (fresh.ok) {
        setV5SessionCookie(res, fresh.rawToken, { secure: isProduction, env, req });
      }
      return res.redirect(303, "/app");
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerActiveClinicAuthRoutes,
  SELECTION_COOKIE,
  renderLoginPage,
};
