"use strict";

/**
 * Apex-only platform-admin shell (dashboard, account, logout + read-only org directory).
 * Requires active platform_admin role. No tenant-host access. No fabricated metrics.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const express = require("express");

const {
  listActiveAuthorizationRoles,
  findUserStatusById,
} = require("../../blessboard/repositories/blessBoardAuthorizationRepository");
const {
  listPlatformOrganizations,
  getPlatformAdminDashboardStats,
  STATUS: LIST_STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
} = require("../services/listPlatformOrganizations");
const {
  getPlatformOrganizationSummary,
  STATUS: DETAIL_STATUS,
} = require("../services/getPlatformOrganizationSummary");
const { formatRoleLabel } = require("../../blessboard/http/renderTenantLandingPage");
const { buildPlatformAdminShellLocals } = require("./platformAdminShellLocals");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("./v5Csrf");
const {
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../session/v5SessionCookie");
const { revokeV5Session } = require("../session/revokeV5Session");
const { getPlatformDeploymentCode } = require("../config/platformDeploymentCode");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderPlatformAdminView(relativePath, data) {
  const filename = path.join(VIEWS_ROOT, relativePath);
  const source = fs.readFileSync(filename, "utf8");
  return ejs.render(source, data, { filename });
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} message
 */
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
  <title>Platform admin · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/platform-admin.css" />
</head>
<body class="bb-pa-body">
  <main class="bb-pa-notice">
    <h1>${status === 401 ? "Sign in required" : status === 404 ? "Not found" : "Unavailable"}</h1>
    <p>${safe}</p>
    <p><a href="/">Home</a>${status === 401 ? ' · <a href="/login">Sign in</a>' : ""}</p>
  </main>
</body>
</html>`);
}

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   sendUnavailable?: Function,
 * }} deps
 */
function createPlatformAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";
  const router = express.Router();

  function requireApex(req, res, next) {
    if (!isApexHost(req)) {
      if (typeof sendUnavailable === "function") {
        return sendUnavailable(req, res);
      }
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  async function requirePlatformAdmin(req, res, next) {
    try {
      const session =
        req.v5Session && req.v5Session.authenticated && req.v5Session.session
          ? req.v5Session.session
          : null;
      if (!session) {
        const wantsHtml = String(req.get("accept") || "").includes("text/html");
        if (wantsHtml) {
          return res.redirect(
            303,
            `/login?next=${encodeURIComponent(req.originalUrl || "/admin")}`
          );
        }
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const pool = getPool();
      if (!pool || typeof pool.query !== "function") {
        return sendControlled(req, res, 503, "Platform admin is temporarily unavailable.");
      }

      const user = await findUserStatusById(pool, session.userId);
      if (!user || String(user.status) !== "active") {
        return sendControlled(req, res, 401, "Sign-in is required.");
      }

      const roles = await listActiveAuthorizationRoles(pool, session.userId);
      const isPlatformAdmin = roles.some((r) => r.roleKey === "platform_admin");
      if (!isPlatformAdmin) {
        return sendControlled(req, res, 403, "You do not have access to platform administration.");
      }

      req.platformAdminContext = {
        authenticated: true,
        authorized: true,
        userId: session.userId,
        displayName: session.user && session.user.displayName ? session.user.displayName : "",
        roleLabel: formatRoleLabel("platform_admin"),
      };
      return next();
    } catch {
      return sendControlled(req, res, 503, "Platform admin is temporarily unavailable.");
    }
  }

  function shellLocals(req, res, activeNav, extra) {
    return buildPlatformAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      pageTitle: extra && extra.pageTitle,
      extra,
    });
  }

  router.get("/admin", requireApex, requirePlatformAdmin, async (req, res) => {
    const [statsResult, list] = await Promise.all([
      getPlatformAdminDashboardStats(getPool()),
      listPlatformOrganizations(getPool(), { page: 1, limit: 5 }),
    ]);
    if (
      (!statsResult.ok && statsResult.status === LIST_STATUS.LOOKUP_ERROR) ||
      (!list.ok && list.status === LIST_STATUS.LOOKUP_ERROR)
    ) {
      return sendControlled(req, res, 503, "Organization directory is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/dashboard.ejs",
      shellLocals(req, res, "home", {
        pageTitle: "Platform admin",
        directorySample: list.organizations || [],
        totalOrganizations:
          (statsResult.stats && statsResult.stats.totalOrganizations) || list.total || 0,
        organizationsWithChurch:
          (statsResult.stats && statsResult.stats.organizationsWithChurch) || 0,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/account", requireApex, requirePlatformAdmin, (req, res) => {
    const deployment = getPlatformDeploymentCode(env);
    const html = renderPlatformAdminView(
      "platform-admin/account.ejs",
      shellLocals(req, res, "account", {
        pageTitle: "Account",
        deploymentCode: deployment && deployment.ok ? deployment.code : "",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/admin/logout", requireApex, async (req, res) => {
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const deployment = getPlatformDeploymentCode(env);
    const rawToken = readV5SessionCookie(req, env);
    try {
      if (deployment.ok && deployment.code && rawToken) {
        await revokeV5Session(getPool(), {
          rawToken,
          deploymentCode: deployment.code,
        });
      }
    } catch {
      /* fail-open clear cookie */
    }
    clearV5SessionCookie(res, { secure: isProduction, env });
    return res.redirect(303, "/login");
  });

  router.get("/admin/organizations", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformOrganizations(getPool(), {
      page: req.query.page,
      limit: req.query.limit,
      q: req.query.q,
    });
    if (!list.ok) {
      if (list.status === LIST_STATUS.INVALID_INPUT) {
        return sendControlled(req, res, 400, "Invalid list parameters.");
      }
      return sendControlled(req, res, 503, "Organization directory is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/organizations.ejs",
      shellLocals(req, res, "organizations", {
        pageTitle: "Organizations",
        organizations: list.organizations,
        page: list.page,
        limit: list.limit,
        total: list.total,
        totalPages: list.totalPages,
        keyPrefix: list.keyPrefix || "",
        defaultLimit: DEFAULT_LIMIT,
        maxLimit: MAX_LIMIT,
        allowedLimits: ALLOWED_LIMITS,
        rangeFrom: list.total === 0 ? 0 : (list.page - 1) * list.limit + 1,
        rangeTo: Math.min(list.page * list.limit, list.total),
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get(
    "/admin/organizations/:organizationKey",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const detail = await getPlatformOrganizationSummary(getPool(), req.params.organizationKey);
      if (!detail.ok) {
        if (detail.status === DETAIL_STATUS.LOOKUP_ERROR) {
          return sendControlled(req, res, 503, "Organization lookup is temporarily unavailable.");
        }
        if (detail.status === DETAIL_STATUS.INVALID_INPUT) {
          return sendControlled(req, res, 404, "This organization could not be found.");
        }
        return sendControlled(req, res, 404, "This organization could not be found.");
      }
      const html = renderPlatformAdminView(
        "platform-admin/organization-detail.ejs",
        shellLocals(req, res, "organizations", {
          pageTitle: detail.organization.displayName || "Organization",
          organization: detail.organization,
          branches: detail.branches || [],
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  return router;
}

module.exports = {
  createPlatformAdminRouter,
  renderPlatformAdminView,
};
