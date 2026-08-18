"use strict";

/**
 * Apex vanity church URLs for allowlisted organization keys.
 *
 * Example: /demo-church → same public site as /c/demo-church
 * (302 redirect to canonical path-public URL — avoids duplicating loaders).
 *
 * Reserved apex routes must call next() so /login, /hq, /pricing, etc. stay intact.
 * Unknown allowlist-miss or reserved keys fall through to the existing 404 path.
 */

const express = require("express");
const { findOrganizationByKey } = require("../repositories/blessBoardCatalogueRepository");
const { PAGE_SUFFIXES } = require("./tenantPublicPaths");
const {
  normalizeVanityOrganizationKey,
  VANITY_ORGANIZATION_KEYS,
} = require("../services/organizationKeyCompat");
const { isReservedOrganizationKey } = require("../services/organizationKey");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  appendQuery,
  searchFromRequest,
} = require("../../platform/website/publicWebsiteUrl");

/**
 * @param {{
 *   getPool: () => { query: Function },
 *   isApexHost?: (req: object) => boolean,
 * }} deps
 */
function createVanityChurchPublicRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost =
    typeof deps.isApexHost === "function" ? deps.isApexHost : () => true;

  async function handleVanity(req, res, next, organizationKeyRaw, suffix) {
    if (!isApexHost(req)) {
      return next();
    }

    const raw = String(organizationKeyRaw || "")
      .trim()
      .toLowerCase();
    if (!raw || isReservedOrganizationKey(raw)) {
      return next();
    }

    const vanity = normalizeVanityOrganizationKey(raw);
    if (!vanity.ok) {
      return next();
    }

    let org;
    try {
      org = await findOrganizationByKey(getPool(), vanity.key);
    } catch {
      return res.status(503).type("text").send("Temporarily unavailable");
    }

    if (!org || String(org.status || "") === "retired" || String(org.status || "") === "inactive") {
      return next();
    }

    const suffixPath = suffix || "";
    const target = appendQuery(
      buildPublicOrganizationWebsitePath({
        product: PRODUCT_CODE.BLESSBOARD,
        organizationKey: vanity.key,
        suffix: suffixPath,
      }),
      searchFromRequest(req)
    );
    if (!target) return next();
    return res.redirect(302, target);
  }

  for (const suffix of PAGE_SUFFIXES) {
    const routePath = suffix ? `/:organizationKey${suffix}` : "/:organizationKey";
    router.get(routePath, (req, res, next) => {
      Promise.resolve(handleVanity(req, res, next, req.params.organizationKey, suffix)).catch(
        next
      );
    });
  }

  return router;
}

module.exports = {
  createVanityChurchPublicRouter,
  VANITY_ORGANIZATION_KEYS,
};
