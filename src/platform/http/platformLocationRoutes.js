"use strict";

/**
 * Shared platform geography autocomplete (BlessBoard + ActiveClinic).
 * Backed by platform.geographic_locations + geographic_countries.
 */

const { autocompleteLocations, isCityCatalogueEnabled } = require("../geography/locationService");

/**
 * @param {import('express').Application} app
 * @param {{ getPool: () => { query: Function } }} ctx
 */
function registerPlatformLocationRoutes(app, ctx) {
  const getPool = ctx && ctx.getPool;
  if (!getPool) {
    throw new Error("registerPlatformLocationRoutes requires getPool");
  }

  async function handleCityAutocomplete(req, res) {
    try {
      const out = await autocompleteLocations(getPool(), {
        countryCode: req.query.country || req.query.countryCode,
        query: req.query.q || req.query.query,
        limit: req.query.limit,
      });
      if (!out.ok) {
        return res.status(400).json({
          ok: false,
          code: out.code || "invalid_country",
          catalogueEnabled: Boolean(out.catalogueEnabled),
          results: [],
        });
      }
      return res.status(200).json({
        ok: true,
        catalogueEnabled: out.catalogueEnabled !== false,
        results: (out.results || []).map((row) => ({
          id: row.id,
          name: row.name,
          label: row.label || row.name,
          provinceRegion: row.provinceRegion || null,
          administrativeArea: row.administrativeArea || row.provinceRegion || null,
        })),
      });
    } catch (_err) {
      return res.status(500).json({ ok: false, results: [], catalogueEnabled: false });
    }
  }

  // Canonical QA-01 route (kept) + explicit cities alias for QA-02 docs.
  app.get("/api/locations/autocomplete", handleCityAutocomplete);
  app.get("/api/locations/cities", handleCityAutocomplete);

  app.get("/api/locations/catalogue-status", async (req, res) => {
    try {
      const countryCode = req.query.country || req.query.countryCode;
      const enabled = await isCityCatalogueEnabled(getPool(), countryCode);
      return res.status(200).json({
        ok: true,
        countryCode: String(countryCode || "").trim().toUpperCase() || null,
        cityCatalogueEnabled: enabled,
      });
    } catch (_err) {
      return res.status(500).json({ ok: false, cityCatalogueEnabled: false });
    }
  });
}

module.exports = {
  registerPlatformLocationRoutes,
};
