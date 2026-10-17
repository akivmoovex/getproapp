"use strict";

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const { acceptMemberPortalInvitation } = require("../services/memberPortalInvitationAcceptanceService");

function createMemberPortalInvitationAcceptRouter(deps) {
  const router = express.Router();
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  function sessionUser(req) {
    return req.v5Session && req.v5Session.authenticated &&
      req.v5Session.session && req.v5Session.session.userId;
  }

  function render(res, data, status) {
    return res.set("Cache-Control", "no-store")
      .set("Referrer-Policy", "no-referrer")
      .status(status || 200).type("html").send(renderV5Ejs(
      "member-invite/accept.ejs", data
    ));
  }

  router.get("/member-invite/accept", async (req, res) => {
    const userId = sessionUser(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
    if (!userId) {
      return render(res, {
        csrfToken, csrfField: CSRF_FIELD, token: "", state: "authentication_required",
      }, 401);
    }
    return render(res, {
      csrfToken, csrfField: CSRF_FIELD,
      token: String((req.query && req.query.token) || ""),
      state: "ready",
    });
  });

  router.post("/member-invite/accept", async (req, res) => {
    const userId = sessionUser(req);
    if (!userId) return res.status(401).type("text").send("Authentication is required.");
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const result = await acceptMemberPortalInvitation(deps.getPool(), {
      token: req.body && req.body.token,
      authenticatedUserId: userId,
      organizationId: req.v5Session.session.organizationId,
      churchId: req.v5Session.session.churchId,
    });
    if (!result.ok) {
      const csrfToken = issueCsrfToken(env);
      setCsrfCookie(res, csrfToken, { secure: isProduction, env, req });
      return render(res, {
        csrfToken, csrfField: CSRF_FIELD, token: "", state: "error",
        error: result.code === "OWNERSHIP_PROOF_REQUIRED"
          ? "Additional ownership verification is required."
          : "This member invitation is not available.",
      }, 400);
    }
    return render(res, { csrfField: CSRF_FIELD, csrfToken: "", state: "accepted" });
  });

  return router;
}

module.exports = { createMemberPortalInvitationAcceptRouter };
