"use strict";

/**
 * Safe request hostname resolution behind Hostinger / reverse proxies.
 *
 * Trust assumptions (do not broaden without Hostinger topology review):
 * - Express `trust proxy` is a hop **number** (typically 1), never unrestricted `true`
 *   on deployed profiles.
 * - When trust proxy is enabled, the **first** `X-Forwarded-Host` hop is used
 *   (same as existing `src/platform/host.js#resolveHostname`).
 * - Forged additional XFH hops beyond the trusted count must not select products
 *   (Express trust-proxy hop semantics + exact allowlist afterward).
 * - Final product selection always goes through the exact canonical host allowlist.
 */

const { resolveHostname } = require("../host");
const {
  normalizeCanonicalHostname,
  resolveCanonicalHost,
} = require("../config/canonicalHostRegistry");

/**
 * Resolve the public hostname for this request using existing proxy rules,
 * then normalize for allowlist lookup.
 *
 * @param {import('express').Request} req
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   allowTestHostOverride?: boolean,
 * }} [opts]
 * @returns {{ ok: true, hostname: string, source: string } | { ok: false, code: string, message: string }}
 */
function resolveRequestHostname(req, opts = {}) {
  const env = opts.env || process.env;
  const nodeEnv = String(env.NODE_ENV || "")
    .trim()
    .toLowerCase();

  // Controlled test/dev override — never for NODE_ENV=production deployments.
  if (opts.allowTestHostOverride !== false && nodeEnv !== "production") {
    const override = String(env.PLATFORM_TEST_HOST || "")
      .trim()
      .toLowerCase();
    if (override) {
      const normalized = normalizeCanonicalHostname(override);
      if (!normalized.ok) return normalized;
      return { ok: true, hostname: normalized.hostname, source: "PLATFORM_TEST_HOST" };
    }
  }

  const raw = resolveHostname(req);
  const normalized = normalizeCanonicalHostname(raw);
  if (!normalized.ok) return normalized;
  return { ok: true, hostname: normalized.hostname, source: "request" };
}

/**
 * Resolve request hostname and map to canonical site (exact allowlist).
 * @param {import('express').Request} req
 * @param {object} [opts]
 */
function resolveRequestCanonicalSite(req, opts) {
  const hostResult = resolveRequestHostname(req, opts);
  if (!hostResult.ok) return hostResult;
  const siteResult = resolveCanonicalHost(hostResult.hostname);
  if (!siteResult.ok) return siteResult;
  return {
    ok: true,
    hostname: hostResult.hostname,
    source: hostResult.source,
    site: siteResult.site,
  };
}

module.exports = {
  resolveRequestHostname,
  resolveRequestCanonicalSite,
};
