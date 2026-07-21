"use strict";

/**
 * Shared apex-host gate for BlessBoard V5 tenant shells.
 *
 * - hard: always reject apex (member / branch-admin — host cookie model).
 * - unlessTenant: allow apex when a resolved tenant context is present
 *   (session-scoped HQ on testing apex, or future host resolution).
 *   Unauthenticated requests pass through so login redirects still work.
 */

const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");

/**
 * @param {{
 *   isApexHost: (req: import('express').Request) => boolean,
 *   sendUnavailable?: (req: import('express').Request, res: import('express').Response) => unknown,
 *   mode?: 'hard' | 'unlessTenant',
 *   notFoundMessage?: string,
 * }} deps
 */
function createRejectApex(deps) {
  const isApexHost = deps.isApexHost;
  const sendUnavailable = deps.sendUnavailable;
  const mode = deps.mode === "unlessTenant" ? "unlessTenant" : "hard";
  const notFoundMessage =
    deps.notFoundMessage != null
      ? String(deps.notFoundMessage)
      : "Not found on this host.";

  return function rejectApex(req, res, next) {
    if (typeof isApexHost !== "function" || !isApexHost(req)) {
      return next();
    }

    if (mode === "unlessTenant") {
      if (!(req.v5Session && req.v5Session.authenticated)) {
        return next();
      }
      const tenant = resolveTenantForAuthorization(req);
      if (tenant && tenant.resolved === true) {
        return next();
      }
    }

    if (typeof sendUnavailable === "function") {
      return sendUnavailable(req, res);
    }

    const wantsHtml = String(req.get("accept") || "").includes("text/html");
    if (wantsHtml) {
      return res.status(404).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>Not found</title></head>
<body><h1>Not found</h1><p>${notFoundMessage}</p></body></html>`);
    }
    return res.status(404).type("text").send(notFoundMessage);
  };
}

module.exports = {
  createRejectApex,
};
