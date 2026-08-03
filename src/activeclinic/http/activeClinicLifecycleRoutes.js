"use strict";

/**
 * ActiveClinic public account lifecycle routes: activate, forgot/reset password.
 * Views: AC-V6-S01 shared auth layout (lifecycle screens are STITCH_GAP).
 */

const rateLimit = require("express-rate-limit");
const crypto = require("crypto");

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const {
  previewActivationToken,
  activateActiveClinicStaff,
  RESULT: ACT_RESULT,
} = require("../services/activateActiveClinicStaff");
const {
  requestActiveClinicPasswordReset,
  previewResetToken,
  completeActiveClinicPasswordReset,
  RESULT: RESET_RESULT,
  NEUTRAL_MESSAGE,
} = require("../services/activeClinicPasswordRecoveryService");
const { PASSWORD_MIN } = require("../../platform/services/platformIdentityCredentialService");
const {
  renderActivatePage,
  renderForgotPage,
  renderResetPage,
} = require("./renderActiveClinicAuth");

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

function tokenStateMessage(code) {
  if (code === ACT_RESULT.EXPIRED || code === RESET_RESULT.EXPIRED) {
    return "This link has expired. Ask your administrator for a new link.";
  }
  if (code === ACT_RESULT.REVOKED || code === RESET_RESULT.REVOKED) {
    return "This link has been revoked. Ask your administrator for a new link.";
  }
  if (code === ACT_RESULT.CONSUMED || code === RESET_RESULT.CONSUMED) {
    return "This link has already been used.";
  }
  return "This link is not valid.";
}

function registerActiveClinicLifecycleRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;

  function issuePageCsrf(res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env });
    return token;
  }

  const forgotLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => sha256Hex(`${clientIp(req)}`),
    handler: (req, res) => {
      const csrfToken = issuePageCsrf(res);
      return res.status(200).type("html").send(
        renderForgotPage({
          csrfToken,
          message: NEUTRAL_MESSAGE,
          error: null,
        })
      );
    },
  });

  app.get("/activate/:token", async (req, res, next) => {
    try {
      const deployment = getPlatformDeploymentCode(env);
      const csrfToken = issuePageCsrf(res);
      const preview = await previewActivationToken(getPool(), {
        rawToken: req.params.token,
        deploymentCode: deployment.ok ? deployment.code : null,
      });
      if (!preview.ok) {
        return res
          .status(400)
          .type("html")
          .send(
            renderActivatePage({
              csrfToken,
              token: req.params.token,
              preview: null,
              stateCode: preview.code,
              error: tokenStateMessage(preview.code),
            })
          );
      }
      return res.status(200).type("html").send(
        renderActivatePage({
          csrfToken,
          token: req.params.token,
          preview: preview.preview,
          error: null,
        })
      );
    } catch (err) {
      return next(err);
    }
  });

  app.post("/activate/:token", async (req, res, next) => {
    try {
      const csrfToken = issuePageCsrf(res);
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(
          renderActivatePage({
            csrfToken,
            token: req.params.token,
            preview: null,
            error: "Your session expired. Please try again.",
          })
        );
      }
      const deployment = getPlatformDeploymentCode(env);
      if (!deployment.ok) {
        return res.status(503).type("html").send("Deployment unavailable");
      }
      const result = await activateActiveClinicStaff(getPool(), {
        rawToken: req.params.token,
        password: req.body && req.body.password,
        passwordConfirm: req.body && req.body.password_confirm,
        deploymentCode: deployment.code,
      });
      if (!result.ok) {
        const preview = await previewActivationToken(getPool(), {
          rawToken: req.params.token,
          deploymentCode: deployment.code,
        });
        const error =
          result.code === ACT_RESULT.WEAK_PASSWORD
            ? `Password must be at least ${PASSWORD_MIN} characters.`
            : result.code === ACT_RESULT.MISMATCH
              ? "Password and confirmation do not match."
              : tokenStateMessage(result.code);
        return res.status(400).type("html").send(
          renderActivatePage({
            csrfToken,
            token: req.params.token,
            preview: preview.ok ? preview.preview : null,
            error,
          })
        );
      }
      return res.redirect(303, result.redirectTo || "/login?activated=1");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/forgot-password", (req, res) => {
    const csrfToken = issuePageCsrf(res);
    return res.status(200).type("html").send(
      renderForgotPage({ csrfToken, message: null, error: null })
    );
  });

  app.post("/forgot-password", forgotLimiter, async (req, res, next) => {
    try {
      const csrfToken = issuePageCsrf(res);
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(
          renderForgotPage({
            csrfToken,
            message: null,
            error: "Your session expired. Please try again.",
          })
        );
      }
      const deployment = getPlatformDeploymentCode(env);
      await requestActiveClinicPasswordReset(getPool(), {
        identifier: req.body && req.body.identifier,
        deploymentCode: deployment.ok ? deployment.code : CODE_FALLBACK(),
        requestIp: clientIp(req),
        env,
      });
      return res.status(200).type("html").send(
        renderForgotPage({
          csrfToken,
          message: NEUTRAL_MESSAGE,
          error: null,
        })
      );
    } catch (err) {
      return next(err);
    }
  });

  function CODE_FALLBACK() {
    return "activeclinic-org-v6";
  }

  app.get("/reset-password/:token", async (req, res, next) => {
    try {
      const deployment = getPlatformDeploymentCode(env);
      const csrfToken = issuePageCsrf(res);
      const preview = await previewResetToken(getPool(), {
        rawToken: req.params.token,
        deploymentCode: deployment.ok ? deployment.code : null,
      });
      if (!preview.ok) {
        return res.status(400).type("html").send(
          renderResetPage({
            csrfToken,
            token: req.params.token,
            valid: false,
            stateCode: preview.code,
            error: tokenStateMessage(preview.code),
          })
        );
      }
      return res.status(200).type("html").send(
        renderResetPage({
          csrfToken,
          token: req.params.token,
          valid: true,
          error: null,
        })
      );
    } catch (err) {
      return next(err);
    }
  });

  app.post("/reset-password/:token", async (req, res, next) => {
    try {
      const csrfToken = issuePageCsrf(res);
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(
          renderResetPage({
            csrfToken,
            token: req.params.token,
            valid: false,
            error: "Your session expired. Please try again.",
          })
        );
      }
      const deployment = getPlatformDeploymentCode(env);
      if (!deployment.ok) {
        return res.status(503).type("html").send("Deployment unavailable");
      }
      const result = await completeActiveClinicPasswordReset(getPool(), {
        rawToken: req.params.token,
        password: req.body && req.body.password,
        passwordConfirm: req.body && req.body.password_confirm,
        deploymentCode: deployment.code,
      });
      if (!result.ok) {
        const preview = await previewResetToken(getPool(), {
          rawToken: req.params.token,
          deploymentCode: deployment.code,
        });
        const error =
          result.code === RESET_RESULT.WEAK_PASSWORD
            ? `Password must be at least ${PASSWORD_MIN} characters.`
            : result.code === RESET_RESULT.MISMATCH
              ? "Password and confirmation do not match."
              : tokenStateMessage(result.code);
        return res.status(400).type("html").send(
          renderResetPage({
            csrfToken,
            token: req.params.token,
            valid: preview.ok,
            error,
          })
        );
      }
      return res.redirect(303, result.redirectTo || "/login?reset=1");
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerActiveClinicLifecycleRoutes,
  renderActivatePage,
  renderForgotPage,
  renderResetPage,
};
