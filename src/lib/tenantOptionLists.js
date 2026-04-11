"use strict";

const categoriesRepo = require("../db/pg/categoriesRepo");
const tenantCitiesRepo = require("../db/pg/tenantCitiesRepo");

/**
 * Unique city names from tenant city rows (any enabled state), stable order by first occurrence.
 * @param {{ name?: string }[]} rows
 * @returns {string[]}
 */
function cityNamesAll(rows) {
  const out = [];
  const seen = new Set();
  for (const r of rows || []) {
    const n = String(r && r.name ? r.name : "").trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/**
 * Enabled tenant cities only (for /services/… slug resolution and SQL filters).
 * @param {{ name?: string, enabled?: boolean|number, bigCity?: boolean|number, big_city?: boolean }[]} tenantCityRows
 * @returns {string[]}
 */
function mergeCityNamesForLanding(tenantCityRows) {
  const out = [];
  const seen = new Set();
  for (const row of tenantCityRows || []) {
    if (!row) continue;
    if (row.enabled === false || row.enabled === 0) continue;
    const n = String(row.name || "").trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/**
 * @param {{ name?: string, enabled?: boolean|number, bigCity?: boolean|number, big_city?: boolean }[]} tenantCityRows
 * @returns {string[]} up to 2 city names for homepage explore links
 */
function pickExploreCityNames(tenantCityRows) {
  const rows = tenantCityRows || [];
  const normEn = (r) => r && (r.enabled === true || r.enabled === 1);
  const normBig = (r) => r && (r.bigCity === true || r.bigCity === 1 || r.big_city === true || r.big_city === 1);
  const enabled = rows.filter(normEn);
  const big = enabled.filter(normBig);
  const names = (arr) =>
    arr.map((r) => String(r && r.name ? r.name : "").trim()).filter(Boolean);
  const nb = names(big);
  if (nb.length >= 2) return nb.slice(0, 2);
  if (nb.length === 1 && enabled.length >= 2) {
    const b = nb[0];
    const other = names(enabled).find((n) => n !== b);
    return other ? [b, other] : [b];
  }
  return names(enabled).slice(0, 2);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @returns {Promise<{ services: string[], cities: string[], popular: string[] }>}
 */
async function loadTenantSearchOptionLists(pool, tenantId) {
  const tid = Number(tenantId);
  if (!tid) return { services: [], cities: [], popular: [] };
  const [cats, cityRows] = await Promise.all([
    categoriesRepo.listByTenantId(pool, tid),
    tenantCitiesRepo.listByTenantIdOrderByName(pool, tid),
  ]);
  const services = cats
    .map((c) => String(c.name || "").trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "en"));
  const cities = cityNamesAll(cityRows).sort((a, b) => a.localeCompare(b, "en"));
  const popular = services.slice(0, 5);
  return { services, cities, popular };
}

/**
 * @param {string} value
 * @param {string[]|undefined} tenantCategoryNames
 */
function isWhitelistedService(value, tenantCategoryNames) {
  if (!value) return true;
  const v = String(value).trim().toLowerCase();
  if (Array.isArray(tenantCategoryNames) && tenantCategoryNames.some((n) => String(n).trim().toLowerCase() === v)) {
    return true;
  }
  return false;
}

/**
 * @param {string} value
 * @param {string[]|undefined} tenantCityNames
 */
function isWhitelistedCity(value, tenantCityNames) {
  if (!value) return true;
  const v = String(value).trim().toLowerCase();
  if (!Array.isArray(tenantCityNames) || tenantCityNames.length === 0) return false;
  return tenantCityNames.some((c) => String(c).trim().toLowerCase() === v);
}

/** @param {{ slug?: string, name?: string }[]} categories */
function buildEmptyStateSuggestions(categories, selectedSlug, cityQ, cityNameOptions) {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const cityNorm = norm(cityQ);
  const selected = String(selectedSlug || "").trim();
  const emptyAltCategories = (categories || [])
    .filter((c) => c && c.slug && c.slug !== selected)
    .slice(0, 5);
  const pool = Array.isArray(cityNameOptions) ? cityNameOptions : [];
  const emptyAltCities = pool
    .filter((c) => !cityNorm || norm(c) !== cityNorm)
    .slice(0, 5);
  return { emptyAltCategories, emptyAltCities };
}

module.exports = {
  cityNamesAll,
  mergeCityNamesForLanding,
  pickExploreCityNames,
  loadTenantSearchOptionLists,
  isWhitelistedService,
  isWhitelistedCity,
  buildEmptyStateSuggestions,
};
