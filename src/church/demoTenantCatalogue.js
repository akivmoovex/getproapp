"use strict";

/**
 * Canonical BlessBoard demo tenants (testing deployments).
 * Hostnames use {@link getChurchHostDomain} — never hard-code .com / .org.
 */

const { getChurchHostDomain } = require("./blessBoardEnv");
const { churchPublicHost, churchPublicUrl } = require("./platformProvisioningValidation");

/** @typedef {{ slug: string, hostSlug: string, name: string, dataEnvironment: 'demo'|'test', branchName: string, branchSlug: string }} DemoTenantDef */

/** @type {readonly DemoTenantDef[]} */
const DEMO_TENANT_CATALOGUE = Object.freeze([
  Object.freeze({
    slug: "demo",
    hostSlug: "demo",
    name: "BlessBoard Demo Church",
    dataEnvironment: "demo",
    branchName: "BlessBoard Demo Church",
    branchSlug: "main",
  }),
  Object.freeze({
    slug: "demo2",
    hostSlug: "demo2",
    name: "BlessBoard Demo2 Church",
    dataEnvironment: "demo",
    branchName: "BlessBoard Demo2 Church",
    branchSlug: "main",
  }),
]);

const DEMO_TENANT_SLUGS = Object.freeze(DEMO_TENANT_CATALOGUE.map((t) => t.slug));
const DEMO_TENANT_HOST_SLUGS = Object.freeze(DEMO_TENANT_CATALOGUE.map((t) => t.hostSlug));

function listDemoTenants() {
  return DEMO_TENANT_CATALOGUE.slice();
}

function findDemoTenantBySlug(slug) {
  const key = String(slug || "")
    .trim()
    .toLowerCase();
  return DEMO_TENANT_CATALOGUE.find((t) => t.slug === key || t.hostSlug === key) || null;
}

function isCatalogueDemoSlug(slug) {
  return Boolean(findDemoTenantBySlug(slug));
}

/**
 * Public host for a catalogue demo (e.g. demo.blessboard.org when CHURCH_HOST_DOMAIN=blessboard.org).
 * @param {string} slug
 */
function demoTenantPublicHost(slug) {
  const entry = findDemoTenantBySlug(slug);
  if (!entry) return "";
  return churchPublicHost(entry.hostSlug);
}

/**
 * Absolute https URL for a catalogue demo homepage.
 * @param {string} slug
 * @param {string} [path]
 */
function demoTenantPublicUrl(slug, path = "/") {
  const entry = findDemoTenantBySlug(slug);
  if (!entry) return "";
  return churchPublicUrl(entry.hostSlug, path);
}

/** Church DNS base used for demo hosts (env-driven). */
function demoTenantChurchDomain() {
  return getChurchHostDomain();
}

module.exports = {
  DEMO_TENANT_CATALOGUE,
  DEMO_TENANT_SLUGS,
  DEMO_TENANT_HOST_SLUGS,
  listDemoTenants,
  findDemoTenantBySlug,
  isCatalogueDemoSlug,
  demoTenantPublicHost,
  demoTenantPublicUrl,
  demoTenantChurchDomain,
};
