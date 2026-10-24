"use strict";

/**
 * Public invitation acceptance (set password / confirm).
 * Available on apex and tenant hosts so platform-admin invitation links work
 * before a custom organization domain exists.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  getInvitationForAccept,
  acceptInvitation,
  STATUS,
  GENERIC_ACCEPT_FAILURE,
} = require("../services/inviteBlessBoardStaff");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const { acceptMemberPortalInvitation } = require("../services/memberPortalInvitationService");
const rateLimit = require("express-rate-limit");

function renderView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createInviteAcceptRouter(deps) {
  const getPool = deps.getPool;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const router = express.Router();
  const memberInvitationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  function ensureCsrf(req, res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env, req });
    return token;
  }

  // Accept on apex and tenant hosts so platform-admin invitation links work
  // when the organization has no custom domain yet.
  router.get("/invite/accept", async (req, res) => {
    const token = String((req.query && req.query.token) || "");
    const csrfToken = ensureCsrf(req, res);
    const peeked = await getInvitationForAccept(getPool(), token);
    const html = renderView("invite/accept.ejs", {
      csrfToken,
      csrfField: CSRF_FIELD,
      token: peeked.ok ? token : "",
      invitation: peeked.ok ? peeked.invitation : null,
      error: peeked.ok ? null : peeked.message || GENERIC_ACCEPT_FAILURE,
      saved: false,
    });
    return res.status(peeked.ok ? 200 : 400).type("html").send(html);
  });

  router.post("/invite/accept", async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const token = String((req.body && req.body.token) || "");
    const password = req.body && req.body.password;
    const passwordConfirm =
      req.body && (req.body.password_confirm || req.body.passwordConfirm);
    const csrfToken = ensureCsrf(req, res);

    const result = await acceptInvitation(getPool(), {
      token,
      password,
      passwordConfirm,
    });
    if (!result.ok) {
      const peeked = await getInvitationForAccept(getPool(), token);
      const html = renderView("invite/accept.ejs", {
        csrfToken,
        csrfField: CSRF_FIELD,
        token: peeked.ok ? token : "",
        invitation: peeked.ok ? peeked.invitation : null,
        error: result.message || GENERIC_ACCEPT_FAILURE,
        saved: false,
      });
      const status =
        result.status === STATUS.INVALID_INPUT
          ? 400
          : result.status === STATUS.ORG_INACTIVE
            ? 403
            : 400;
      return res.status(status).type("html").send(html);
    }

    const html = renderView("invite/accept.ejs", {
      csrfToken,
      csrfField: CSRF_FIELD,
      token: "",
      invitation: null,
      error: null,
      saved: true,
      displayName: result.user && result.user.displayName,
    });
    return res.status(200).type("html").send(html);
  });

  router.get("/member/invite/accept", async (req, res) => {
    const token = String((req.query && req.query.token) || "");
    const csrfToken = ensureCsrf(req, res);
    return res.status(200).type("html").send(`<!doctype html><html><body>
      <h1>Activate member portal</h1>
      <form method="post" action="/member/invite/accept">
      <input type="hidden" name="${CSRF_FIELD}" value="${csrfToken}">
      <input type="hidden" name="token" value="${token.replace(/"/g, "&quot;")}">
      <label>Password <input type="password" name="password" minlength="10" required></label>
      <button type="submit">Activate</button></form></body></html>`);
  });

  router.post("/member/invite/accept", memberInvitationLimiter, async (req, res) => {
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const result = await acceptMemberPortalInvitation(getPool(), {
      token: req.body && req.body.token,
      password: req.body && req.body.password,
      authenticatedUserId:
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session.userId
          : null,
    });
    if (!result.ok) return res.status(400).type("text").send("This member invitation is not valid.");
    return res.redirect(303, "/login?next=%2Fmember%2Fdashboard");
  });

  return router;
}

module.exports = {
  createInviteAcceptRouter,
};
