"use strict";

const { normalizeHostFromRequest } = require("./host");

/**
 * Public scheme for BlessBoard canonical URLs (always https off localhost).
 * @param {import("express").Request} [req]
 */
function blessboardPublicScheme(req) {
  const host = req ? normalizeHostFromRequest(req) : "";
  if (host === "localhost" || host === "127.0.0.1") {
    if (req && req.protocol) return req.protocol;
    return process.env.PUBLIC_SCHEME || "http";
  }
  return "https";
}

/**
 * Absolute URL on the request host (tenant subdomain or blessboard.com apex).
 * Used for tenant self-referencing canonicals — never points tenants at blessboard.com.
 * @param {import("express").Request} req
 * @param {string} [pathname]
 */
function blessboardAbsoluteUrlForRequest(req, pathname = "/") {
  const host = normalizeHostFromRequest(req);
  if (!host) return "";
  const scheme = blessboardPublicScheme(req);
  const path = String(pathname || "/");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  if (suffix === "/") return `${scheme}://${host}/`;
  return `${scheme}://${host}${suffix}`;
}

/**
 * Resolve a tenant-relative or absolute asset URL to an absolute https URL on the request host.
 * @param {import("express").Request} req
 * @param {string} [assetUrl]
 */
function blessboardAbsoluteAssetUrl(req, assetUrl) {
  const raw = String(assetUrl || "").trim();
  if (!raw) return "";
  if (/^https:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return blessboardAbsoluteUrlForRequest(req, raw);
  }
  return "";
}

module.exports = {
  blessboardPublicScheme,
  blessboardAbsoluteUrlForRequest,
  blessboardAbsoluteAssetUrl,
};
