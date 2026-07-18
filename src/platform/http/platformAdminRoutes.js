"use strict";

/**
 * Apex-only platform-admin shell.
 * Dashboard, org directory, plans/entitlements, deployments, settings.
 * Writes limited to plan assign + entitlement override (CSRF + confirmation).
 * No billing, payments, DNS automation, or destructive controls.
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
const {
  listPlatformPlansCatalogue,
  STATUS: PLANS_STATUS,
} = require("../services/listPlatformPlansCatalogue");
const {
  getPlatformOrganizationEntitlementsView,
  assignOrganizationPlanByKey,
  setOrganizationEntitlementOverrideByKey,
  STATUS: ENTITLEMENTS_ADMIN_STATUS,
} = require("../services/platformAdminEntitlements");
const {
  listPlatformDeployments,
  STATUS: DEPLOY_STATUS,
} = require("../services/listPlatformDeployments");
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
const {
  ORGANIZATION_RESERVED_SLUGS,
  BRANCH_HOST_RESERVED_SLUGS,
} = require("../../church/platformProvisioningValidation");

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
 * @param {import('express').Request} req
 * @returns {{ notice: string | null, error: string | null }}
 */
function readFlash(req) {
  const notice = String((req.query && req.query.notice) || "").trim() || null;
  const error = String((req.query && req.query.error) || "").trim() || null;
  return { notice, error };
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

  router.get("/admin/plans", requireApex, requirePlatformAdmin, async (req, res) => {
    const catalogue = await listPlatformPlansCatalogue(getPool());
    if (!catalogue.ok || catalogue.status === PLANS_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Plan catalogue is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/plans.ejs",
      shellLocals(req, res, "plans", {
        pageTitle: "Plans",
        plans: catalogue.plans || [],
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/deployments", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformDeployments(getPool(), env);
    if (!list.ok || list.status === DEPLOY_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Deployment registry is temporarily unavailable.");
    }
    const html = renderPlatformAdminView(
      "platform-admin/deployments.ejs",
      shellLocals(req, res, "deployments", {
        pageTitle: "Deployments",
        deployments: list.deployments || [],
        currentDeploymentCode: list.currentDeploymentCode || "",
      })
    );
    return res.status(200).type("html").send(html);
  });

  router.get("/admin/settings", requireApex, requirePlatformAdmin, async (req, res) => {
    const list = await listPlatformDeployments(getPool(), env);
    if (!list.ok || list.status === DEPLOY_STATUS.LOOKUP_ERROR) {
      return sendControlled(req, res, 503, "Platform settings are temporarily unavailable.");
    }
    const current =
      (list.deployments || []).find((d) => d.deploymentCode === list.currentDeploymentCode) ||
      null;
    const orgReserved = Array.from(ORGANIZATION_RESERVED_SLUGS).sort();
    const hostReserved = Array.from(BRANCH_HOST_RESERVED_SLUGS).sort();
    const html = renderPlatformAdminView(
      "platform-admin/settings.ejs",
      shellLocals(req, res, "settings", {
        pageTitle: "Settings",
        currentDeployment: current,
        currentDeploymentCode: list.currentDeploymentCode || "",
        hostnamePattern: current && current.canonicalDomain
          ? `{organization}.${current.canonicalDomain}`
          : "{organization}.blessboard.org",
        organizationReserved: orgReserved,
        hostReserved,
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
      const entitlementsView = await getPlatformOrganizationEntitlementsView(
        getPool(),
        req.params.organizationKey
      );
      if (!entitlementsView.ok && entitlementsView.status === ENTITLEMENTS_ADMIN_STATUS.LOOKUP_ERROR) {
        return sendControlled(req, res, 503, "Entitlements lookup is temporarily unavailable.");
      }
      const flash = readFlash(req);
      const html = renderPlatformAdminView(
        "platform-admin/organization-detail.ejs",
        shellLocals(req, res, "organizations", {
          pageTitle: detail.organization.displayName || "Organization",
          organization: detail.organization,
          branches: detail.branches || [],
          entitlements: entitlementsView.entitlements || null,
          usage: entitlementsView.usage || null,
          domains: entitlementsView.domains || [],
          plans: entitlementsView.plans || [],
          featureKeys: entitlementsView.featureKeys || [],
          notice: flash.notice,
          error: flash.error,
        })
      );
      return res.status(200).type("html").send(html);
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/plan",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      const confirmed = String((req.body && req.body.confirm_plan_change) || "") === "1";
      const result = await assignOrganizationPlanByKey(getPool(), {
        organizationKey,
        planKey: req.body && req.body.plan_key,
        notes: req.body && req.body.notes,
        confirmed,
      });
      if (!result.ok) {
        let error = "plan_failed";
        if (result.status === ENTITLEMENTS_ADMIN_STATUS.CONFIRMATION_REQUIRED) {
          error = "confirm_required";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.NOT_FOUND) {
          error = "not_found";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.INVALID_INPUT) {
          error = "invalid";
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(organizationKey)}?error=${error}#pa-org-entitlements`
        );
      }
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(organizationKey)}?notice=plan_saved#pa-org-entitlements`
      );
    }
  );

  router.post(
    "/admin/organizations/:organizationKey/entitlement-override",
    requireApex,
    requirePlatformAdmin,
    async (req, res) => {
      const organizationKey = String(req.params.organizationKey || "")
        .trim()
        .toLowerCase();
      const submitted = req.body && req.body[CSRF_FIELD];
      if (!validateCsrf(req, submitted, env)) {
        return res.status(403).type("text").send("Invalid or missing CSRF token.");
      }
      const confirmed = String((req.body && req.body.confirm_override) || "") === "1";
      const booleanRaw = String((req.body && req.body.boolean_value) || "").toLowerCase();
      const result = await setOrganizationEntitlementOverrideByKey(getPool(), {
        organizationKey,
        featureKey: req.body && req.body.feature_key,
        featureKind: req.body && req.body.feature_kind,
        booleanValue: booleanRaw === "1" || booleanRaw === "true" || booleanRaw === "on",
        limitValue: req.body && req.body.limit_value,
        reason: req.body && req.body.reason,
        confirmed,
        createdByUserId: req.platformAdminContext && req.platformAdminContext.userId,
      });
      if (!result.ok) {
        let error = "override_failed";
        if (result.status === ENTITLEMENTS_ADMIN_STATUS.CONFIRMATION_REQUIRED) {
          error = "confirm_required";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.NOT_FOUND) {
          error = "not_found";
        } else if (result.status === ENTITLEMENTS_ADMIN_STATUS.INVALID_INPUT) {
          error = "invalid";
        }
        return res.redirect(
          303,
          `/admin/organizations/${encodeURIComponent(organizationKey)}?error=${error}#pa-org-overrides`
        );
      }
      return res.redirect(
        303,
        `/admin/organizations/${encodeURIComponent(organizationKey)}?notice=override_saved#pa-org-overrides`
      );
    }
  );

  return router;
}

module.exports = {
  createPlatformAdminRouter,
  renderPlatformAdminView,
};
