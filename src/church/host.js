"use strict";

const { resolveHostname } = require("../platform/host");
const {
  DEFAULT_CANONICAL_DOMAIN,
  getChurchHostDomain: getChurchHostDomainFromEnv,
  isBlessBoardApexDomain,
  normalizeHost: normalizeApexHost,
} = require("./blessBoardEnv");

/** Vertical subdomain label — reserved; never a company marketing subdomain. */
const CHURCH_VERTICAL_LABEL = "church";

/** Dedicated church marketing / branch host domain (e.g. blessboard.com). Override via CHURCH_HOST_DOMAIN. */
const DEFAULT_CHURCH_HOST_DOMAIN = DEFAULT_CANONICAL_DOMAIN;

/**
 * Normalize a hostname string (strip port, lowercase).
 * @param {string} host
 */
function normalizeHost(host) {
  return normalizeApexHost(host);
}

/**
 * Resolve the public hostname for an Express request (proxy-aware).
 * @param {import("express").Request} req
 */
function normalizeHostFromRequest(req) {
  return resolveHostname(req);
}

function getChurchHostDomain() {
  return getChurchHostDomainFromEnv();
}

/**
 * True for BlessBoard apex aliases (.com / .org / www) and any *.{canonical} tenant host.
 * Does not treat arbitrary *.blessboard.org labels as product hosts.
 * @param {string} host
 */
function isBlessBoardHost(host) {
  const cleanHost = normalizeHost(host);
  if (!cleanHost) return false;
  if (isBlessBoardApexDomain(cleanHost)) return true;

  const churchDomain = getChurchHostDomain();
  if (!churchDomain) return false;
  return cleanHost.endsWith(`.${churchDomain}`);
}

/**
 * Extract the church branch slug from a BlessBoard host.
 * Returns null for apex/www hosts or invalid multi-label subdomains.
 * Only resolves tenants under the canonical domain (e.g. *.blessboard.com).
 * @param {string} host
 * @returns {string | null}
 */
function getBlessBoardChurchSlug(host) {
  const cleanHost = normalizeHost(host);
  const churchDomain = getChurchHostDomain();
  if (!cleanHost || !churchDomain) return null;
  if (isBlessBoardApexDomain(cleanHost)) return null;
  if (!cleanHost.endsWith(`.${churchDomain}`)) return null;

  const prefix = cleanHost.slice(0, cleanHost.length - churchDomain.length - 1);
  const labels = prefix.split(".").filter(Boolean);
  if (labels.length !== 1) return null;

  const slug = labels[0];
  if (!slug || slug === "www") return null;
  return slug;
}

/**
 * True when the hostname should serve the BlessBoard church module (not the main platform site).
 * @param {string} host - Host header or hostname (port optional).
 */
function isChurchHost(host) {
  const cleanHost = normalizeHost(host);
  if (!cleanHost || cleanHost === "localhost" || cleanHost === "127.0.0.1") return false;

  if (isBlessBoardHost(cleanHost)) return true;

  const base = String(process.env.BASE_DOMAIN || "")
    .toLowerCase()
    .trim();
  if (base && parseChurchHostFromParts(cleanHost, base)) return true;

  return false;
}

/**
 * Parse host relative to BASE_DOMAIN into a church context descriptor.
 * @param {string} host - Lowercase hostname without port.
 * @param {string} baseDomain - Lowercase BASE_DOMAIN (no scheme).
 * @returns {{ kind: 'vertical-apex', host: string } | { kind: 'branch', orgSlug: string | null, hostSlug?: string | null, host: string } | null}
 */
function parseChurchHostFromParts(host, baseDomain) {
  const h = normalizeHost(host);
  const base = String(baseDomain || "")
    .toLowerCase()
    .trim();
  if (!h || !base || h === "localhost" || h === "127.0.0.1") return null;
  if (h !== base && !h.endsWith(`.${base}`)) return null;

  let prefix = h === base ? "" : h.slice(0, h.length - base.length);
  if (prefix.endsWith(".")) prefix = prefix.slice(0, -1);
  if (!prefix) return null;

  const labels = prefix.split(".").filter(Boolean);
  if (labels.length === 1 && labels[0] === CHURCH_VERTICAL_LABEL) {
    return { kind: "vertical-apex", host: h };
  }
  if (labels.length === 2 && labels[1] === CHURCH_VERTICAL_LABEL) {
    const orgSlug = labels[0];
    if (!orgSlug || orgSlug === "www") return null;
    return { kind: "branch", orgSlug, hostSlug: orgSlug, host: h };
  }
  return null;
}

/**
 * Parse dedicated BlessBoard host domain (apex aliases + *.blessboard.com tenants).
 * @param {string} host
 * @returns {{ kind: 'vertical-apex', host: string } | { kind: 'branch', orgSlug: string | null, hostSlug: string | null, host: string } | null}
 */
function parseChurchHostFromDedicatedDomain(host) {
  const h = normalizeHost(host);
  if (!isBlessBoardHost(h)) return null;

  if (isBlessBoardApexDomain(h)) {
    return { kind: "vertical-apex", host: h };
  }

  const churchDomain = getChurchHostDomain();
  if (h.endsWith(`.${churchDomain}`)) {
    const slug = getBlessBoardChurchSlug(h);
    return { kind: "branch", orgSlug: slug, hostSlug: slug, host: h };
  }

  return null;
}

/**
 * @param {import("express").Request} req
 * @returns {{ kind: 'vertical-apex', host: string } | { kind: 'branch', orgSlug: string | null, hostSlug?: string | null, host: string } | null}
 */
function parseChurchHost(req) {
  const host = normalizeHostFromRequest(req);
  if (!isChurchHost(host)) return null;

  const base = (process.env.BASE_DOMAIN || "").toLowerCase().trim();
  if (base) {
    const onBase = parseChurchHostFromParts(host, base);
    if (onBase) return onBase;
  }

  return parseChurchHostFromDedicatedDomain(host);
}

/**
 * True when the first subdomain label is the church vertical (e.g. church.example.org).
 * @param {string | null | undefined} subdomain
 * @param {import("express").Request} [req]
 */
function isChurchVerticalSubdomain(subdomain, req) {
  if (subdomain === CHURCH_VERTICAL_LABEL) return true;
  if (req) {
    const parsed = parseChurchHost(req);
    return parsed != null;
  }
  return false;
}

module.exports = {
  CHURCH_VERTICAL_LABEL,
  DEFAULT_CHURCH_HOST_DOMAIN,
  getChurchHostDomain,
  normalizeHost,
  normalizeHostFromRequest,
  isBlessBoardHost,
  getBlessBoardChurchSlug,
  isChurchHost,
  parseChurchHost,
  parseChurchHostFromParts,
  parseChurchHostFromDedicatedDomain,
  isChurchVerticalSubdomain,
};
