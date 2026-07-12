"use strict";

const { isBlessBoardHost, getChurchHostDomain, normalizeHostFromRequest } = require("./host");

function requestScheme(req) {
  const forwarded = req.headers["x-forwarded-proto"];
  if (forwarded) return String(forwarded).split(",")[0].trim().toLowerCase();
  return String(req.protocol || "http").toLowerCase();
}

function shouldForceHttps(req, host) {
  if (!host || host === "localhost" || host === "127.0.0.1") return false;
  if (process.env.BLESSBOARD_FORCE_HTTPS === "0") return false;
  return true;
}

/**
 * Permanent redirects for BlessBoard product hosts:
 * - www.blessboard.com → blessboard.com (apex only)
 * - http → https (all blessboard.com hosts, including tenant subdomains)
 *
 * Preserves path and query via req.originalUrl.
 * Skip when BLESSBOARD_CANONICAL_REDIRECT=0 (local dev/tests).
 */
function blessboardCanonicalRedirect(req, res, next) {
  if (process.env.BLESSBOARD_CANONICAL_REDIRECT === "0") {
    return next();
  }

  const host = normalizeHostFromRequest(req);
  if (!isBlessBoardHost(host)) {
    return next();
  }

  const apexDomain = getChurchHostDomain();
  const scheme = requestScheme(req);
  const needsWwwStrip = host === `www.${apexDomain}`;
  const needsHttps = shouldForceHttps(req, host) && scheme !== "https";

  if (!needsWwwStrip && !needsHttps) {
    return next();
  }

  const targetHost = needsWwwStrip ? apexDomain : host;
  const targetUrl = `https://${targetHost}${req.originalUrl || "/"}`;
  return res.redirect(301, targetUrl);
}

module.exports = {
  blessboardCanonicalRedirect,
  shouldForceHttps,
  requestScheme,
};
