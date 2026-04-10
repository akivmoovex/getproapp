"use strict";

/**
 * When the marketing apex (global tenant on www / naked BASE_DOMAIN) serves the homepage,
 * operational directory/login/join flows should target the default regional host (zm.* by default).
 * Centralizes pronline.org → zm.proline.org-style behavior without scattering string literals.
 *
 * @see src/tenants/index.js setApexTenantPg (global + isApexHost)
 */

const DEFAULT_OPS_SLUG = (process.env.GETPRO_MARKETING_OPERATIONS_SLUG || "zm").trim().toLowerCase();

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
  opsHrefMiddleware,
  marketingApexLoginRedirectTarget,
  DEFAULT_OPS_SLUG,
};
