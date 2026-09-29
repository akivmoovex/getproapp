"use strict";

/**
 * Platform PhoneField locals builder — shared default-country + country list for all products.
 */

const {
  listPhoneCountries,
  resolveDefaultCountry,
  resolveDeploymentDefaultCountry,
  formatNational,
  getCountryFromE164,
  extractPhoneFieldsFromBody,
  normalizePhoneNumber,
  parsePhoneInput,
} = require("./phoneNumberService");

function splitE164(e164, defaultCountry) {
  const country =
    getCountryFromE164(e164) ||
    resolveDefaultCountry({
      platformDefaultCountry: defaultCountry,
    });
  const national = formatNational(e164) || "";
  return { country, national };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   selectedCountry?: string|null,
 *   clinicDefaultCountry?: string|null,
 *   organizationDefaultCountry?: string|null,
 *   e164Value?: string|null,
 * }} [opts]
 */
function buildPlatformPhoneFieldLocals(opts) {
  const options = opts || {};
  const env = options.env || process.env;
  const deploymentDefault = resolveDeploymentDefaultCountry(env);
  const defaultCountry = resolveDefaultCountry({
    selectedCountry: options.selectedCountry,
    clinicDefaultCountry: options.clinicDefaultCountry,
    organizationDefaultCountry: options.organizationDefaultCountry,
    deploymentDefaultCountry: deploymentDefault,
    env,
  });
  let selectedCountry = options.selectedCountry || defaultCountry;
  let nationalValue = options.nationalValue || "";
  if (options.e164Value) {
    const split = splitE164(options.e164Value, defaultCountry);
    selectedCountry = split.country;
    nationalValue = split.national;
  }
  return {
    defaultCountry,
    selectedCountry,
    nationalValue,
    countries: listPhoneCountries(),
    phoneCountries: listPhoneCountries(),
  };
}

module.exports = {
  buildPlatformPhoneFieldLocals,
  splitE164,
  listPhoneCountries,
  resolveDefaultCountry,
  resolveDeploymentDefaultCountry,
  extractPhoneFieldsFromBody,
  normalizePhoneNumber,
  parsePhoneInput,
  formatNational,
  getCountryFromE164,
};
