"use strict";

/**
 * Authoritative-mode tenant public website routes.
 * Renders published content only; no admin chrome; no legacy tables.
 */

const express = require("express");

const {
  MODE_AUTHORITATIVE,
  MODE_OFF,
  MODE_SHADOW,
} = require("../config/tenantRoutingMode");
const { OUTCOME } = require("./evaluateTenantRoute");
const { pageKeyFromPath, isTenantPublicPagePath } = require("./tenantPublicPaths");
const { loadTenantPublicPageModel, KIND } = require("./loadTenantPublicPageModel");
const { renderTenantPublicPage } = require("./renderTenantPublicPage");
const { renderControlledErrorPage, renderFoundationHome } = require("./renderTenantLandingPage");
const { resolveHostname } = require("../../platform/host");

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

  async function handlePublicPage(req, res) {
    if (isApexHost(req)) {
      return null; // let apex home / other handlers run
    }

    const pathOnly = String(req.path || "/").split("?")[0] || "/";
    if (!isTenantPublicPagePath(pathOnly)) {
      return null;
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

    const pageKey = pageKeyFromPath(pathOnly);
    const hostname = resolveHostname(req) || String(req.hostname || "");

    let model;
    try {
      model = await loadTenantPublicPageModel(getPool(), {
        tenant: req.blessBoardTenantContext,
        pageKey,
        hostname,
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

    if (model.seo && model.seo.noindex) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
    }

    const html = renderTenantPublicPage(model);
    return res.status(200).type("html").send(html);
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
