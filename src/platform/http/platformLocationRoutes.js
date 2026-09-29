"use strict";

/**
 * Shared platform geography autocomplete + country availability
 * (BlessBoard + ActiveClinic).
 */

const {
  autocompleteLocations,
  isCityCatalogueEnabled,
} = require("../geography/locationService");
const {
  listRegistrationCountries,
  hydrateRegistrationCountryAvailability,
} = require("../registration/registrationCountrySelection");
const { PRODUCT } = require("../registration/constants");

/**
 * @param {import('express').Application} app
 * @param {{ getPool: () => { query: Function } }} ctx
 */
function registerPlatformLocationRoutes(app, ctx) {
  const getPool = ctx && ctx.getPool;
  if (!getPool) {
    throw new Error("registerPlatformLocationRoutes requires getPool");
  }

  Promise.resolve()
    .then(() => hydrateRegistrationCountryAvailability(getPool()))
    .catch(() => {});

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

  app.get("/api/locations/autocomplete", handleCityAutocomplete);
  app.get("/api/locations/cities", handleCityAutocomplete);

  app.get("/api/locations/countries", async (req, res) => {
    try {
      const productRaw = String(req.query.product || "").trim().toLowerCase();
      const product =
        productRaw === PRODUCT.ACTIVECLINIC || productRaw === PRODUCT.BLESSBOARD
          ? productRaw
          : null;
      await hydrateRegistrationCountryAvailability(getPool());
      const countries = listRegistrationCountries(product);
      return res.status(200).json({
        ok: true,
        registrationEnabled: true,
        count: countries.length,
        countries: countries.map((c) => ({
          iso: c.iso,
          name: c.name,
          callingCode: c.callingCode,
        })),
      });
    } catch (_err) {
      return res.status(500).json({ ok: false, countries: [] });
    }
  });

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
