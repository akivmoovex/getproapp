"use strict";

/**
 * Public church website announcement detail (BB22).
 * List is served via tenant public page /announcements (BB21).
 */

const express = require("express");
const fs = require("fs");
const path = require("path");
const ejs = require("ejs");

const { loadTenantPublicPageModel, KIND } = require("./loadTenantPublicPageModel");
const {
  renderTenantPublicPage,
  formatWhen,
  formatDate,
  formatEventParts,
  sermonMediaKind,
  sermonResourceKind,
  initials,
} = require("./renderTenantPublicPage");
const { getPublicWebsiteAnnouncement } = require("../services/announcementsService");
const { renderControlledErrorPage } = require("./renderTenantLandingPage");
const { resolveHostname } = require("../../platform/host");
const { MODE_AUTHORITATIVE } = require("../config/tenantRoutingMode");
const { OUTCOME } = require("./evaluateTenantRoute");
const { presentRuntimeImageSrc, cdnMarketingAsset } = require("../../platform/media/cdnMediaPresentation");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "blessboard", "v5");
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function createAnnouncementPublicRouter(deps) {
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const getTenantRoutingMode = deps.getTenantRoutingMode;
  const router = express.Router();

  function gate(req, res) {
    if (isApexHost(req)) return null;
    const mode = getTenantRoutingMode();
    if (mode !== MODE_AUTHORITATIVE) {
      return res.status(404).type("html").send(renderControlledErrorPage(404, "Not found."));
    }
    const route = req.blessBoardTenantRoute || {};
    if (
      route.outcome === OUTCOME.FOUNDATION ||
      route.outcome === OUTCOME.NOT_FOUND ||
      route.httpStatus === 404
    ) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }
    const tenant = req.blessBoardTenantContext;
    if (!tenant || !tenant.resolved || !tenant.church) {
      return res
        .status(404)
        .type("html")
        .send(renderControlledErrorPage(404, "This BlessBoard site could not be found."));
    }
    return "ready";
  }

  router.get("/announcements/:id", async (req, res, next) => {
    try {
      const status = gate(req, res);
      if (status !== "ready") return status;
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) {
        return res
          .status(404)
          .type("html")
          .send(renderControlledErrorPage(404, "Announcement not found."));
      }
      const tenant = req.blessBoardTenantContext;
      const hostname = resolveHostname(req) || String(req.hostname || "");
      const selectedBranch =
        tenant.selectedBranch ||
        (req.blessBoardPublicBranch && req.blessBoardPublicBranch.id
          ? req.blessBoardPublicBranch
          : null);
      const model = await loadTenantPublicPageModel(getPool(), {
        tenant,
        pageKey: "announcements",
        hostname,
        selectedBranch,
        routingMode: "tenant",
      });
      if (model.kind !== KIND.OK) {
        return res
          .status(model.kind === KIND.SETUP ? 200 : 503)
          .type("html")
          .send(
            model.kind === KIND.SETUP
              ? renderTenantPublicPage(model)
              : renderControlledErrorPage(503, "This BlessBoard site is temporarily unavailable.")
          );
      }
      const loaded = await getPublicWebsiteAnnouncement(getPool(), {
        churchId: tenant.church.id,
        branchId: selectedBranch && selectedBranch.id ? selectedBranch.id : null,
        id,
      });
      const filename = path.join(VIEWS_ROOT, "public/announcement-detail.ejs");
      const pathPrefix = String(model.pathPrefix || "").replace(/\/$/, "");
      const hrefFor = (pagePath) => {
        const raw = String(pagePath || "/");
        if (!pathPrefix) return raw;
        if (raw === "/") return pathPrefix;
        return `${pathPrefix}${raw.startsWith("/") ? raw : `/${raw}`}`;
      };
      const html = ejs.render(
        fs.readFileSync(filename, "utf8"),
        {
          ...model,
          pageKey: "announcements",
          pageTitle: (loaded.item && loaded.item.title) || "Announcement",
          item: loaded.ok ? loaded.item : null,
          pathPrefix,
          homeHref: pathPrefix || "/",
          hrefFor,
          formatWhen,
          formatDate,
          formatEventParts,
          sermonMediaKind,
          sermonResourceKind,
          initials,
          presentImageSrc: (src) => presentRuntimeImageSrc(src, process.env) || "",
          cdnAsset: (publicPath) => cdnMarketingAsset(publicPath, process.env) || "",
        },
        { filename }
      );
      return res.status(loaded.ok ? 200 : 404).type("html").send(html);
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

module.exports = {
  createAnnouncementPublicRouter,
};
