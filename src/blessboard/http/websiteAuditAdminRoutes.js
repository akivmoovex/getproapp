"use strict";

/**
 * Phase3 HQ Website Audit Log routes.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");
const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { createRejectApex } = require("./rejectApex");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const auditSvc = require("../services/websiteAuditService");
const submissionRepo = require("../repositories/websiteChangeSubmissionRepository");

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
<html lang="en"><head><meta charset="utf-8"/><title>Audit log</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=61"/></head>
<body class="bb-hq-body"><main class="bb-hq-login-unavailable">
<h1>${status === 401 ? "Sign-in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
<p>${safe}</p><p><a href="/hq">HQ home</a></p></main></body></html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} deps
 */
function createWebsiteAuditAdminRouter(deps) {
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
    if (!(req.v5Session && req.v5Session.authenticated)) {
      if (String(req.get("accept") || "").includes("text/html")) {
        return res.redirect(303, "/login?next=/hq/website/audit-log");
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
      pageTitle: extras.pageTitle || "Website Audit Log",
      getPool,
      extra: extras,
    });
  }

  router.get("/hq/website/audit-log", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const q = req.query || {};
    const result = await auditSvc.listWebsiteAuditEvents(getPool(), {
      organizationId: tenant.organization.id,
      actionType: q.action || null,
      actorUserId: q.user || null,
      actorRole: q.role || null,
      branchId: q.branch || null,
      pageKey: q.page || null,
      result: q.result || null,
      from: q.from || null,
      to: q.to || null,
    });
    if (!result.ok) {
      return sendControlled(req, res, 503, "Audit log is temporarily unavailable.");
    }
    const branches = await submissionRepo.listBranchesForOrganization(
      getPool(),
      tenant.organization.id
    );
    const html = await renderV5Ejs(
      "hq/phase3-website-audit-log.ejs",
      await shellLocals(req, res, {
        pageTitle: "Website Audit Log",
        items: result.items,
        total: result.total,
        actors: result.actors,
        actionTypes: result.actionTypes,
        actionLabels: result.actionLabels,
        filters: result.filters,
        branches,
        exportAvailable: false,
      })
    );
    return res.type("html").send(html);
  });

  router.get("/hq/website/audit-log/:eventId", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.organization || !tenant.organization.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const result = await auditSvc.loadWebsiteAuditEvent(getPool(), {
      organizationId: tenant.organization.id,
      eventId: req.params.eventId,
    });
    if (!result.ok) {
      if (result.status === auditSvc.STATUS.NOT_FOUND) {
        return sendControlled(req, res, 404, "Audit event not found.");
      }
      return sendControlled(req, res, 400, "Unable to load audit event.");
    }
    const html = await renderV5Ejs(
      "hq/phase3-website-audit-detail.ejs",
      await shellLocals(req, res, {
        pageTitle: "Audit event detail",
        event: result.event,
        actionLabels: result.actionLabels,
      })
    );
    return res.type("html").send(html);
  });

  return router;
}

module.exports = {
  createWebsiteAuditAdminRouter,
};
