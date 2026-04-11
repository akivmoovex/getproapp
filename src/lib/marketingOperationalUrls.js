"use strict";

const { getClientCountryCode } = require("../platform/host");
const { israelComingSoonEnabled } = require("../tenants/israelComingSoon");

/**
 * When the marketing apex (global tenant on www / naked BASE_DOMAIN) serves the homepage,
 * operational directory/login/join flows should target the default regional host (zm.* by default).
 * Centralizes pronline.org → zm.proline.org-style behavior without scattering string literals.
 *
 * @see src/tenants/index.js setApexTenantPg (global + isApexHost)
 */

const DEFAULT_OPS_SLUG = (process.env.GETPRO_MARKETING_OPERATIONS_SLUG || "zm").trim().toLowerCase();

/**
 * Regional subdomain for marketing-apex links when the request is still on the global tenant
 * (e.g. visitor country is IL but Israel is in coming-soon mode so tenant stays global).
 * Uses CF-IPCountry / x-country-code / GETPRO_FORCE_CLIENT_COUNTRY (see getClientCountryCode).
 *
 * IL + ISRAEL_COMING_SOON: never return "il" here — send users to DEFAULT_OPS_SLUG (typically zm.*)
 * so homepage CTAs do not deep-link to il.* while Israel is intentionally gated (see coming_soon_il).
 */
function marketingApexOpsSlugFromRequest(req) {
  const cc = getClientCountryCode(req);
  if (cc === "ZM") return "zm";
  if (cc === "IL") {
    if (israelComingSoonEnabled()) return DEFAULT_OPS_SLUG;
    return "il";
  }
  return DEFAULT_OPS_SLUG;
}

/** Absolute ZM join URL for embed modal (same host as operational hub). */
function zmJoinEmbedAbsoluteUrl() {
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
  return base ? `${scheme}://zm.${base}/join?embed=1` : "/join?embed=1";
}

/**
 * Homepage-only geo CTA URLs on marketing apex (getproapp.org / pronline.org with global tenant).
 * Do not use for non-home routes — shared partials fall back to opsHref when homepageOpsHref is absent.
 * Delegates to {@link operationalHref} when not global-on-apex (zm.* / il.* / geo-resolved tenant).
 */
function homepageOperationalHref(req, pathAndQuery) {
  const raw = String(pathAndQuery || "/");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
  if (!base || !req.isApexHost || !req.tenant || req.tenant.slug !== "global") {
    return operationalHref(req, pathAndQuery);
  }
  const slug = marketingApexOpsSlugFromRequest(req);
  return `${scheme}://${slug}.${base}${path}`;
}

/**
 * @param {import('express').Request} req
 * @param {string} pathAndQuery path starting with /, optional ?query
 * @returns {string} absolute https://zm.BASE/... on marketing apex, else path-prefix or relative URL
 */
function operationalHref(req, pathAndQuery) {
  const raw = String(pathAndQuery || "/");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();

  if (base && req.isApexHost && req.tenant && req.tenant.slug === "global") {
    return `${scheme}://${DEFAULT_OPS_SLUG}.${base}${path}`;
  }

  const prefix = req.tenantUrlPrefix != null ? String(req.tenantUrlPrefix) : "";
  if (prefix.startsWith("http")) {
    return `${prefix.replace(/\/$/, "")}${path}`;
  }
  if (prefix === "") {
    return path;
  }
  const p = prefix.replace(/\/$/, "");
  return `${p}${path}`;
}

/**
 * Express middleware: attach `res.locals.opsHref(path)` for EJS.
 */
function opsHrefMiddleware(req, res, next) {
  res.locals.opsHref = (p) => operationalHref(req, p);
  next();
}

/**
 * Marketing apex bookmarked `/login` should land on the regional hub (same cookie domain as staff portals).
 * @param {import('express').Request} req
 * @returns {string|null} redirect target or null
 */
function marketingApexLoginRedirectTarget(req) {
  const base = (process.env.BASE_DOMAIN || "").trim().toLowerCase();
  if (!base || !req.tenant || !req.isApexHost || req.tenant.slug !== "global") {
    return null;
  }
  const scheme = process.env.PUBLIC_SCHEME || "https";
  const q = req.url.includes("?") ? `?${req.url.split("?").slice(1).join("?")}` : "";
  return `${scheme}://${DEFAULT_OPS_SLUG}.${base}/login${q}`;
}

module.exports = {
  operationalHref,
  homepageOperationalHref,
  marketingApexOpsSlugFromRequest,
  zmJoinEmbedAbsoluteUrl,
  opsHrefMiddleware,
  marketingApexLoginRedirectTarget,
  DEFAULT_OPS_SLUG,
};
