"use strict";

const { isBlessBoardHost, normalizeHostFromRequest } = require("./host");
const {
  getBlessBoardCanonicalDomain,
  isBlessBoardApexDomain,
} = require("./blessBoardApexDomains");

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
 * - Non-canonical apex aliases (www.blessboard.com, blessboard.org, www.blessboard.org)
 *   → https://blessboard.com (canonical) with path and query preserved
 * - http → https (all BlessBoard hosts, including tenant subdomains)
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

  const canonicalDomain = getBlessBoardCanonicalDomain();
  const scheme = requestScheme(req);
  const needsCanonicalHost = isBlessBoardApexDomain(host) && host !== canonicalDomain;
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
};
