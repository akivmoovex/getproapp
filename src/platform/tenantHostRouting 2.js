"use strict";

const { resolveHostname, getSubdomain } = require("./host");

/**
 * Explicit platform subdomains that must resolve to a tenant slug equal to the subdomain label
 * (e.g. demo.pronline.org → demo). Kept in sync with RESERVED_PLATFORM_SUBDOMAINS in tenants/index.js.
 * Used for documentation, tests, and startup banners — not a second source of truth for HTTP behavior.
 */
const EXPLICIT_SUBDOMAIN_TO_TENANT_SLUG = Object.freeze({
  demo: "demo",
  zm: "zm",
  il: "il",
});

/**
 * Pure helper for tests: given host + base + first-label subdomain, return tenant slug when this is a
 * known regional platform host (demo / zm / il on BASE_DOMAIN).
 * @param {{ host: string, baseDomain: string, subdomain: string | null }} parts
 * @returns {string | null}
 */
function resolveExplicitPlatformTenantSlug(parts) {
  const base = String(parts.baseDomain || "")
    .toLowerCase()
    .trim();
  const host = String(parts.host || "")
    .toLowerCase()
    .trim();
  const sub = parts.subdomain ? String(parts.subdomain).toLowerCase().trim() : "";
  if (!base || !sub) return null;
  if (!EXPLICIT_SUBDOMAIN_TO_TENANT_SLUG[sub]) return null;
  const expected = `${sub}.${base}`;
  if (host === expected) return sub;
  return null;
}

/**
 * One-line debug string for observability (no PII).
 * @param {import("express").Request} req
 * @param {{ slug?: string } | null | undefined} tenant
 */
function formatHostTenantDebugLine(req, tenant) {
  const hostname = resolveHostname(req);
  const slug = tenant && tenant.slug ? String(tenant.slug) : "(unset)";
  return `Host: ${hostname} -> tenant: ${slug}`;
}

/**
 * Startup banner: lists primary regional hosts for the configured BASE_DOMAIN.
 * @param {string} base — BASE_DOMAIN (no scheme)
 * @returns {string[]}
 */
function listExplicitRegionalHostExamples(base) {
  const b = String(base || "")
    .toLowerCase()
    .trim();
  if (!b) return [];
  return ["demo", "zm", "il"].map((sub) => `${sub}.${b}`);
}

/**
 * @param {import("express").Request} req
 */
function getSubdomainForRouting(req) {
  return getSubdomain(req);
}

module.exports = {
  EXPLICIT_SUBDOMAIN_TO_TENANT_SLUG,
  resolveExplicitPlatformTenantSlug,
  formatHostTenantDebugLine,
  listExplicitRegionalHostExamples,
  getSubdomainForRouting,
};
