"use strict";

/**
 * Shared platform geography autocomplete (BlessBoard + ActiveClinic).
 */

const { autocompleteLocations } = require("../geography/locationService");

/**
 * @param {import('express').Application} app
 * @param {{ getPool: () => { query: Function } }} ctx
 */
function registerPlatformLocationRoutes(app, ctx) {
  const getPool = ctx && ctx.getPool;
  if (!getPool) {
    throw new Error("registerPlatformLocationRoutes requires getPool");
  }

  app.get("/api/locations/autocomplete", async (req, res) => {
    try {
      const out = await autocompleteLocations(getPool(), {
        countryCode: req.query.country || req.query.countryCode,
        query: req.query.q || req.query.query,
        limit: req.query.limit,
      });
      if (!out.ok) {
        return res.status(400).json({ ok: false, code: out.code || "invalid_country", results: [] });
      }
      return res.status(200).json({ ok: true, results: out.results });
    } catch (_err) {
      return res.status(500).json({ ok: false, results: [] });
    }
  });
}

module.exports = {
  registerPlatformLocationRoutes,
};
