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
const {
  resolveBlessBoardFormPhone,
  blessBoardPhoneFieldLocals,
} = require("../services/resolveBlessBoardFormPhone");
const authRepo = require("../repositories/blessBoardAuthRepository");

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
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    return csrfToken;
  }

  function forgotLocals(req, res, extra) {
    const phoneLocals = blessBoardPhoneFieldLocals({
      env,
      selectedCountry: extra && extra.phoneCountryValue,
      nationalValue: extra && extra.phoneNationalValue,
    });
    return {
      csrfToken: issueCsrf(req, res),
      message: null,
      error: null,
      emailValue: "",
      phoneCountryValue: "",
      phoneNationalValue: "",
      loginHref: "/login",
      ...phoneLocals,
      defaultPhoneCountry: phoneLocals.defaultCountry || "ZM",
      ...(extra || {}),
    };
  }

  router.get("/forgot-password", requireApex, (req, res) => {
    const html = renderV5Ejs("apex/forgot-password.ejs", forgotLocals(req, res, {}));
    res.status(200).type("html").send(html);
  });

  router.post("/forgot-password", requireApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    const phoneResolved = resolveBlessBoardFormPhone(req.body, {
      required: false,
      env,
      allowLegacyPhone: false,
    });
    const emailRaw = String((req.body && req.body.email) || "").trim();
    if (!validateCsrf(req, submitted, env)) {
      const html = renderV5Ejs(
        "apex/forgot-password.ejs",
        forgotLocals(req, res, {
          error: "Your session expired. Please try again.",
          emailValue: emailRaw,
          phoneCountryValue: phoneResolved.fields.phoneCountry,
          phoneNationalValue: phoneResolved.fields.phoneNational,
        })
      );
      return res.status(403).type("html").send(html);
    }

    let emailForReset = emailRaw;
    // Phone path: look up account and deliver via email when present (no OTP/SMS).
    if (!emailForReset && phoneResolved.e164) {
      try {
        const byPhone = await authRepo.findUserByPhone(
          getPool(),
          phoneResolved.e164
        );
        if (byPhone && (byPhone.email_normalized || byPhone.email_display)) {
          emailForReset = byPhone.email_normalized || byPhone.email_display;
        }
      } catch (_err) {
        /* enumeration-safe: fall through to neutral message */
      }
    }

    if (emailForReset) {
      await requestPasswordReset(getPool(), {
        email: emailForReset,
        requestIp: clientIp(req),
        env,
        publicBaseUrl: getApexOrigin(env, req.hostname),
        source: "public_forgot_password",
      });
    }

    const html = renderV5Ejs(
      "apex/forgot-password.ejs",
      forgotLocals(req, res, {
        message: NEUTRAL_MESSAGE,
        emailValue: "",
        phoneCountryValue: "",
        phoneNationalValue: "",
      })
    );
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
