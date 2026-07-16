"use strict";

const { isBlessBoardHost, normalizeHostFromRequest } = require("./host");
const {
  getBlessBoardCanonicalDomain,
  isBlessBoardApexDomain,
  isCanonicalHostRedirectEnabled,
  isBlessBoardForceHttpsEnabled,
} = require("./blessBoardEnv");

function requestScheme(req) {
  const forwarded = req.headers["x-forwarded-proto"];
  if (forwarded) return String(forwarded).split(",")[0].trim().toLowerCase();
  return String(req.protocol || "http").toLowerCase();
}

function shouldForceHttps(req, host) {
  if (!host || host === "localhost" || host === "127.0.0.1") return false;
  if (!isBlessBoardForceHttpsEnabled()) return false;
  return true;
}

/**
 * Permanent redirects for BlessBoard product hosts:
 * - Non-canonical apex aliases → https://{canonical} (path + query preserved)
 * - http → https (all BlessBoard hosts, including tenant subdomains)
 *
 * V4 default (unset env): blessboard.org is an apex alias of blessboard.com.
 * V5 (BLESSBOARD_CANONICAL_DOMAIN=blessboard.org and/or BLESSBOARD_APEX_DOMAINS listing
 * only .org hosts): blessboard.org stays on blessboard.org; www → blessboard.org.
 *
 * BLESSBOARD_CANONICAL_REDIRECT=0|false disables host remapping only (not HTTPS).
 */
function blessboardCanonicalRedirect(req, res, next) {
  const host = normalizeHostFromRequest(req);
  if (!isBlessBoardHost(host)) {
    return next();
  }

  const canonicalDomain = getBlessBoardCanonicalDomain();
  const scheme = requestScheme(req);
  const needsCanonicalHost =
    isCanonicalHostRedirectEnabled() && isBlessBoardApexDomain(host) && host !== canonicalDomain;
  const needsHttps = shouldForceHttps(req, host) && scheme !== "https";

  if (!needsCanonicalHost && !needsHttps) {
    return next();
  }

  const targetHost = needsCanonicalHost ? canonicalDomain : host;
  const targetUrl = `https://${targetHost}${req.originalUrl || "/"}`;
  return res.redirect(301, targetUrl);
}

module.exports = {
  blessboardCanonicalRedirect,
  shouldForceHttps,
  requestScheme,
  isCanonicalHostRedirectEnabled,
};
