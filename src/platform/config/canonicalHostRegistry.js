"use strict";

/**
 * Canonical hostname → product/site allowlist (exact match only).
 * Product selection authority for moovex-platform-* runtimes.
 * Do not use substring matching. Do not invent hosts dynamically.
 */

const CANONICAL_PLATFORM_IDENTITY_KEY = "moovex-platform-v7";

/**
 * @typedef {Readonly<{
 *   hostname: string,
 *   productKey: string|null,
 *   environment: "testing"|"production",
 *   brand: string,
 *   siteType: "product"|"corporate"|"legacy-redirect"|"platform",
 *   sessionCookieName: string,
 *   csrfCookieName: string,
 *   redirectTargetOrigin: string|null,
 *   status: "canonical"|"legacy"|"prepared",
 * }>} CanonicalHostSite
 */

/** @type {Readonly<Record<string, CanonicalHostSite>>} */
const CANONICAL_HOST_REGISTRY = Object.freeze({
  "pronline.org": Object.freeze({
    hostname: "pronline.org",
    productKey: null,
    environment: "testing",
    brand: "Moovex Platform QA",
    siteType: "platform",
    sessionCookieName: "moovex_pronline_hub_sid",
    csrfCookieName: "moovex_pronline_hub_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "www.pronline.org": Object.freeze({
    hostname: "www.pronline.org",
    productKey: null,
    environment: "testing",
    brand: "Moovex Platform QA",
    siteType: "platform",
    sessionCookieName: "moovex_pronline_hub_sid",
    csrfCookieName: "moovex_pronline_hub_csrf",
    redirectTargetOrigin: "https://pronline.org",
    status: "canonical",
  }),
  "blessboard.com": Object.freeze({
    hostname: "blessboard.com",
    productKey: "blessboard",
    environment: "production",
    brand: "BlessBoard",
    siteType: "product",
    sessionCookieName: "blessboard_com_sid",
    csrfCookieName: "blessboard_org_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "www.blessboard.com": Object.freeze({
    hostname: "www.blessboard.com",
    productKey: "blessboard",
    environment: "production",
    brand: "BlessBoard",
    siteType: "product",
    sessionCookieName: "blessboard_com_sid",
    csrfCookieName: "blessboard_org_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "blessboard.pronline.org": Object.freeze({
    hostname: "blessboard.pronline.org",
    productKey: "blessboard",
    environment: "testing",
    brand: "BlessBoard",
    siteType: "product",
    sessionCookieName: "blessboard_pronline_sid",
    csrfCookieName: "blessboard_pronline_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "activeclinic.org": Object.freeze({
    hostname: "activeclinic.org",
    productKey: "activeclinic",
    environment: "production",
    brand: "ActiveClinic",
    siteType: "product",
    sessionCookieName: "activeclinic_org_prod_sid",
    csrfCookieName: "activeclinic_org_prod_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "www.activeclinic.org": Object.freeze({
    hostname: "www.activeclinic.org",
    productKey: "activeclinic",
    environment: "production",
    brand: "ActiveClinic",
    siteType: "product",
    sessionCookieName: "activeclinic_org_prod_sid",
    csrfCookieName: "activeclinic_org_prod_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "activeclinic.pronline.org": Object.freeze({
    hostname: "activeclinic.pronline.org",
    productKey: "activeclinic",
    environment: "testing",
    brand: "ActiveClinic",
    siteType: "product",
    sessionCookieName: "activeclinic_pronline_sid",
    csrfCookieName: "activeclinic_pronline_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "getproapp.org": Object.freeze({
    hostname: "getproapp.org",
    productKey: "getpro",
    environment: "production",
    brand: "GetPro",
    siteType: "product",
    sessionCookieName: "getproapp_org_sid",
    csrfCookieName: "getproapp_org_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "www.getproapp.org": Object.freeze({
    hostname: "www.getproapp.org",
    productKey: "getpro",
    environment: "production",
    brand: "GetPro",
    siteType: "product",
    sessionCookieName: "getproapp_org_sid",
    csrfCookieName: "getproapp_org_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  /** Canonical GetPro testing hostname. */
  "getproapp.pronline.org": Object.freeze({
    hostname: "getproapp.pronline.org",
    productKey: "getpro",
    environment: "testing",
    brand: "GetPro",
    siteType: "product",
    sessionCookieName: "getproapp_pronline_sid",
    csrfCookieName: "getproapp_pronline_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  /**
   * Compatibility alias → getproapp.pronline.org (temporary; not canonical).
   * Runtime issues a 301 when redirectTargetOrigin is set on a product host.
   */
  "getpro.pronline.org": Object.freeze({
    hostname: "getpro.pronline.org",
    productKey: "getpro",
    environment: "testing",
    brand: "GetPro",
    siteType: "product",
    sessionCookieName: "getpro_pronline_sid",
    csrfCookieName: "getpro_pronline_csrf",
    redirectTargetOrigin: "https://getproapp.pronline.org",
    status: "legacy",
  }),
  "netraz.org": Object.freeze({
    hostname: "netraz.org",
    productKey: "ngo",
    environment: "production",
    brand: "Netraz",
    siteType: "product",
    sessionCookieName: "netraz_org_sid",
    csrfCookieName: "netraz_org_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "www.netraz.org": Object.freeze({
    hostname: "www.netraz.org",
    productKey: "ngo",
    environment: "production",
    brand: "Netraz",
    siteType: "product",
    sessionCookieName: "netraz_org_sid",
    csrfCookieName: "netraz_org_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "netraz.pronline.org": Object.freeze({
    hostname: "netraz.pronline.org",
    productKey: "ngo",
    environment: "testing",
    brand: "Netraz",
    siteType: "product",
    sessionCookieName: "netraz_pronline_sid",
    csrfCookieName: "netraz_pronline_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "moovex.org": Object.freeze({
    hostname: "moovex.org",
    productKey: null,
    environment: "production",
    brand: "Moovex",
    siteType: "corporate",
    sessionCookieName: "moovex_org_sid",
    csrfCookieName: "moovex_org_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "www.moovex.org": Object.freeze({
    hostname: "www.moovex.org",
    productKey: null,
    environment: "production",
    brand: "Moovex",
    siteType: "corporate",
    sessionCookieName: "moovex_org_sid",
    csrfCookieName: "moovex_org_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  "moovex.pronline.org": Object.freeze({
    hostname: "moovex.pronline.org",
    productKey: null,
    environment: "testing",
    brand: "Moovex",
    siteType: "corporate",
    sessionCookieName: "moovex_pronline_sid",
    csrfCookieName: "moovex_pronline_csrf",
    redirectTargetOrigin: null,
    status: "canonical",
  }),
  /** Prepared legacy redirect — not activated on Hostinger yet. */
  "blessboard.org": Object.freeze({
    hostname: "blessboard.org",
    productKey: "blessboard",
    environment: "production",
    brand: "BlessBoard",
    siteType: "legacy-redirect",
    sessionCookieName: "blessboard_org_redirect_sid",
    csrfCookieName: "blessboard_org_redirect_csrf",
    redirectTargetOrigin: "https://blessboard.com",
    status: "prepared",
  }),
  "www.blessboard.org": Object.freeze({
    hostname: "www.blessboard.org",
    productKey: "blessboard",
    environment: "production",
    brand: "BlessBoard",
    siteType: "legacy-redirect",
    sessionCookieName: "blessboard_org_redirect_sid",
    csrfCookieName: "blessboard_org_redirect_csrf",
    redirectTargetOrigin: "https://blessboard.com",
    status: "prepared",
  }),
});

/**
 * Normalize raw host for allowlist lookup (lowercase, strip port, reject junk).
 * @param {unknown} raw
 * @returns {{ ok: true, hostname: string } | { ok: false, code: string, message: string }}
 */
function normalizeCanonicalHostname(raw) {
  if (raw == null) {
    return { ok: false, code: "missing_host", message: "Hostname is required." };
  }
  let host = String(raw).trim().toLowerCase();
  if (!host) {
    return { ok: false, code: "missing_host", message: "Hostname is required." };
  }
  // Reject absolute URLs / userinfo / paths
  if (host.includes("/") || host.includes("@") || host.includes(" ") || host.includes("\\")) {
    return { ok: false, code: "malformed_host", message: "Hostname is malformed." };
  }
  // Strip port (IPv6 not used for product hosts)
  if (host.includes(":") && !host.startsWith("[")) {
    host = host.split(":")[0];
  }
  if (!host || host.length > 253) {
    return { ok: false, code: "malformed_host", message: "Hostname is malformed." };
  }
  // Exact DNS label pattern (no wildcards)
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) && host !== "localhost") {
    return { ok: false, code: "malformed_host", message: "Hostname is malformed." };
  }
  return { ok: true, hostname: host };
}

/**
 * Exact allowlist resolve — never substring match.
 * @param {unknown} rawHostname
 * @returns {{ ok: true, site: CanonicalHostSite } | { ok: false, code: string, message: string, hostname?: string }}
 */
function resolveCanonicalHost(rawHostname) {
  const normalized = normalizeCanonicalHostname(rawHostname);
  if (!normalized.ok) return normalized;
  const site = CANONICAL_HOST_REGISTRY[normalized.hostname];
  if (!site) {
    return {
      ok: false,
      code: "UNKNOWN_PLATFORM_HOST",
      message: `Hostname ${JSON.stringify(normalized.hostname)} is not a registered platform host.`,
      hostname: normalized.hostname,
    };
  }
  return { ok: true, site };
}

/**
 * @param {string} environment
 * @returns {CanonicalHostSite[]}
 */
function listHostsForEnvironment(environment) {
  const env = String(environment || "")
    .trim()
    .toLowerCase();
  return Object.values(CANONICAL_HOST_REGISTRY).filter((s) => s.environment === env);
}

module.exports = {
  CANONICAL_PLATFORM_IDENTITY_KEY,
  CANONICAL_HOST_REGISTRY,
  normalizeCanonicalHostname,
  resolveCanonicalHost,
  listHostsForEnvironment,
};
