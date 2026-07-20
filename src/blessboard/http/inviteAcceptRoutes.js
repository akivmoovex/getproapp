"use strict";

/**
 * Public invitation acceptance (set password / confirm) — tenant hosts.
 * No user enumeration: invalid tokens get a generic failure.
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
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const router = express.Router();

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    return next();
  }

  function ensureCsrf(res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env });
    return token;
  }

  router.get("/invite/accept", rejectApex, async (req, res) => {
    const token = String((req.query && req.query.token) || "");
    const csrfToken = ensureCsrf(res);
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

  router.post("/invite/accept", rejectApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const token = String((req.body && req.body.token) || "");
    const password = req.body && req.body.password;
    const csrfToken = ensureCsrf(res);

    const result = await acceptInvitation(getPool(), { token, password });
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

  return router;
}

module.exports = {
  createInviteAcceptRouter,
};
