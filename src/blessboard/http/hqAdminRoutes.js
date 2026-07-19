"use strict";

/**
 * BlessBoard V5 church HQ shell + read-only branch selector.
 * Branch keys in URLs; church/branch identity from hostname UUID context + DB lookup.
 * No fabricated summary metrics. Active branches only.
 */

const express = require("express");
const { renderV5Ejs } = require("./v5EjsTemplateCache");

const {
  createRequireBlessBoardTenantRole,
} = require("./requireBlessBoardTenantRole");
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { buildHqAdminShellLocals } = require("./hqAdminShellLocals");
const {
  listBlessBoardBranches,
  resolveBlessBoardBranchForChurch,
  STATUS: BRANCH_STATUS,
} = require("../services/listBlessBoardBranches");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("../services/authorizeBlessBoardTenantAccess");
const {
  getChurchSettings,
  updateChurchSettings,
  STATUS: SETTINGS_STATUS,
} = require("../services/blessBoardSettingsService");
const {
  CSRF_FIELD,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  clearV5SessionCookie,
  readV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { revokeV5Session } = require("../../platform/session/revokeV5Session");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

/**
 * @param {string} relativePath
 * @param {object} data
 */
function renderHqView(relativePath, data) {
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
  <title>HQ · BlessBoard</title>
  <link rel="stylesheet" href="/blessboard/v5/hq-admin.css?v=50" />
</head>
<body class="bb-hq-body">
  <main class="bb-hq-login-unavailable">
    <h1>${status === 401 ? "Sign-in unavailable" : status === 404 ? "Not found" : "Unavailable"}</h1>
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
function createHqAdminRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const sendUnavailable = deps.sendUnavailable;
  const isProduction = String(env.NODE_ENV || "") === "production";

  const router = express.Router();
  const requireHqAccess = createRequireBlessBoardTenantRole({
    getPool,
    allowedRoles: ["church_hq_admin", "platform_admin"],
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

  function gateHq(req, res, next) {
    const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated);
    if (!sessionOk) {
      const wantsHtml = String(req.get("accept") || "").includes("text/html");
      if (wantsHtml) {
        return res.redirect(303, "/login?next=/hq");
      }
      return sendControlled(req, res, 401, "Sign-in is required.");
    }
    return requireHqAccess(req, res, next);
  }

  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {string} activeNav
   * @param {object} [extra]
   */
  async function shellLocals(req, res, activeNav, extra) {
    return buildHqAdminShellLocals(req, res, {
      env,
      isProduction,
      activeNav,
      getPool,
      extra,
    });
  }

  async function loadBranchList(req, res) {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      sendControlled(req, res, 403, "You do not have access to this site.");
      return null;
    }
    const listResult = await listBlessBoardBranches(getPool(), tenant.church.id);
    if (!listResult.ok && listResult.status === BRANCH_STATUS.LOOKUP_ERROR) {
      sendControlled(req, res, 503, "Branch list is temporarily unavailable.");
      return null;
    }
    return listResult;
  }

  router.get("/hq", rejectApex, gateHq, async (req, res) => {
    const listResult = await loadBranchList(req, res);
    if (!listResult) return;
    const html = renderHqView(
      "hq/dashboard.ejs",
      await shellLocals(req, res, "home", {
        branches: listResult.branches,
        activeBranchCount: listResult.activeCount || 0,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/branches", rejectApex, gateHq, async (req, res) => {
    const listResult = await loadBranchList(req, res);
    if (!listResult) return;
    const q = String((req.query && req.query.q) || "").trim().slice(0, 100);
    const typeRaw = String((req.query && req.query.type) || "")
      .trim()
      .toLowerCase();
    const typeFilter = typeRaw === "hq" || typeRaw === "branch" ? typeRaw : "";
    const html = renderHqView(
      "hq/branches.ejs",
      await shellLocals(req, res, "branches", {
        branches: listResult.branches,
        activeBranchCount: listResult.activeCount || 0,
        q,
        typeFilter,
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/hq/account", rejectApex, gateHq, async (req, res) => {
    const html = renderHqView("hq/account.ejs", await shellLocals(req, res, "account"));
    return res.status(200).type("html").send(html);
  });

  router.post("/hq/logout", rejectApex, async (req, res) => {
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
    return res.redirect(303, "/");
  });

  router.get("/hq/settings", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const loaded = await getChurchSettings(getPool(), tenant.church.id);
    if (!loaded.ok) {
      const status = loaded.status === SETTINGS_STATUS.LOOKUP_ERROR ? 503 : 403;
      return sendControlled(
        req,
        res,
        status,
        status === 503 ? "Settings are temporarily unavailable." : "You do not have access to this site."
      );
    }
    const html = renderHqView(
      "hq/settings.ejs",
      await shellLocals(req, res, "settings", {
        settings: loaded.settings,
        error: null,
        saved: String((req.query && req.query.saved) || "") === "1",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.post("/hq/settings", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }
    const submitted = req.body && req.body[CSRF_FIELD];
    if (!validateCsrf(req, submitted, env)) {
      return sendControlled(req, res, 403, "Invalid or missing CSRF token.");
    }
    const body = req.body || {};
    const updated = await updateChurchSettings(getPool(), tenant.church.id, {
      publicName: body.publicName,
      denomination: body.denomination,
      primaryEmail: body.primaryEmail,
      primaryPhone: body.primaryPhone,
      defaultTimezone: body.defaultTimezone,
      defaultCountryCode: body.defaultCountryCode,
      websiteStatus: body.websiteStatus,
    });
    if (!updated.ok) {
      if (updated.status === SETTINGS_STATUS.INVALID_INPUT) {
        const loaded = await getChurchSettings(getPool(), tenant.church.id);
        const html = renderHqView(
          "hq/settings.ejs",
          await shellLocals(req, res, "settings", {
            settings: loaded.settings || {
              publicName: String(body.publicName || ""),
              denomination: body.denomination || null,
              primaryEmail: body.primaryEmail || null,
              primaryPhone: body.primaryPhone || null,
              defaultTimezone: body.defaultTimezone || null,
              defaultCountryCode: body.defaultCountryCode || null,
              websiteStatus: body.websiteStatus || "draft",
            },
            error: "Please check the settings and try again.",
            saved: false,
          })
        );
        return res.status(400).type("html").send(html);
      }
      return sendControlled(
        req,
        res,
        updated.status === SETTINGS_STATUS.LOOKUP_ERROR ? 503 : 403,
        "Settings could not be saved."
      );
    }
    return res.redirect(303, "/hq/settings?saved=1");
  });

  /**
   * Resolve branch key under current church, authorize for that branch UUID,
   * then open the existing branch-admin shell (no UUID in URL).
   */
  router.get("/hq/branches/:branchKey", rejectApex, gateHq, async (req, res) => {
    const tenant = resolveTenantForAuthorization(req);
    if (!tenant || !tenant.church || !tenant.church.id) {
      return sendControlled(req, res, 403, "You do not have access to this site.");
    }

    const resolved = await resolveBlessBoardBranchForChurch(
      getPool(),
      tenant.church.id,
      req.params.branchKey
    );

    if (!resolved.ok) {
      if (resolved.status === BRANCH_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Branch lookup is temporarily unavailable.");
      }
      if (resolved.status === BRANCH_STATUS.INACTIVE) {
        return sendControlled(req, res, 404, "This branch is not available.");
      }
      return sendControlled(req, res, 404, "This branch could not be found.");
    }

    const session = req.v5Session && req.v5Session.session;
    const authz = await authorizeBlessBoardTenantAccess(getPool(), {
      userId: session && session.userId,
      tenant,
      branchId: resolved.branch.id,
    });

    if (authz.status === AUTHZ_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Access check is temporarily unavailable.");
    }
    if (!authz.ok) {
      return sendControlled(req, res, 403, "You do not have access to this branch.");
    }

    // Preserve authorization; open existing branch-admin shell (hostname primary context).
    return res.redirect(303, "/branch-admin");
  });

  return router;
}

module.exports = {
  createHqAdminRouter,
  renderHqView,
};
