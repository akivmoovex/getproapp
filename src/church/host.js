"use strict";

const { resolveHostname } = require("../platform/host");

/** Vertical subdomain label — reserved; never a company marketing subdomain. */
const CHURCH_VERTICAL_LABEL = "church";

/**
 * Parse host relative to BASE_DOMAIN into a church context descriptor.
 * @param {string} host - Lowercase hostname without port.
 * @param {string} baseDomain - Lowercase BASE_DOMAIN (no scheme).
 * @returns {{ kind: 'vertical-apex', host: string } | { kind: 'branch', orgSlug: string, host: string } | null}
 */
function parseChurchHostFromParts(host, baseDomain) {
  const h = String(host || "")
    .toLowerCase()
    .trim()
    .split(":")[0];
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
 * @param {import("express").Request} req
 * @returns {{ kind: 'vertical-apex', host: string } | { kind: 'branch', orgSlug: string, host: string } | null}
 */
function parseChurchHost(req) {
  const base = (process.env.BASE_DOMAIN || "").toLowerCase().trim();
  if (!base) return null;
  const host = resolveHostname(req);
  return parseChurchHostFromParts(host, base);
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
  parseChurchHost,
  parseChurchHostFromParts,
  isChurchVerticalSubdomain,
};
