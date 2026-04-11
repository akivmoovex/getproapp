"use strict";

const { mergeCityNamesForLanding } = require("./tenantOptionLists");

/**
 * URL segment slug (lowercase, hyphens). Matches directory city filter when reversed.
 */
function slugifySegment(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * @param {string} citySlug
 * @param {string[]} cityNames — canonical display names for SQL ILIKE, or null
 * @returns {string|null} canonical display name for SQL ILIKE, or null
 */
function resolveCitySlugToLabel(citySlug, cityNames) {
  const want = String(citySlug || "").trim().toLowerCase();
  if (!want || !/^[a-z0-9-]+$/.test(want)) return null;
  const seen = new Set();
  for (const raw of cityNames) {
    const n = String(raw || "").trim();
    if (!n) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    if (slugifySegment(n) === want) return n;
  }
  return null;
}

/**
 * Join tenant URL prefix (path or absolute) with a path segment.
 * @param {string} tenantUrlPrefix
 * @param {string} path — e.g. /services/plumber/lusaka
 */
function hrefWithTenantPrefix(tenantUrlPrefix, path) {
  const p = path.startsWith("/") ? path : `/${path}`;
  const pref = tenantUrlPrefix != null ? String(tenantUrlPrefix).trim() : "";
  if (!pref) return p;
  if (pref.startsWith("http")) return `${pref.replace(/\/$/, "")}${p}`;
  return `${pref.replace(/\/$/, "")}${p}`;
}

/**
 * A few internal links for homepage/footer (category slugs that exist + explore cities from DB).
 * @param {{ slug: string, name: string }[]} categories
 * @param {string} tenantUrlPrefix
 * @param {string[]} exploreCityNames — typically 1–2 enabled cities from `tenant_cities`
 */
function buildServicesExploreLinks(categories, tenantUrlPrefix, exploreCityNames) {
  const prefs = ["electrician", "plumber", "plumbers", "hvac-technician", "painter"];
  const cities = Array.isArray(exploreCityNames) ? exploreCityNames.filter(Boolean).slice(0, 2) : [];
  if (!cities.length) return [];
  const cats = categories || [];
  const out = [];
  for (const slug of prefs) {
    const c = cats.find((x) => x && x.slug === slug);
    if (!c) continue;
    for (const city of cities) {
      const seg = slugifySegment(city);
      const path = `/services/${encodeURIComponent(c.slug)}/${encodeURIComponent(seg)}`;
      out.push({
        href: hrefWithTenantPrefix(tenantUrlPrefix, path),
        label: `${c.name} in ${city}`,
      });
      if (out.length >= 4) return out;
    }
  }
  return out;
}

module.exports = {
  slugifySegment,
  resolveCitySlugToLabel,
  mergeCityNamesForLanding,
  hrefWithTenantPrefix,
  buildServicesExploreLinks,
};
