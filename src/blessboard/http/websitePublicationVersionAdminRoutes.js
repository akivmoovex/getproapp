"use strict";

/**
 * Phase3 HQ Website Version History routes.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const { publicChurchHomePath } = require("../urls/churchUrlHelper");
const versionSvc = require("../services/websitePublicationVersionService");

function renderHqView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sendControlled(req, res, status, message) {
  const safe = escapeHtml(message);
  const wantsHtml = String(req.get("accept") || "").includes("text/html");
  if (!wantsHtml) {
    return res.status(status).type("text").send(String(message == null ? "" : message));
  }
  return res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Website version history · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=58" />
</head>
<body class="bb-hq-body">
  <main class="bb-hq-login-unavailable">
    <h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/hq">HQ home</a></p>
  </main>
</body>
</html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createWebsitePublicationVersionAdminRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const requireHq = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });

  const rejectApex = createRejectApex({
    isApexHost,
    mode: "unlessTenant",
    sendUnavailable: (req, res) => sendControlled(req, res, 404, "Not found on this host."),
  });

  function gateHq(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, "/login?next=/hq/website/version-history");
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    return requireHq(req, res, next);
  }

  async function shellLocals(req, res, extras) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav: "content",
      pageTitle: extras && extras.pageTitle ? extras.pageTitle : "Website Version History",
      getPool,
      extra: extras,
    });
  }

  router.get("/hq/website/version-history", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }

    const result = await versionSvc.loadVersionHistory(getPool(), {
      organizationId: tenant.organization.id,
      status: req.query && req.query.status,
      publishedBy: req.query && req.query.publisher,
      themeKey: req.query && req.query.theme,
      from: req.query && req.query.from,
      to: req.query && req.query.to,
    });

    if (!result.ok) {
      return sendControlled(req, res, 503, "Version history is temporarily unavailable.");
    }

    const orgKey =
      (tenant.organization && (tenant.organization.key || tenant.organization.organizationKey)) ||
      null;
    const html = await renderHqView(
      "hq/phase3-website-version-history.ejs",
      await shellLocals(req, res, {
        pageTitle: "Website Version History",
        items: result.items,
        total: result.total,
        current: result.current,
        publishers: result.publishers,
        themeKeys: result.themeKeys,
        filters: result.filters,
        statusLabels: result.statusLabels,
        sourceLabels: result.sourceLabels,
        livePreviewPath: publicChurchHomePath(orgKey),
        detailId: String((req.query && req.query.detail) || "") || null,
      })
    );
    return res.type("html").send(html);
  });

  return router;
}

module.exports = {
  createWebsitePublicationVersionAdminRouter,
};
