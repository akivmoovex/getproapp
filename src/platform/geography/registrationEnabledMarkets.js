"use strict";

/**
 * Initial V2.04 registration-enabled markets (neutral product support set).
 *
 * This is the bootstrap / fallback enablement list when the DB cache has not
 * been hydrated yet. Canonical runtime source is:
 *   platform.geographic_countries.registration_enabled = TRUE
 *
 * To enable another country later:
 * 1. INSERT/UPDATE platform.geographic_countries
 *    (registration_enabled=true, is_active=true; optionally city_catalogue_enabled)
 * 2. Seed cities if catalogue coverage is desired
 * 3. Restart or call hydrateRegistrationCountryAvailability(db)
 * No BlessBoard/ActiveClinic application-code change required.
 */

const INITIAL_REGISTRATION_ENABLED_MARKETS = Object.freeze([
  Object.freeze({ countryCode: "ZM", countryName: "Zambia" }),
  Object.freeze({ countryCode: "ZW", countryName: "Zimbabwe" }),
  Object.freeze({ countryCode: "BW", countryName: "Botswana" }),
  Object.freeze({ countryCode: "NA", countryName: "Namibia" }),
  Object.freeze({ countryCode: "ZA", countryName: "South Africa" }),
  Object.freeze({ countryCode: "LS", countryName: "Lesotho" }),
  Object.freeze({ countryCode: "SZ", countryName: "Eswatini" }),
  Object.freeze({ countryCode: "MW", countryName: "Malawi" }),
  Object.freeze({ countryCode: "MZ", countryName: "Mozambique" }),
  Object.freeze({ countryCode: "KE", countryName: "Kenya" }),
  Object.freeze({ countryCode: "UG", countryName: "Uganda" }),
  Object.freeze({ countryCode: "TZ", countryName: "Tanzania" }),
  Object.freeze({ countryCode: "RW", countryName: "Rwanda" }),
  Object.freeze({ countryCode: "BI", countryName: "Burundi" }),
  Object.freeze({ countryCode: "US", countryName: "United States" }),
  Object.freeze({ countryCode: "CA", countryName: "Canada" }),
  Object.freeze({ countryCode: "GB", countryName: "United Kingdom" }),
  Object.freeze({ countryCode: "AU", countryName: "Australia" }),
  Object.freeze({ countryCode: "NZ", countryName: "New Zealand" }),
]);

const INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES = Object.freeze(
  INITIAL_REGISTRATION_ENABLED_MARKETS.map((row) => row.countryCode)
);

function listInitialRegistrationEnabledMarkets() {
  return INITIAL_REGISTRATION_ENABLED_MARKETS.map((row) => ({ ...row }));
}

function isInitialRegistrationEnabledCountry(code) {
  const iso = String(code || "")
    .trim()
    .toUpperCase();
  return INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES.includes(iso);
}

module.exports = {
  INITIAL_REGISTRATION_ENABLED_MARKETS,
  INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES,
  listInitialRegistrationEnabledMarkets,
  isInitialRegistrationEnabledCountry,
};
