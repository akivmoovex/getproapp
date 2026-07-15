"use strict";

/**
 * BlessBoard public apex hosts (marketing + platform admin).
 * Tenant church sites remain under CHURCH_HOST_DOMAIN only (*.blessboard.com).
 *
 * Override via BLESSBOARD_APEX_DOMAINS (comma-separated). Canonical public host
 * remains CHURCH_HOST_DOMAIN / BLESSBOARD_CANONICAL_DOMAIN (default blessboard.com).
 */

const DEFAULT_CANONICAL_DOMAIN = "blessboard.com";

const DEFAULT_APEX_DOMAINS = [
  "blessboard.com",
  "www.blessboard.com",
  "blessboard.org",
  "www.blessboard.org",
];

function normalizeHost(host) {
  return String(host || "")
    .toLowerCase()
    .trim()
    .split(":")[0];
}

/**
 * Canonical BlessBoard public domain (no www). Used for SEO redirects and tenant base.
 */
function getBlessBoardCanonicalDomain() {
  const fromEnv = String(
    process.env.BLESSBOARD_CANONICAL_DOMAIN || process.env.CHURCH_HOST_DOMAIN || ""
  )
    .toLowerCase()
    .trim();
  return fromEnv || DEFAULT_CANONICAL_DOMAIN;
}

/**
 * @returns {string[]}
 */
function parseApexDomainsFromEnv() {
  const raw = String(process.env.BLESSBOARD_APEX_DOMAINS || "").trim();
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((part) => normalizeHost(part))
    .filter(Boolean);
  return list.length ? list : null;
}

/**
 * Apex hosts that serve BlessBoard platform marketing/admin (not tenants).
 * Always includes the canonical domain and www.{canonical}.
 * @returns {Set<string>}
 */
function getBlessBoardApexDomainSet() {
  const canonical = getBlessBoardCanonicalDomain();
  const fromEnv = parseApexDomainsFromEnv();
  const list = fromEnv && fromEnv.length ? fromEnv.slice() : DEFAULT_APEX_DOMAINS.slice();
  if (!list.includes(canonical)) list.push(canonical);
  const wwwCanonical = `www.${canonical}`;
  if (!list.includes(wwwCanonical)) list.push(wwwCanonical);
  return new Set(list.map(normalizeHost).filter(Boolean));
}

/**
 * True for configured BlessBoard apex hosts (e.g. blessboard.com, www., .org).
 * Does not treat arbitrary *.blessboard.org labels as apex or tenant.
 * @param {string} host
 */
function isBlessBoardApexDomain(host) {
  const clean = normalizeHost(host);
  if (!clean) return false;
  return getBlessBoardApexDomainSet().has(clean);
}

module.exports = {
  DEFAULT_CANONICAL_DOMAIN,
  DEFAULT_APEX_DOMAINS,
  normalizeHost,
  getBlessBoardCanonicalDomain,
  getBlessBoardApexDomainSet,
  isBlessBoardApexDomain,
};
