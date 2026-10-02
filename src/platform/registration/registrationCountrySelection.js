"use strict";

/**
 * Shared registration country selection + normalization for ActiveClinic and BlessBoard.
 *
 * V2.04: available countries come from platform geography
 * (platform.geographic_countries.registration_enabled), not the full phone catalogue
 * and not product-local hard-coded lists.
 *
 * Phone metadata (calling codes / display names) is still reused from the shared
 * phone catalogue for enabled ISO codes only.
 */

const {
  listPhoneCountries,
  resolveDefaultCountry,
  resolveDeploymentDefaultCountry,
  PLATFORM_DEFAULT_COUNTRY,
} = require("../services/phoneNumberService");
const { isZambiaCountryCode, listZambiaProvinces } = require("../geography/zambiaCatalog");
const {
  INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES,
  listInitialRegistrationEnabledMarkets,
} = require("../geography/registrationEnabledMarkets");
const { PRODUCT } = require("./constants");

/**
 * Per-product registration country rules.
 * Platform registration_enabled is the primary gate. Product allowlist may further
 * narrow later; null means "all platform-enabled markets".
 */
const PRODUCT_REGISTRATION_COUNTRY_RULES = Object.freeze({
  [PRODUCT.ACTIVECLINIC]: Object.freeze({
    allowlist: null,
    defaultCountry: null,
    zambiaProvinceSelect: false,
  }),
  [PRODUCT.BLESSBOARD]: Object.freeze({
    allowlist: null,
    defaultCountry: null,
    zambiaProvinceSelect: false,
  }),
});

/** @type {null | Array<{ countryCode: string, countryName: string }>} */
let registrationEnabledCache = null;

function resolveProductKey(product) {
  const key = String(product || "")
    .trim()
    .toLowerCase();
  if (key === PRODUCT.ACTIVECLINIC || key === PRODUCT.BLESSBOARD) return key;
  return null;
}

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

function getBootstrapEnabledMarkets() {
  return listInitialRegistrationEnabledMarkets();
}

/**
 * Install DB-backed availability into the process cache.
 * @param {Array<{ countryCode: string, countryName?: string }>} rows
 */
function setRegistrationEnabledCountryCache(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    registrationEnabledCache = null;
    return;
  }
  registrationEnabledCache = rows
    .map((row) => ({
      countryCode: normalizeIso2(row.countryCode || row.iso || row.country_code),
      countryName: String(row.countryName || row.name || row.country_name || "").trim(),
    }))
    .filter((row) => row.countryCode);
}

function clearRegistrationEnabledCountryCache() {
  registrationEnabledCache = null;
}

function listEnabledMarketRows() {
  if (registrationEnabledCache && registrationEnabledCache.length) {
    return registrationEnabledCache.slice();
  }
  return getBootstrapEnabledMarkets();
}

/**
 * @param {{ query: Function }} db
 */
async function hydrateRegistrationCountryAvailability(db) {
  if (!db || typeof db.query !== "function") {
    setRegistrationEnabledCountryCache(getBootstrapEnabledMarkets());
    return { ok: true, source: "bootstrap", count: INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES.length };
  }
  try {
    const r = await db.query(
      `SELECT country_code, country_name
         FROM platform.geographic_countries
        WHERE is_active = TRUE
          AND registration_enabled = TRUE
        ORDER BY
          CASE country_code WHEN 'ZM' THEN 0 ELSE 1 END,
          country_name ASC`
    );
    if (!r.rows.length) {
      setRegistrationEnabledCountryCache(getBootstrapEnabledMarkets());
      return {
        ok: true,
        source: "bootstrap",
        count: INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES.length,
      };
    }
    setRegistrationEnabledCountryCache(
      r.rows.map((row) => ({
        countryCode: row.country_code,
        countryName: row.country_name,
      }))
    );
    return { ok: true, source: "database", count: r.rows.length };
  } catch (_err) {
    setRegistrationEnabledCountryCache(getBootstrapEnabledMarkets());
    return {
      ok: true,
      source: "bootstrap",
      count: INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES.length,
    };
  }
}

function sortRegistrationCountries(rows) {
  return rows.slice().sort((a, b) => {
    if (a.iso === "ZM") return -1;
    if (b.iso === "ZM") return 1;
    return String(a.name).localeCompare(String(b.name));
  });
}

/**
 * Platform-enabled registration countries for dropdowns (shared BB + AC).
 * @param {string|null|undefined} product
 * @returns {Array<{ iso: string, name: string, callingCode: string, searchText: string }>}
 */
function listRegistrationCountries(product) {
  const rules = getProductRegistrationCountryRules(product);
  const markets = listEnabledMarketRows();
  let codes = markets.map((m) => m.countryCode);
  const allow = Array.isArray(rules.allowlist)
    ? rules.allowlist.map((c) => normalizeIso2(c)).filter(Boolean)
    : null;
  if (allow && allow.length) {
    const allowed = new Set(allow);
    codes = codes.filter((c) => allowed.has(c));
  }
  const phoneByIso = new Map(listPhoneCountries().map((row) => [row.iso, row]));
  const nameByIso = new Map(markets.map((m) => [m.countryCode, m.countryName]));
  const rows = codes.map((iso) => {
    const phone = phoneByIso.get(iso);
    const name = (phone && phone.name) || nameByIso.get(iso) || iso;
    const callingCode = (phone && phone.callingCode) || "";
    return {
      iso,
      name,
      callingCode,
      searchText: `${name} ${iso} ${callingCode}`.toLowerCase(),
    };
  });
  return sortRegistrationCountries(rows);
}

function isSupportedRegistrationCountry(product, raw) {
  const code = normalizeIso2(raw);
  if (!code) return false;
  return listRegistrationCountries(product).some((row) => row.iso === code);
}

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

function usesZambiaProvinceSelect(product, countryCode) {
  const rules = getProductRegistrationCountryRules(product);
  if (!rules.zambiaProvinceSelect) return false;
  return isZambiaCountryCode(countryCode);
}

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
  hydrateRegistrationCountryAvailability,
  setRegistrationEnabledCountryCache,
  clearRegistrationEnabledCountryCache,
  isZambiaCountryCode,
  listZambiaProvinces,
  PLATFORM_DEFAULT_COUNTRY,
  INITIAL_REGISTRATION_ENABLED_COUNTRY_CODES,
};
