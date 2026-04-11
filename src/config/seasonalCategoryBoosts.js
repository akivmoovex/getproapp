"use strict";

/**
 * Config-driven seasonal boosts for public "trending categories" (additive to base listing counts).
 * Match keys by category slug (case-insensitive, hyphens normalized).
 *
 * Layers:
 * 1) Geo-seasonal: `geoSeasonalCategoryBoosts` by ISO country (IL, ZM, …) or `DEFAULT`.
 * 2) Optional tenant geo override: `tenantGeoSeasonalBoosts[tenantSlug]` replaces the geo chain when set.
 * 3) Legacy global seasonal: `globalSeasonalCategoryBoosts` / `tenantSeasonalCategoryBoosts`.
 *
 * Effective seasonal add-on: max(geo_seasonal_boost, fallback_seasonal_boost) per slug/month.
 * (Equivalent to base + geo + fallback only when one layer is zero; when both match the same slug/month,
 *  we take the larger boost so rules are not double-counted.)
 */

/** @type {{ category: string, months: number[], boost: number }[]} */
const globalSeasonalCategoryBoosts = [
  { category: "tutor", months: [5, 6, 11, 12], boost: 2 },
  { category: "air-conditioning", months: [6, 7, 8], boost: 3 },
  { category: "tax-services", months: [1, 2, 3, 4], boost: 3 },
  { category: "wedding-services", months: [4, 5, 6, 9], boost: 2 },
];

/** @type {Record<string, { category: string, months: number[], boost: number }[]>} */
const tenantSeasonalCategoryBoosts = {
  // Example: zm: [ { category: "tutor", months: [6], boost: 4 } ],
};

/**
 * Region-aware seasonal rules (ISO 3166-1 alpha-2 keys + DEFAULT).
 * Unknown / XX client → use DEFAULT entry when present.
 */
const geoSeasonalCategoryBoosts = {
  IL: [
    { category: "air-conditioning", months: [5, 6, 7, 8, 9], boost: 3 },
    { category: "tutor", months: [5, 6, 11, 12], boost: 2 },
  ],
  ZM: [
    { category: "heating", months: [6, 7, 8], boost: 3 },
    { category: "tutor", months: [10, 11], boost: 2 },
  ],
  DEFAULT: [
    { category: "tax-services", months: [1, 2, 3, 4], boost: 3 },
    { category: "wedding-services", months: [4, 5, 6, 9], boost: 2 },
  ],
};

/** Full rule list replaces geo IL/ZM/DEFAULT for this tenant slug when non-empty. */
const tenantGeoSeasonalBoosts = {
  // Example: demo: [ { category: "tutor", months: [1], boost: 1 } ],
};

