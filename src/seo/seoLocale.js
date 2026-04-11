"use strict";

const { canonicalUrlForTenant } = require("../content/contentPages");

/**
 * SEO language for meta/titles only (en | he). Does not change UI copy.
 * Priority: ?lang= → tenant.defaultLocale → en
 *
 * @param {import('express').Request} req
 * @returns {'en' | 'he'}
 */
function getSeoLocale(req) {
  const raw = req.query && req.query.lang != null ? String(req.query.lang).trim().toLowerCase() : "";
  if (raw === "he" || raw === "iw") return "he";
  if (raw === "en") return "en";
  const t = req.tenant;
  const loc = t && t.defaultLocale ? String(t.defaultLocale).toLowerCase() : "";
  if (loc.startsWith("he")) return "he";
  return "en";
}

/**
 * hreflang alternates: same path with ?lang=en | ?lang=he (minimal URL strategy).
 * x-default → English.
 *
 * @param {import('express').Request} req
 * @param {string} pathname — req.path (e.g. /directory)
 */
function buildHreflangAlternates(req, pathname) {
  const p = pathname && pathname.startsWith("/") ? pathname : `/${pathname || ""}`;
  const base = canonicalUrlForTenant(req, p);
  if (!base) return [];
  const sep = base.includes("?") ? "&" : "?";
  const enUrl = `${base}${sep}lang=en`;
  const heUrl = `${base}${sep}lang=he`;
  return [
    { hreflang: "en", href: enUrl },
    { hreflang: "he", href: heUrl },
    { hreflang: "x-default", href: enUrl },
  ];
}

/**
 * Localized country/region label for SEO strings (EN or HE script).
 * @param {string} cc — ISO 3166-1 alpha-2
 * @param {'en' | 'he'} locale
 */
function regionLabelForSeo(cc, locale) {
  const c = String(cc || "").trim().toUpperCase();
  if (!c || c === "XX" || !/^[A-Z]{2}$/.test(c)) return "";
  const loc = locale === "he" ? "he" : "en";
  try {
    return new Intl.DisplayNames([loc], { type: "region" }).of(c);
  } catch {
    return "";
  }
}

module.exports = { getSeoLocale, buildHreflangAlternates, regionLabelForSeo };
