"use strict";

/**
 * Public forgot-password / reset-password routes for BlessBoard V5.
 */

const express = require("express");
const {
  CSRF_FIELD,
  validateCsrf,
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { getApexOrigin } = require("./tenantLoginHelpers");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  requestPasswordReset,
  completePasswordReset,
  inspectPasswordResetToken,
  STATUS,
  NEUTRAL_MESSAGE,
} = require("../services/passwordResetService");

function clientIp(req) {
  const xf = req && req.headers && req.headers["x-forwarded-for"];
  if (xf) return String(xf).split(",")[0].trim();
  return (req && req.ip) || "";
}

function createPasswordResetRouter(opts) {
  const getPool = opts.getPool;
  const env = opts.env || process.env;
  const isApexHost = opts.isApexHost;
  const isProduction = String(env.NODE_ENV || "").toLowerCase() === "production";
  const router = express.Router();

  function requireApex(req, res, next) {
    if (typeof isApexHost === "function" && !isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    return next();
  }

  function issueCsrf(req, res) {
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return csrfToken;
  }

  router.get("/forgot-password", requireApex, (req, res) => {
    const csrfToken = issueCsrf(req, res);
    const html = renderV5Ejs("apex/forgot-password.ejs", {
      csrfToken,
      message: null,
      error: null,
      emailValue: "",
      loginHref: "/login",
    });
    res.status(200).type("html").send(html);
  });

  router.post("/forgot-password", requireApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      const csrfToken = issueCsrf(req, res);
      const html = renderV5Ejs("apex/forgot-password.ejs", {
        csrfToken,
        message: null,
        error: "Your session expired. Please try again.",
        emailValue: "",
        loginHref: "/login",
      });
      return res.status(403).type("html").send(html);
    }

    await requestPasswordReset(getPool(), {
      email: req.body && req.body.email,
      requestIp: clientIp(req),
      env,
      publicBaseUrl: getApexOrigin(env, req.hostname),
      source: "public_forgot_password",
    });

    const csrfToken = issueCsrf(req, res);
    const html = renderV5Ejs("apex/forgot-password.ejs", {
      csrfToken,
      message: NEUTRAL_MESSAGE,
      error: null,
      emailValue: "",
      loginHref: "/login",
    });
    return res.status(200).type("html").send(html);
  });

  router.get("/reset-password", requireApex, async (req, res) => {
    const csrfToken = issueCsrf(req, res);
    const token = String((req.query && req.query.token) || "").trim();
    const inspection = await inspectPasswordResetToken(getPool(), token);
    const html = renderV5Ejs("apex/reset-password.ejs", {
      csrfToken,
      token: inspection.ok ? token : "",
      tokenValid: Boolean(inspection.ok),
      tokenStatus: inspection.status,
      error: null,
      message: null,
      loginHref: "/login",
      forgotHref: "/forgot-password",
    });
    return res.status(inspection.ok ? 200 : 400).type("html").send(html);
  });

  router.post("/reset-password", requireApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    const token = String((req.body && req.body.token) || "").trim();
    if (!validateCsrf(req, submitted, env)) {
      const csrfToken = issueCsrf(req, res);
      const html = renderV5Ejs("apex/reset-password.ejs", {
        csrfToken,
        token,
        tokenValid: true,
        tokenStatus: STATUS.OK,
        error: "Your session expired. Please try again.",
        message: null,
        loginHref: "/login",
        forgotHref: "/forgot-password",
      });
      return res.status(403).type("html").send(html);
    }

    const result = await completePasswordReset(getPool(), {
      token,
      password: req.body && req.body.password,
      passwordConfirm: req.body && req.body.password_confirm,
    });

    if (result.ok) {
      return res.redirect(303, "/login?reset=1");
    }

    let error = "Unable to reset password. Request a new link.";
    if (result.status === STATUS.WEAK_PASSWORD) {
      error = "Password must be between 10 and 200 characters.";
    } else if (result.status === STATUS.MISMATCH) {
      error = "Password confirmation does not match.";
    } else if (result.status === STATUS.EXPIRED) {
      error = "This reset link has expired. Request a new link.";
    } else if (result.status === STATUS.CONSUMED) {
      error = "This reset link was already used. Request a new link.";
    }

    const csrfToken = issueCsrf(req, res);
    const tokenStillValid = !(
      result.status === STATUS.INVALID_TOKEN ||
      result.status === STATUS.CONSUMED ||
      result.status === STATUS.EXPIRED
    );
    const html = renderV5Ejs("apex/reset-password.ejs", {
      csrfToken,
      token: tokenStillValid ? token : "",
      tokenValid: tokenStillValid,
      tokenStatus: result.status,
      error,
      message: null,
      loginHref: "/login",
      forgotHref: "/forgot-password",
    });
    return res.status(400).type("html").send(html);
  });

  return router;
}

module.exports = {
  createPasswordResetRouter,
};
