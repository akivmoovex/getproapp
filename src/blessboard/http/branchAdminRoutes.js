"use strict";

/**
 * Minimal BlessBoard V5 branch-admin portal shell (tenant hosts only).
 * Branch identity comes from authoritative hostname tenant context — never query strings.
 */

const express = require("express");
const { renderV5Ejs, VIEWS_ROOT } = require("./v5EjsTemplateCache");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const {
  CSRF_FIELD,
  issueCsrfToken,
  validateCsrf,
  setCsrfCookie,
} = require("../../platform/http/v5Csrf");
const {
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { revokeV5Session } = require("../../platform/session/revokeV5Session");
const {
  getBranchSettings,
  updateBranchSettings,
  STATUS: SETTINGS_STATUS,
} = require("../services/blessBoardSettingsService");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const { buildBranchAdminShellLocals } = require("./branchAdminShellLocals");

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderBranchAdminView(relativePath, data) {
  return renderV5Ejs(relativePath, data);
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
function sendLoginUnavailable(req, res, status, message) {
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
  <title>Sign-in unavailable · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/branch-admin.css?v=36" />
</head>
<body class="bb-ba-body">
  <main class="bb-ba-login-unavailable">
    <h1>Sign-in unavailable</h1>
    <p>${safe}</p>
    <p><a href="/">Church homepage</a></p>
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
function createBranchAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["platform_admin", "church_hq_admin", "branch_admin"],
  });

  function rejectApex(req, res, next) {
    if (isApexHost(req)) {
      if (typeof sendUnavailable === "function") {
        return sendUnavailable(req, res);
      }
      return res.status(503).type("text").send("Unavailable");
    }
    return next();
  }

  function gateAccess(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, "/login?next=/branch-admin");
      }
      return sendLoginUnavailable(req, res, 401, "Sign-in is required.");
    }
    return requireAccess(req, res, next);
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {string} activeNav
   * @param {object} [extra]
   */
  function shellLocals(req, res, activeNav, extra) {
    return buildBranchAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      extra,
    });
  }

  router.get("/branch-admin", rejectApex, gateAccess, (req, res) => {
    const locals = shellLocals(req, res, "home");
    const html = renderBranchAdminView("branch-admin/dashboard.ejs", locals);
    return res.status(200).type("html").send(html);
  });

  router.get("/branch-admin/account", rejectApex, gateAccess, (req, res) => {
    const locals = shellLocals(req, res, "account");
    const html = renderBranchAdminView("branch-admin/account.ejs", locals);
    return res.status(200).type("html").send(html);
  });

  router.get("/branch-admin/settings", rejectApex, gateAccess, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const branchId = tenant && tenant.primaryBranch ? tenant.primaryBranch.id : null;
    if (!branchId) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this site.");
    }
    const loaded = await getBranchSettings(getPool(), branchId);
    if (!loaded.ok) {
      return sendLoginUnavailable(
        req,
        res,
        loaded.status === SETTINGS_STATUS.LOOKUP_ERROR ? 503 : 403,
        "Settings are temporarily unavailable."
      );
    }
    const html = renderBranchAdminView(
      "branch-admin/settings.ejs",
      shellLocals(req, res, "settings", {
        settings: loaded.settings,
        error: null,
        saved: String((req.query && req.query.saved) || "") === "1",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/branch-admin/settings", rejectApex, gateAccess, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    const branchId = tenant && tenant.primaryBranch ? tenant.primaryBranch.id : null;
    if (!branchId) {
      return sendLoginUnavailable(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return res.status(403).type("text").send("Invalid or missing CSRF token.");
    }
    const body = req.body || {};
    const updated = await updateBranchSettings(getPool(), branchId, {
      publicName: body.publicName,
      email: body.email,
      phone: body.phone,
      timezone: body.timezone,
      countryCode: body.countryCode,
      addressLine1: body.addressLine1,
      addressLine2: body.addressLine2,
      city: body.city,
      provinceState: body.provinceState,
      postalCode: body.postalCode,
      latitude: body.latitude,
      longitude: body.longitude,
    });
    if (!updated.ok) {
      if (updated.status === SETTINGS_STATUS.INVALID_INPUT) {
        const loaded = await getBranchSettings(getPool(), branchId);
        const html = renderBranchAdminView(
          "branch-admin/settings.ejs",
          shellLocals(req, res, "settings", {
            settings: loaded.settings || {
              publicName: String(body.publicName || ""),
              email: body.email || null,
              phone: body.phone || null,
              timezone: body.timezone || null,
              countryCode: body.countryCode || null,
              addressLine1: body.addressLine1 || null,
              addressLine2: body.addressLine2 || null,
              city: body.city || null,
              provinceState: body.provinceState || null,
              postalCode: body.postalCode || null,
              latitude: body.latitude || null,
              longitude: body.longitude || null,
            },
            error: "Please check the settings and try again.",
            saved: false,
          })
        );
        return res.status(400).type("html").send(html);
      }
      return sendLoginUnavailable(req, res, 503, "Settings could not be saved.");
    }
    return res.redirect(303, "/branch-admin/settings?saved=1");
  });

  router.post("/branch-admin/logout", rejectApex, async (req, res) => {
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
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return res.redirect(303, "/login");
  });

  return router;
}

module.exports = {
  createBranchAdminRouter,
  renderBranchAdminView,
  sendLoginUnavailable,
};
