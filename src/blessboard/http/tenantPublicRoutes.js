"use strict";

/**
 * Authoritative-mode tenant public website routes.
 * Renders published content for visitors; authorized admins get optional edit chrome.
 * Includes Stage 3 branch mini websites under /branches/:branchKey.
 */

const express = require("express");

const {
  MODE_AUTHORITATIVE,
  MODE_OFF,
  MODE_SHADOW,
} = require("../config/tenantRoutingMode");
const { OUTCOME } = require("./evaluateTenantRoute");
const {
  pageKeyFromPath,
  isTenantPublicPagePath,
  isTenantPublicBranchPagePath,
  parseTenantBranchPublicPath,
  PAGE_SUFFIXES,
} = require("./tenantPublicPaths");
const { loadTenantPublicPageModel, KIND } = require("./loadTenantPublicPageModel");
const { renderTenantPublicPage } = require("./renderTenantPublicPage");
const { renderControlledErrorPage, renderFoundationHome } = require("./renderTenantLandingPage");
const { resolveHostname } = require("../../platform/host");
const { attachWebsiteAdminChrome } = require("./attachWebsiteAdminChrome");
const {
  resolvePublicWebsiteBranch,
  STATUS: PUBLIC_BRANCH_STATUS,
} = require("../services/resolvePublicWebsiteBranch");
const { tenantBranchHomePath } = require("../urls/churchUrlHelper");

/**
 * @param {{
 *   getPool: () => { query: Function, connect?: Function },
 *   getEnv?: () => object,
 *   isApexHost: (req: import('express').Request) => boolean,
 *   getTenantRoutingMode: () => string,
 * }} deps
 */
function createTenantPublicRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const getTenantRoutingMode = deps.getTenantRoutingMode;

  function foundationOrNull(req, res, pathOnly) {
    if (isApexHost(req)) {
      return null; // let apex home / other handlers run
    }

    const mode = getTenantRoutingMode();
    const route = req.blessBoardTenantRoute || {};

    if (mode === MODE_OFF || mode === MODE_SHADOW) {
      return res.status(200).type("html").send(
        renderFoundationHome({
          authenticated: false,
          csrfToken: null,
        })
      );
    }

    if (mode !== MODE_AUTHORITATIVE) {
      return res.status(200).type("html").send(
        renderFoundationHome({
          authenticated: false,
          csrfToken: null,
        })
      );
    }

    // Allow-list deny / empty under authoritative: keep foundation (pilot-safe).
    if (
      route.outcome === OUTCOME.FOUNDATION ||
      route.reason === "authoritative_host_not_allowlisted" ||
      route.reason === "authoritative_allowlist_empty"
    ) {
      return res.status(200).type("html").send(
        renderFoundationHome({
          authenticated: false,
          csrfToken: null,
        })
      );
    }

    if (route.outcome === OUTCOME.NOT_FOUND || route.httpStatus === 404) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }

    if (
      route.outcome !== OUTCOME.RENDER_TENANT ||
      !req.blessBoardTenantContext ||
      !req.blessBoardTenantContext.resolved
    ) {
      return res
        .status(503)
        .type("html")
        .send(
          renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
        );
    }

    return "ready";
  }

  async function renderTenantModel(req, res, opts) {
    const { pageKey, pathPrefix, selectedBranch } = opts;
    const hostname = resolveHostname(req) || String(req.hostname || "");
    const tenant = req.blessBoardTenantContext;

    let model;
    try {
      model = await loadTenantPublicPageModel(getPool(), {
        tenant,
        pageKey,
        hostname,
        pathPrefix: pathPrefix || "",
        selectedBranch: selectedBranch || null,
        routingMode: "tenant",
      });
    } catch {
      return res
        .status(503)
        .type("html")
        .send(
          renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
        );
    }

    if (model.kind === KIND.UNAVAILABLE) {
      return res
        .status(503)
        .type("html")
        .send(
          renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
        );
    }

    if (model.kind === KIND.SETUP) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      const { renderWebsiteSetupPage } = require("./renderWebsiteSetupPage");
      return res.status(200).type("html").send(
        renderWebsiteSetupPage({
          publicName: model.publicName,
          message: "This website is being prepared and is not public yet.",
        })
      );
    }

    if (model.seo && model.seo.noindex) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }

    try {
      await attachWebsiteAdminChrome({
        req,
        res,
        db: getPool(),
        model,
        env: typeof deps.getEnv === "function" ? deps.getEnv() : process.env,
      });
    } catch {
      model.websiteAdmin = null;
    }

    try {
      const {
        resolveTenantPortalAccess,
        publicPortalHeaderFromAccess,
      } = require("../services/resolveTenantPortalAccess");
      const sessionOk = Boolean(req.v5Session && req.v5Session.authenticated && req.v5Session.session);
      if (sessionOk) {
        const access = await resolveTenantPortalAccess({
          db: getPool(),
          userId: req.v5Session.session.userId,
          organizationId: tenant.organization.id,
          churchId: tenant.church.id,
          branchId:
            (selectedBranch && selectedBranch.id) ||
            (tenant.primaryBranch && tenant.primaryBranch.id),
          organizationStatus: tenant.organization && tenant.organization.status,
          branchStatus: tenant.primaryBranch && tenant.primaryBranch.status,
        });
        const header = publicPortalHeaderFromAccess(access);
        model.portalHref = header.portalHref;
        model.portalLabel = header.portalLabel;
        model.loginHref = null;
      } else {
        model.portalHref = null;
        model.portalLabel = null;
        model.loginHref = "/login";
      }
    } catch {
      model.portalHref = null;
      model.portalLabel = null;
      if (!model.loginHref) model.loginHref = "/login";
    }

    const html = renderTenantPublicPage(model);
    return res.status(200).type("html").send(html);
  }

  async function handlePublicPage(req, res) {
    const pathOnly = String(req.path || "/").split("?")[0] || "/";
    if (!isTenantPublicPagePath(pathOnly)) {
      return null;
    }

    const gate = foundationOrNull(req, res, pathOnly);
    if (gate !== "ready") return gate;

    const pageKey = pageKeyFromPath(pathOnly);
    return renderTenantModel(req, res, {
      pageKey,
      pathPrefix: "",
      selectedBranch: null,
    });
  }

  async function handleBranchPublicPage(req, res) {
    if (isApexHost(req)) {
      return null;
    }

    const pathOnly = String(req.path || "/").split("?")[0] || "/";
    if (!isTenantPublicBranchPagePath(pathOnly)) {
      return null;
    }

    const gate = foundationOrNull(req, res, pathOnly);
    if (gate !== "ready") return gate;

    const parsed = parseTenantBranchPublicPath(pathOnly);
    if (!parsed) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }

    const tenant = req.blessBoardTenantContext;
    const branchResolved = await resolvePublicWebsiteBranch(getPool(), {
      churchId: tenant.church.id,
      branchKey: parsed.branchKey,
    });
    if (!branchResolved.ok || !branchResolved.branch) {
      if (branchResolved.status === PUBLIC_BRANCH_STATUS.LOOKUP_ERROR) {
        return res
          .status(503)
          .type("html")
          .send(
            renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
          );
      }
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }

    const pathPrefix = tenantBranchHomePath(branchResolved.branch.key);
    return renderTenantModel(req, res, {
      pageKey: parsed.pageKey,
      pathPrefix,
      selectedBranch: branchResolved.branch,
    });
  }

  // Branch mini websites (more specific).
  for (const suffix of PAGE_SUFFIXES) {
    const routePath = suffix
      ? `/branches/:branchKey${suffix}`
      : "/branches/:branchKey";
    router.get(routePath, (req, res, next) => {
      Promise.resolve(handleBranchPublicPage(req, res))
        .then((handled) => {
          if (handled === null) return next();
          return undefined;
        })
        .catch(next);
    });
  }

  const paths = [
    "/",
    "/about",
    "/leadership",
    "/ministries",
    "/events",
    "/sermons",
    "/contact",
    "/giving",
  ];

  for (const p of paths) {
    router.get(p, (req, res, next) => {
      Promise.resolve(handlePublicPage(req, res))
        .then((handled) => {
          if (handled === null && p === "/") {
            // Apex `/` falls through to the dedicated apex home handler.
            return next();
          }
          if (handled === null) {
            return next();
          }
          return undefined;
        })
        .catch(next);
    });
  }

  return router;
}

module.exports = {
  createTenantPublicRouter,
};
