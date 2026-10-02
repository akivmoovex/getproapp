"use strict";

const locationRepo = require("./locationRepository");
const { canonicalLocationName, normalizeLocationName } = require("./locationNormalization");
const { isZambiaCountryCode, listZambiaProvinces } = require("./zambiaCatalog");

/**
 * Resolve submitted city/location for registration.
 * @param {{ query: Function }} db
 * @param {{
 *   countryCode: string,
 *   city?: string|null,
 *   locationId?: string|null,
 * }} input
 */
async function resolveRegistrationLocation(db, input) {
  const countryCode = String((input && input.countryCode) || "ZM")
    .trim()
    .toUpperCase();
  const locationId = String((input && input.locationId) || "").trim();
  const cityRaw = String((input && input.city) || "").trim();

  if (locationId) {
    const found = await locationRepo.findLocationByIdForCountry(db, {
      id: locationId,
      countryCode,
    });
    if (!found) {
      return { ok: false, code: "invalid_location_id", error: "Select a valid city for the chosen country." };
    }
    return {
      ok: true,
      city: found.name,
      locationId: found.id,
      provinceRegion: found.provinceRegion,
      source: found.source,
    };
  }

  const city = canonicalLocationName(cityRaw);
  if (!city) {
    return { ok: true, city: null, locationId: null, provinceRegion: null, source: null };
  }
  return { ok: true, city, locationId: null, provinceRegion: null, source: "manual" };
}

/**
 * Persist a user-entered city after successful registration.
 * @param {{ query: Function }} db
 */
async function persistRegistrationLocation(db, input) {
  const countryCode = String((input && input.countryCode) || "ZM")
    .trim()
    .toUpperCase();
  const city = canonicalLocationName(input && input.city);
  if (!city) return null;
  if (input && input.locationId) {
    const existing = await locationRepo.findLocationByIdForCountry(db, {
      id: input.locationId,
      countryCode,
    });
    if (existing) return existing;
  }
  return locationRepo.upsertLocationByName(db, {
    countryCode,
    name: city,
    provinceRegion: input && input.provinceRegion ? input.provinceRegion : null,
    source: "registration",
    approvalStatus: "pending",
    registrationReference: input && input.registrationReference,
  });
}

function validateProvinceForCountry(countryCode, province) {
  const code = String(countryCode || "").trim().toUpperCase();
  const value = String(province || "").trim();
  if (!value) return { ok: true, province: null };
  if (isZambiaCountryCode(code)) {
    const allowed = listZambiaProvinces();
    const match = allowed.find((p) => p.toLowerCase() === value.toLowerCase());
    if (!match) {
      return { ok: false, error: "Select a valid Zambia province." };
    }
    return { ok: true, province: match };
  }
  return { ok: true, province: value.slice(0, 100) };
}

const AUTOCOMPLETE_MAX_QUERY_LEN = 80;
const AUTOCOMPLETE_MAX_RESULTS = 12;

/**
 * Parse and validate autocomplete query parameters.
 * @param {{ countryCode?: string, query?: string, limit?: number }} input
 */
function parseLocationAutocompleteInput(input) {
  const countryCode = String((input && input.countryCode) || "ZM")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    return { ok: false, code: "invalid_country", results: [] };
  }
  const rawQuery = String((input && input.query) || "").trim();
  if (!rawQuery) {
    return { ok: true, countryCode, query: "", results: [], limit: 0 };
  }
  const query = rawQuery.slice(0, AUTOCOMPLETE_MAX_QUERY_LEN);
  if (query.length < 1) {
    return { ok: true, countryCode, query: "", results: [], limit: 0 };
  }
  const limit = Math.min(
    Math.max(Number(input && input.limit) || AUTOCOMPLETE_MAX_RESULTS, 1),
    25
  );
  return { ok: true, countryCode, query, limit };
}

/**
 * @param {{ query: Function }} db
 * @param {{ countryCode?: string, query?: string, limit?: number }} input
 */
async function autocompleteLocations(db, input) {
  const parsed = parseLocationAutocompleteInput(input);
  if (!parsed.ok) return parsed;
  if (!parsed.query) {
    return { ok: true, countryCode: parsed.countryCode, results: [] };
  }
  const results = await locationRepo.searchLocations(db, {
    countryCode: parsed.countryCode,
    query: parsed.query,
    limit: parsed.limit,
  });
  return { ok: true, countryCode: parsed.countryCode, results };
}

module.exports = {
  searchLocations: locationRepo.searchLocations,
  seedZambiaLocations: locationRepo.seedZambiaLocations,
  resolveRegistrationLocation,
  persistRegistrationLocation,
  validateProvinceForCountry,
  parseLocationAutocompleteInput,
  autocompleteLocations,
  listZambiaProvinces,
  isZambiaCountryCode,
  canonicalLocationName,
  normalizeLocationName,
  AUTOCOMPLETE_MAX_QUERY_LEN,
  AUTOCOMPLETE_MAX_RESULTS,
};
