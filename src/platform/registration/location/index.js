"use strict";

/**
 * Shared registration location contract (BlessBoard + ActiveClinic).
 *
 * Canonical persisted fields (do not duplicate):
 * - country / countryCode (ISO-2)
 * - city (display name)
 * - locationId (optional FK into platform.geographic_locations)
 * - province / provinceState / province_region (optional administrativeArea;
 *   retained for compatibility — not required on V2.04 registration UI)
 * - address / address_line_1 (optional street address; product-specific)
 *
 * Browser UI: public/platform/location-autocomplete.js + gp-location-field partial.
 * Autocomplete API: GET /api/locations/cities (alias: /api/locations/autocomplete)
 * Catalogue: platform.geographic_countries + platform.geographic_locations
 */

const locationService = require("../../geography/locationService");
const {
  normalizeRegistrationCountryCode,
  listRegistrationCountries,
  resolveRegistrationDefaultCountry,
  usesZambiaProvinceSelect,
  buildRegistrationCountryLocals,
} = require("../registrationCountrySelection");

/** V2.04 registration shows Country + City only. */
const REGISTRATION_VISIBLE_LOCATION_FIELDS = Object.freeze(["country", "city"]);

/**
 * Whether province/region should appear on the normal registration form.
 * Always false for V2.04; product rules may still expose Zambia catalogue helpers
 * for admin/settings surfaces.
 */
function isProvinceRegionVisibleInRegistration() {
  return false;
}

/**
 * Province/region is never required for registration submission.
 */
function isProvinceRegionRequiredInRegistration() {
  return false;
}

module.exports = {
  REGISTRATION_VISIBLE_LOCATION_FIELDS,
  isProvinceRegionVisibleInRegistration,
  isProvinceRegionRequiredInRegistration,
  normalizeRegistrationCountryCode,
  listRegistrationCountries,
  resolveRegistrationDefaultCountry,
  usesZambiaProvinceSelect,
  buildRegistrationCountryLocals,
  resolveRegistrationLocation: locationService.resolveRegistrationLocation,
  persistRegistrationLocation: locationService.persistRegistrationLocation,
  validateProvinceForCountry: locationService.validateProvinceForCountry,
  autocompleteLocations: locationService.autocompleteLocations,
  parseLocationAutocompleteInput: locationService.parseLocationAutocompleteInput,
  isCityCatalogueEnabled: locationService.isCityCatalogueEnabled,
  seedCityCatalogue: locationService.seedCityCatalogue,
  getCityCatalogueStats: locationService.getCityCatalogueStats,
  canonicalLocationName: locationService.canonicalLocationName,
  normalizeLocationName: locationService.normalizeLocationName,
};
