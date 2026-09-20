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
 *   platformLine: "v7"|"v8"|null,
 *   brand: string,
 *   siteType: "product"|"corporate"|"legacy-redirect"|"platform",
 *   sessionCookieName: string,
 *   csrfCookieName: string,
 *   redirectTargetOrigin: string|null,
 *   status: "canonical"|"legacy"|"prepared",
 * }>} CanonicalHostSite
 */

function freezeHost(input) {
  return Object.freeze({
    hostname: input.hostname,
    productKey: input.productKey == null ? null : input.productKey,
    environment: input.environment,
    platformLine: input.platformLine || "v7",
    brand: input.brand,
    siteType: input.siteType,
    sessionCookieName: input.sessionCookieName,
    csrfCookieName: input.csrfCookieName,
    redirectTargetOrigin: input.redirectTargetOrigin || null,
    status: input.status || "canonical",
  });
}

/** @type {Readonly<Record<string, CanonicalHostSite>>} */
const CANONICAL_HOST_REGISTRY = Object.freeze({
  "pronline.org": freezeHost({
    hostname: "pronline.org",
    productKey: null,
    environment: "testing",
    platformLine: "v7",
    brand: "Moovex Platform QA",
    siteType: "platform",
    sessionCookieName: "moovex_pronline_hub_sid",
    csrfCookieName: "moovex_pronline_hub_csrf",
  }),
  "www.pronline.org": freezeHost({
    hostname: "www.pronline.org",
    productKey: null,
    environment: "testing",
    platformLine: "v7",
    brand: "Moovex Platform QA",
    siteType: "platform",
    sessionCookieName: "moovex_pronline_hub_sid",
    csrfCookieName: "moovex_pronline_hub_csrf",
    redirectTargetOrigin: "https://pronline.org",
  }),
  "blessboard.com": freezeHost({
    hostname: "blessboard.com",
    productKey: "blessboard",
    environment: "production",
    platformLine: "v7",
    brand: "BlessBoard",
    siteType: "product",
    sessionCookieName: "blessboard_com_sid",
    csrfCookieName: "blessboard_org_csrf",
  }),
  "www.blessboard.com": freezeHost({
    hostname: "www.blessboard.com",
    productKey: "blessboard",
    environment: "production",
    platformLine: "v7",
    brand: "BlessBoard",
    siteType: "product",
    sessionCookieName: "blessboard_com_sid",
    csrfCookieName: "blessboard_org_csrf",
  }),
  "blessboard.pronline.org": freezeHost({
    hostname: "blessboard.pronline.org",
    productKey: "blessboard",
    environment: "testing",
    platformLine: "v7",
    brand: "BlessBoard",
    siteType: "product",
    sessionCookieName: "blessboard_pronline_sid",
    csrfCookieName: "blessboard_pronline_csrf",
  }),
  "activeclinic.org": freezeHost({
    hostname: "activeclinic.org",
    productKey: "activeclinic",
    environment: "production",
    platformLine: "v7",
    brand: "ActiveClinic",
    siteType: "product",
    sessionCookieName: "activeclinic_org_prod_sid",
    csrfCookieName: "activeclinic_org_prod_csrf",
  }),
  "www.activeclinic.org": freezeHost({
    hostname: "www.activeclinic.org",
    productKey: "activeclinic",
    environment: "production",
    platformLine: "v7",
    brand: "ActiveClinic",
    siteType: "product",
    sessionCookieName: "activeclinic_org_prod_sid",
    csrfCookieName: "activeclinic_org_prod_csrf",
  }),
  "activeclinic.pronline.org": freezeHost({
    hostname: "activeclinic.pronline.org",
    productKey: "activeclinic",
    environment: "testing",
    platformLine: "v7",
    brand: "ActiveClinic",
    siteType: "product",
    sessionCookieName: "activeclinic_pronline_sid",
    csrfCookieName: "activeclinic_pronline_csrf",
  }),
  /** V8 isolated testing — BlessBoard (neuniversity.org). */
  "blessboard.neuniversity.org": freezeHost({
    hostname: "blessboard.neuniversity.org",
    productKey: "blessboard",
    environment: "testing",
    platformLine: "v8",
    brand: "BlessBoard",
    siteType: "product",
    sessionCookieName: "blessboard_neuniversity_v8_sid",
    csrfCookieName: "blessboard_neuniversity_v8_csrf",
  }),
  /** V8 isolated testing — ActiveClinic (neuniversity.org). */
  "activeclinic.neuniversity.org": freezeHost({
    hostname: "activeclinic.neuniversity.org",
    productKey: "activeclinic",
    environment: "testing",
    platformLine: "v8",
    brand: "ActiveClinic",
    siteType: "product",
    sessionCookieName: "activeclinic_neuniversity_v8_sid",
    csrfCookieName: "activeclinic_neuniversity_v8_csrf",
  }),
  "neuniversity.org": freezeHost({
    hostname: "neuniversity.org",
    productKey: null,
    environment: "testing",
    platformLine: "v8",
    brand: "Moovex Platform V8 QA",
    siteType: "platform",
    sessionCookieName: "moovex_neuniversity_v8_hub_sid",
    csrfCookieName: "moovex_neuniversity_v8_hub_csrf",
  }),
  "www.neuniversity.org": freezeHost({
    hostname: "www.neuniversity.org",
    productKey: null,
    environment: "testing",
    platformLine: "v8",
    brand: "Moovex Platform V8 QA",
    siteType: "platform",
    sessionCookieName: "moovex_neuniversity_v8_hub_sid",
    csrfCookieName: "moovex_neuniversity_v8_hub_csrf",
    redirectTargetOrigin: "https://neuniversity.org",
  }),
  "getproapp.org": freezeHost({
    hostname: "getproapp.org",
    productKey: "getpro",
    environment: "production",
    platformLine: "v7",
    brand: "GetPro",
    siteType: "product",
    sessionCookieName: "getproapp_org_sid",
    csrfCookieName: "getproapp_org_csrf",
  }),
  "www.getproapp.org": freezeHost({
    hostname: "www.getproapp.org",
    productKey: "getpro",
    environment: "production",
    platformLine: "v7",
    brand: "GetPro",
    siteType: "product",
    sessionCookieName: "getproapp_org_sid",
    csrfCookieName: "getproapp_org_csrf",
  }),
  /** Canonical GetPro testing hostname. */
  "getproapp.pronline.org": freezeHost({
    hostname: "getproapp.pronline.org",
    productKey: "getpro",
    environment: "testing",
    platformLine: "v7",
    brand: "GetPro",
    siteType: "product",
    sessionCookieName: "getproapp_pronline_sid",
    csrfCookieName: "getproapp_pronline_csrf",
  }),
  /**
   * Compatibility alias → getproapp.pronline.org (temporary; not canonical).
   * Runtime issues a 301 when redirectTargetOrigin is set on a product host.
   */
  "getpro.pronline.org": freezeHost({
    hostname: "getpro.pronline.org",
    productKey: "getpro",
    environment: "testing",
    platformLine: "v7",
    brand: "GetPro",
    siteType: "product",
    sessionCookieName: "getpro_pronline_sid",
    csrfCookieName: "getpro_pronline_csrf",
    redirectTargetOrigin: "https://getproapp.pronline.org",
    status: "legacy",
  }),
  "netraz.org": freezeHost({
    hostname: "netraz.org",
    productKey: "ngo",
    environment: "production",
    platformLine: "v7",
    brand: "Netraz",
    siteType: "product",
    sessionCookieName: "netraz_org_sid",
    csrfCookieName: "netraz_org_csrf",
  }),
  "www.netraz.org": freezeHost({
    hostname: "www.netraz.org",
    productKey: "ngo",
    environment: "production",
    platformLine: "v7",
    brand: "Netraz",
    siteType: "product",
    sessionCookieName: "netraz_org_sid",
    csrfCookieName: "netraz_org_csrf",
  }),
  "netraz.pronline.org": freezeHost({
    hostname: "netraz.pronline.org",
    productKey: "ngo",
    environment: "testing",
    platformLine: "v7",
    brand: "Netraz",
    siteType: "product",
    sessionCookieName: "netraz_pronline_sid",
    csrfCookieName: "netraz_pronline_csrf",
  }),
  "moovex.org": freezeHost({
    hostname: "moovex.org",
    productKey: null,
    environment: "production",
    platformLine: "v7",
    brand: "Moovex",
    siteType: "corporate",
    sessionCookieName: "moovex_org_sid",
    csrfCookieName: "moovex_org_csrf",
  }),
  "www.moovex.org": freezeHost({
    hostname: "www.moovex.org",
    productKey: null,
    environment: "production",
    platformLine: "v7",
    brand: "Moovex",
    siteType: "corporate",
    sessionCookieName: "moovex_org_sid",
    csrfCookieName: "moovex_org_csrf",
  }),
  "moovex.pronline.org": freezeHost({
    hostname: "moovex.pronline.org",
    productKey: null,
    environment: "testing",
    platformLine: "v7",
    brand: "Moovex",
    siteType: "corporate",
    sessionCookieName: "moovex_pronline_sid",
    csrfCookieName: "moovex_pronline_csrf",
  }),
  /** Prepared legacy redirect — not activated on Hostinger yet. */
  "blessboard.org": freezeHost({
    hostname: "blessboard.org",
    productKey: "blessboard",
    environment: "production",
    platformLine: "v7",
    brand: "BlessBoard",
    siteType: "legacy-redirect",
    sessionCookieName: "blessboard_org_redirect_sid",
    csrfCookieName: "blessboard_org_redirect_csrf",
    redirectTargetOrigin: "https://blessboard.com",
    status: "prepared",
  }),
  "www.blessboard.org": freezeHost({
    hostname: "www.blessboard.org",
    productKey: "blessboard",
    environment: "production",
    platformLine: "v7",
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
