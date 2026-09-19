"use strict";

/**
 * Shared registration country selection + normalization for ActiveClinic and BlessBoard.
 *
 * Supported countries = the shared phone/country catalogue (libphonenumber), optionally
 * narrowed by a product allowlist. Do not invent an eligibility policy here: when
 * `allowlist` is null/empty, every catalogue country is selectable.
 *
 * Country-dependent business rules (e.g. Zambia province select) stay product-configurable.
 */

const {
  listPhoneCountries,
  resolveDefaultCountry,
  resolveDeploymentDefaultCountry,
  PLATFORM_DEFAULT_COUNTRY,
} = require("../services/phoneNumberService");
const { isZambiaCountryCode, listZambiaProvinces } = require("../geography/zambiaCatalog");
const { PRODUCT } = require("./constants");

/**
 * Per-product registration country rules.
 * `allowlist: null` → full shared catalogue (current shipped behavior).
 * Set an explicit ISO-2 allowlist only when product policy is recorded elsewhere.
 */
const PRODUCT_REGISTRATION_COUNTRY_RULES = Object.freeze({
  [PRODUCT.ACTIVECLINIC]: Object.freeze({
    allowlist: null,
    defaultCountry: null,
    zambiaProvinceSelect: true,
  }),
  [PRODUCT.BLESSBOARD]: Object.freeze({
    allowlist: null,
    defaultCountry: null,
    zambiaProvinceSelect: false,
  }),
});

function resolveProductKey(product) {
  const key = String(product || "")
    .trim()
    .toLowerCase();
  if (key === PRODUCT.ACTIVECLINIC || key === PRODUCT.BLESSBOARD) return key;
  return null;
}

/**
 * @param {string|null|undefined} product
 * @returns {{
 *   allowlist: string[]|null,
 *   defaultCountry: string|null,
 *   zambiaProvinceSelect: boolean,
 * }}
 */
function getProductRegistrationCountryRules(product) {
  const key = resolveProductKey(product);
  if (key && PRODUCT_REGISTRATION_COUNTRY_RULES[key]) {
    return PRODUCT_REGISTRATION_COUNTRY_RULES[key];
  }
  return Object.freeze({
    allowlist: null,
    defaultCountry: null,
    zambiaProvinceSelect: false,
  });
}

function normalizeIso2(raw) {
  const code = String(raw == null ? "" : raw)
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * Catalogue countries for registration dropdowns, Zambia first (shared phone sort).
 * @param {string|null|undefined} product
 * @returns {Array<{ iso: string, name: string, callingCode: string, searchText: string }>}
 */
function listRegistrationCountries(product) {
  const rules = getProductRegistrationCountryRules(product);
  const all = listPhoneCountries();
  const allow = Array.isArray(rules.allowlist)
    ? rules.allowlist.map((c) => normalizeIso2(c)).filter(Boolean)
    : null;
  if (!allow || !allow.length) return all;
  const allowed = new Set(allow);
  return all.filter((row) => allowed.has(row.iso));
}

/**
 * @param {string|null|undefined} product
 * @param {unknown} raw
 */
function isSupportedRegistrationCountry(product, raw) {
  const code = normalizeIso2(raw);
  if (!code) return false;
  return listRegistrationCountries(product).some((row) => row.iso === code);
}

/**
 * Normalize a registration country selection to ISO-2.
 * @param {unknown} raw
 * @param {{
 *   product?: string|null,
 *   required?: boolean,
 *   env?: NodeJS.ProcessEnv|object,
 *   fallbackCountry?: string|null,
 * }} [opts]
 * @returns {{
 *   ok: boolean,
 *   value: string|null,
 *   error?: string,
 *   field?: string,
 * }}
 */
function normalizeRegistrationCountryCode(raw, opts) {
  const options = opts || {};
  const product = options.product || null;
  const required = options.required !== false;
  const code = normalizeIso2(raw);

  if (!code) {
    if (!required) {
      const fallback =
        normalizeIso2(options.fallbackCountry) ||
        resolveRegistrationDefaultCountry(product, options.env);
      return { ok: true, value: fallback };
    }
    return {
      ok: false,
      value: null,
      error: "Select a country.",
      field: "country",
    };
  }

  if (!isSupportedRegistrationCountry(product, code)) {
    return {
      ok: false,
      value: null,
      error: "Select a valid country.",
      field: "country",
    };
  }

  return { ok: true, value: code };
}

/**
 * @param {string|null|undefined} product
 * @param {NodeJS.ProcessEnv|object} [env]
 */
function resolveRegistrationDefaultCountry(product, env) {
  const rules = getProductRegistrationCountryRules(product);
  const preferred = normalizeIso2(rules.defaultCountry);
  if (preferred && isSupportedRegistrationCountry(product, preferred)) {
    return preferred;
  }
  const resolved = resolveDefaultCountry({
    deploymentDefaultCountry: resolveDeploymentDefaultCountry(env || process.env),
    platformDefaultCountry: PLATFORM_DEFAULT_COUNTRY,
    env: env || process.env,
  });
  const iso = normalizeIso2(resolved) || PLATFORM_DEFAULT_COUNTRY;
  if (isSupportedRegistrationCountry(product, iso)) return iso;
  const first = listRegistrationCountries(product)[0];
  return (first && first.iso) || PLATFORM_DEFAULT_COUNTRY;
}

/**
 * Whether the product should show the Zambia province select for this country.
 * @param {string|null|undefined} product
 * @param {unknown} countryCode
 */
function usesZambiaProvinceSelect(product, countryCode) {
  const rules = getProductRegistrationCountryRules(product);
  if (!rules.zambiaProvinceSelect) return false;
  return isZambiaCountryCode(countryCode);
}

/**
 * Locals for registration templates (AC + BB).
 * @param {string|null|undefined} product
 * @param {{
 *   env?: NodeJS.ProcessEnv|object,
 *   selectedCountry?: string|null,
 * }} [opts]
 */
function buildRegistrationCountryLocals(product, opts) {
  const options = opts || {};
  const countries = listRegistrationCountries(product);
  const defaultCountry = resolveRegistrationDefaultCountry(product, options.env);
  const selectedRaw = normalizeIso2(options.selectedCountry);
  const selectedCountry =
    selectedRaw && isSupportedRegistrationCountry(product, selectedRaw)
      ? selectedRaw
      : defaultCountry;
  return {
    registrationCountries: countries,
    phoneCountries: countries,
    countries,
    defaultCountry,
    defaultPhoneCountry: defaultCountry,
    selectedRegistrationCountry: selectedCountry,
    zambiaProvinces: listZambiaProvinces(),
    isZambiaCountryCode,
    usesZambiaProvinceSelect: (code) => usesZambiaProvinceSelect(product, code),
  };
}

module.exports = {
  PRODUCT_REGISTRATION_COUNTRY_RULES,
  getProductRegistrationCountryRules,
  listRegistrationCountries,
  isSupportedRegistrationCountry,
  normalizeRegistrationCountryCode,
  resolveRegistrationDefaultCountry,
  usesZambiaProvinceSelect,
  buildRegistrationCountryLocals,
  isZambiaCountryCode,
  listZambiaProvinces,
  PLATFORM_DEFAULT_COUNTRY,
};