function normSlug(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

/** @param {string | undefined} cc */
function normCountryCode(cc) {
  const c = String(cc || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);
  if (!c || c === "XX" || c === "T1") return "";
  return /^[A-Z]{2}$/.test(c) ? c : "";
}

function getBoostRulesForTenant(tenantSlug) {
  const key = normSlug(tenantSlug);
  if (key && tenantSeasonalCategoryBoosts[key] && tenantSeasonalCategoryBoosts[key].length) {
    return tenantSeasonalCategoryBoosts[key];
  }
  return globalSeasonalCategoryBoosts;
}

/**
 * Geo rules: tenant geo override → country → DEFAULT.
 * @param {string | undefined} tenantSlug
 * @param {string | undefined} countryCode
 * @returns {{ category: string, months: number[], boost: number }[]}
 */
function getGeoRulesForRequest(tenantSlug, countryCode) {
  const ts = normSlug(tenantSlug);
  if (ts && tenantGeoSeasonalBoosts[ts] && tenantGeoSeasonalBoosts[ts].length) {
    return tenantGeoSeasonalBoosts[ts];
  }
  const cc = normCountryCode(countryCode);
  if (cc && geoSeasonalCategoryBoosts[cc] && geoSeasonalCategoryBoosts[cc].length) {
    return geoSeasonalCategoryBoosts[cc];
  }
  const def = geoSeasonalCategoryBoosts.DEFAULT;
  return Array.isArray(def) ? def : [];
}

/**
 * @param {string | undefined} tenantSlug
 * @param {string | undefined} countryCode
 * @returns {string} label for debug (e.g. IL, ZM, DEFAULT, tenant:slug)
 */
function resolveGeoRulesSourceLabel(tenantSlug, countryCode) {
  const ts = normSlug(tenantSlug);
  if (ts && tenantGeoSeasonalBoosts[ts] && tenantGeoSeasonalBoosts[ts].length) {
    return `tenant:${ts}`;
  }
  const cc = normCountryCode(countryCode);
  if (cc && geoSeasonalCategoryBoosts[cc] && geoSeasonalCategoryBoosts[cc].length) {
    return cc;
  }
  return "DEFAULT";
}

/**
 * @param {number} month 1–12
 * @param {string} categorySlug
 * @param {{ category: string, months: number[], boost: number }[]} rules
 */
function seasonalBoostForCategory(month, categorySlug, rules) {
  const m = Math.min(Math.max(Number(month) || 1, 1), 12);
  const slug = normSlug(categorySlug);
  let add = 0;
  for (const r of rules || []) {
    if (normSlug(r.category) !== slug) continue;
    if (!Array.isArray(r.months) || !r.months.includes(m)) continue;
    add += Number(r.boost) || 0;
  }
  return add;
}

/**
 * @param {{ slug: string, name: string, listing_count: number }[]} rows
 * @param {{ tenantSlug?: string, countryCode?: string, month?: number, debug?: boolean }} [opts]
 * @returns {{ slug: string, name: string, listing_count: number, geo_seasonal_boost: number, fallback_seasonal_boost: number, seasonal_boost: number, final_score: number, _debug?: object }[]}
 */
function applySeasonalTrendingBoost(rows, opts) {
  const o = opts || {};
  const month = o.month != null ? Number(o.month) : new Date().getMonth() + 1;
  const geoRules = getGeoRulesForRequest(o.tenantSlug, o.countryCode);
  const globalRules = getBoostRulesForTenant(o.tenantSlug);
  const debug = o.debug === true && process.env.NODE_ENV !== "production";
  const countryLabel = normCountryCode(o.countryCode) || "XX";
  const geoSource = resolveGeoRulesSourceLabel(o.tenantSlug, o.countryCode);

  const scored = (rows || []).map((r) => {
    const base = Number(r.listing_count) || 0;
    const geoBoost = seasonalBoostForCategory(month, r.slug, geoRules);
    const globalBoost = seasonalBoostForCategory(month, r.slug, globalRules);
    const seasonal = Math.max(geoBoost, globalBoost);
    const final = base + seasonal;
    /** @type {{ slug: string, name: string, listing_count: number, geo_seasonal_boost: number, fallback_seasonal_boost: number, seasonal_boost: number, final_score: number, _debug?: object }} */
    const out = {
      slug: r.slug,
      name: r.name,
      listing_count: base,
      geo_seasonal_boost: geoBoost,
      fallback_seasonal_boost: globalBoost,
      seasonal_boost: seasonal,
      final_score: final,
    };
    if (debug) {
      out._debug = {
        country: countryLabel,
        geo_rules_source: geoSource,
        base_score: base,
        geo_seasonal_boost: geoBoost,
        fallback_seasonal_boost: globalBoost,
        seasonal_boost: seasonal,
        final_score: final,
      };
    }
    return out;
  });

  scored.sort((a, b) => {
    if (b.final_score !== a.final_score) return b.final_score - a.final_score;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  return scored;
}

module.exports = {
  globalSeasonalCategoryBoosts,
  tenantSeasonalCategoryBoosts,
  geoSeasonalCategoryBoosts,
  tenantGeoSeasonalBoosts,
  getBoostRulesForTenant,
  getGeoRulesForRequest,
  resolveGeoRulesSourceLabel,
  seasonalBoostForCategory,
  applySeasonalTrendingBoost,
};
