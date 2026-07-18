"use strict";

/**
 * Apex marketing GET routes (Batch 2b).
 * No schema, auth, billing, or provisioning side effects.
 */

const express = require("express");
const directoryRepo = require("../../db/pg/church/publicChurchDirectoryRepo");
const {
  renderFeaturesPage,
  renderForChurchesPage,
  renderPricingPage,
  renderDirectoryPage,
  renderRegisterChurchPage,
} = require("./renderApexMarketing");

/**
 * @param {{
 *   getPool: () => import('pg').Pool,
 *   isApexHost: (req: import('express').Request) => boolean,
 *   issueCsrfToken: (env: object) => string,
 *   setCsrfCookie: (res: import('express').Response, token: string, opts: object) => void,
 *   env: object,
 *   isProduction: boolean,
 * }} deps
 */
function createApexMarketingRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const issueCsrfToken = deps.issueCsrfToken;
  const setCsrfCookie = deps.setCsrfCookie;
  const env = deps.env || {};
  const isProduction = Boolean(deps.isProduction);

  function withShell(req, res, renderFn, extra = {}) {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });
    return res.status(200).type("html").send(
      renderFn({
        authenticated,
        csrfToken: authenticated ? csrfToken : null,
        ...extra,
      })
    );
  }

  router.get("/features", (req, res) => withShell(req, res, renderFeaturesPage));
  router.get("/for-churches", (req, res) => withShell(req, res, renderForChurchesPage));
  router.get("/pricing", (req, res) => withShell(req, res, renderPricingPage));
  router.get("/register-church", (req, res) => withShell(req, res, renderRegisterChurchPage));

  router.get("/directory", async (req, res) => {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueCsrfToken(env);
    setCsrfCookie(res, csrfToken, { secure: isProduction });

    const q = directoryRepo.normalizeSearchQuery(req.query && req.query.q);
    const page = Number(req.query && req.query.page) || 1;
    let results = { items: [], total: 0, page: 1, limit: directoryRepo.DEFAULT_PAGE_SIZE, totalPages: 0, q };
    let directoryUnavailable = false;

    try {
      const pool = getPool();
      if (pool) {
        results = await directoryRepo.searchPublicOrganizations(pool, { q, page });
      } else {
        directoryUnavailable = true;
      }
    } catch (_err) {
      directoryUnavailable = true;
      results = { items: [], total: 0, page: 1, limit: directoryRepo.DEFAULT_PAGE_SIZE, totalPages: 0, q };
    }

    return res.status(200).type("html").send(
      renderDirectoryPage({
        authenticated,
        csrfToken: authenticated ? csrfToken : null,
        results,
        directoryUnavailable,
      })
    );
  });

  return router;
}

module.exports = {
  createApexMarketingRouter,
};
