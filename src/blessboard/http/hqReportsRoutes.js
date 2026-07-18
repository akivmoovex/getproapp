"use strict";

/**
 * BlessBoard V5 HQ read-only reports + audit log viewer.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { formatRoleLabel } = require("./renderTenantLandingPage");
const {
  issueCsrfToken,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  STATUS,
  getHqOperationalReport,
} = require("../services/hqReportsService");
const {
  listOrganizationAuditEvents,
  STATUS: AUDIT_STATUS,
} = require("../../platform/services/auditEventService");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

function renderView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
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
<html lang="en"><head><meta charset="utf-8"/><title>Reports</title>
<link rel="stylesheet" href="/blessboard/v5/hq-admin.css"/></head>
<body class="bb-hq-body"><main><h1>Unavailable</h1><p>${safe}</p></main></body></html>`);
}

function currentYearMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createHqReportsRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
  });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") return sendUnavailable(req, res);
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gate(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, `/login?next=${encodeURIComponent(req.originalUrl || "/hq/reports")}`);
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    return requireAccess(req, res, next);
  }

  function shellLocals(req, res, activeNav, extra) {
    const tenant = resolveTenantForAuthorization(req);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    const roles =
      req.blessBoardAuthorizationContext && req.blessBoardAuthorizationContext.effectiveRoles
        ? req.blessBoardAuthorizationContext.effectiveRoles
        : [];
    const hit =
      roles.find((r) => r.roleKey === "church_hq_admin") ||
      roles.find((r) => r.roleKey === "platform_admin") ||
      roles[0];
    return {
      pageTitle: activeNav === "audit" ? "Audit" : "Reports",
      activeNav,
      shellKind: "hq",
      csrfToken,
      churchDisplayName: tenant && tenant.church ? tenant.church.displayName : "",
      hqBranchDisplayName: tenant && tenant.hqBranch ? tenant.hqBranch.displayName : "",
      roleLabel: hit ? formatRoleLabel(hit.roleKey) : "HQ admin",
      displayName:
        req.v5Session && req.v5Session.session && req.v5Session.session.user
          ? req.v5Session.session.user.displayName
          : "",
      ...(extra || {}),
    };
  }

  router.get("/hq/reports", rejectApex, gate, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !session || !session.userId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const yearMonth = String((req.query && req.query.month) || currentYearMonth());
    const result = await getHqOperationalReport(getPool(), {
      churchId: tenant.church.id,
      actorUserId: session.userId,
      tenant,
      yearMonth: /^\d{4}-\d{2}$/.test(yearMonth) ? yearMonth : currentYearMonth(),
    });
    if (!result.ok) {
      return sendControlled(
        req,
        res,
        result.status === STATUS.FORBIDDEN ? 403 : 503,
        "Reports are temporarily unavailable."
      );
    }
    const html = renderView(
      "hq/reports.ejs",
      shellLocals(req, res, "reports", {
        report: result.report,
        yearMonth: result.report.yearMonth,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/audit", rejectApex, gate, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const session = req.v5Session && req.v5Session.session;
    if (!tenant || !tenant.church || !tenant.organization || !session || !session.userId) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const before = req.query && req.query.before ? String(req.query.before) : null;
    const actionKey = req.query && req.query.action ? String(req.query.action) : null;
    const listed = await listOrganizationAuditEvents(getPool(), {
      organizationId: tenant.organization.id,
      churchId: tenant.church.id,
      before,
      actionKey: actionKey || null,
      limit: 50,
    });
    if (!listed.ok) {
      return sendControlled(
        req,
        res,
        listed.status === AUDIT_STATUS.FORBIDDEN ? 403 : 503,
        "Audit log is temporarily unavailable."
      );
    }
    const html = renderView(
      "hq/audit.ejs",
      shellLocals(req, res, "audit", {
        events: listed.events,
        hasMore: listed.hasMore,
        nextBefore: listed.nextBefore,
        actionFilter: actionKey || "",
        deploymentCode: (() => {
          const id = getPlatformDeploymentCode(env);
          return id && id.ok ? id.code : "";
        })(),
      })
    );
    return res.status(200).type("html").send(html);
  });

  return router;
}

module.exports = {
  createHqReportsRouter,
};
