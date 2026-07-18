"use strict";

/**
 * Public media delivery for active, public assets owned by the current tenant church.
 * Private assets are never served here.
 */

const express = require("express");
const { createMediaUploadService, STATUS, VISIBILITY } = require("../media/mediaUploadService");
const { OUTCOME } = require("./evaluateTenantRoute");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost: (req: import('express').Request) => boolean,
 *   env?: NodeJS.ProcessEnv,
 *   mediaService?: ReturnType<typeof createMediaUploadService>,
 * }} deps
 */
function createPublicMediaRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const env = deps.env || process.env;
  const mediaService = deps.mediaService || createMediaUploadService(env);

  router.get("/_bb/media/:assetId", async (req, res) => {
    if (isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const assetId = String(req.params.assetId || "").trim();
    if (!UUID_RE.test(assetId)) {
      return res.status(404).type("text").send("Not found");
    }

    const route = req.blessBoardTenantRoute || {};
    const ctx = req.blessBoardTenantContext;
    if (
      route.outcome === OUTCOME.NOT_FOUND ||
      !ctx ||
      !ctx.resolved ||
      !ctx.church ||
      !ctx.church.id
    ) {
      return res.status(404).type("text").send("Not found");
    }

    const loaded = await mediaService.loadMediaBytes(getPool(), {
      assetId,
      viewerChurchId: ctx.church.id,
      allowPrivate: false,
    });

    if (!loaded.ok) {
      const code =
        loaded.status === STATUS.FORBIDDEN
          ? 403
          : loaded.status === STATUS.NOT_FOUND
            ? 404
            : 503;
      return res.status(code).type("text").send(code === 403 ? "Forbidden" : "Not found");
    }

    if (loaded.asset.visibility !== VISIBILITY.PUBLIC) {
      return res.status(403).type("text").send("Forbidden");
    }

    if (loaded.redirectUrl) {
      return res.redirect(302, loaded.redirectUrl);
    }

    res.setHeader("Content-Type", loaded.asset.mimeType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.status(200).send(loaded.buffer);
  });

  return router;
}

module.exports = {
  createPublicMediaRouter,
};
