"use strict";

const { resolveHostname } = require("../platform/host");

/** Vertical subdomain label — reserved; never a company marketing subdomain. */
const CHURCH_VERTICAL_LABEL = "church";

/** Dedicated church marketing / branch host domain (e.g. blessboard.com). Override via CHURCH_HOST_DOMAIN. */
const DEFAULT_CHURCH_HOST_DOMAIN = "blessboard.com";

function normalizeHost(host) {
  return String(host || "")
    .toLowerCase()
    .trim()
    .split(":")[0];
}

function getChurchHostDomain() {
  return String(process.env.CHURCH_HOST_DOMAIN || DEFAULT_CHURCH_HOST_DOMAIN)
    .toLowerCase()
    .trim();
}

/**
 * True when the hostname should serve the GetPro Church module (not the main platform site).
 * @param {string} host - Host header or hostname (port optional).
 */
function isChurchHost(host) {
  const cleanHost = normalizeHost(host);
  if (!cleanHost || cleanHost === "localhost" || cleanHost === "127.0.0.1") return false;

  const base = String(process.env.BASE_DOMAIN || "")
    .toLowerCase()
    .trim();
  if (base && parseChurchHostFromParts(cleanHost, base)) return true;

  const churchDomain = getChurchHostDomain();
  if (!churchDomain) return false;

  return (
    cleanHost === churchDomain ||
    cleanHost === `www.${churchDomain}` ||
    cleanHost.endsWith(`.${churchDomain}`)
  );
}

/**
 * Parse host relative to BASE_DOMAIN into a church context descriptor.
 * @param {string} host - Lowercase hostname without port.
 * @param {string} baseDomain - Lowercase BASE_DOMAIN (no scheme).
 * @returns {{ kind: 'vertical-apex', host: string } | { kind: 'branch', orgSlug: string, host: string } | null}
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
    return { kind: "branch", orgSlug, host: h };
  }
  return null;
}

/**
 * Parse dedicated church host domain (blessboard.com and *.blessboard.com).
 * @param {string} host
 * @returns {{ kind: 'vertical-apex', host: string } | { kind: 'branch', orgSlug: string, host: string } | null}
 */
function parseChurchHostFromDedicatedDomain(host) {
  const h = normalizeHost(host);
  const churchDomain = getChurchHostDomain();
  if (!h || !churchDomain) return null;

  if (h === churchDomain || h === `www.${churchDomain}`) {
    return { kind: "vertical-apex", host: h };
  }

  if (!h.endsWith(`.${churchDomain}`)) return null;

  const prefix = h.slice(0, h.length - churchDomain.length - 1);
  const labels = prefix.split(".").filter(Boolean);
  if (labels.length !== 1) return null;

  const orgSlug = labels[0];
  if (!orgSlug || orgSlug === "www") return null;
  return { kind: "branch", orgSlug, host: h };
}

/**
 * @param {import("express").Request} req
 * @returns {{ kind: 'vertical-apex', host: string } | { kind: 'branch', orgSlug: string, host: string } | null}
 */
function parseChurchHost(req) {
  const host = resolveHostname(req);
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
  isChurchHost,
  parseChurchHost,
  parseChurchHostFromParts,
  parseChurchHostFromDedicatedDomain,
  isChurchVerticalSubdomain,
};
