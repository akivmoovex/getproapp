"use strict";

/**
 * Public discovery URLs for BlessBoard V5 tenant sites (sitemap + link helpers).
 * single_site → church-wide URLs only.
 * multi_site → HQ church-wide + each active branch website.
 */

const { WEBSITE_MODE } = require("../services/resolveWebsiteMode");
const { PAGE_KEY_TO_PATH, PUBLIC_PAGE_KEYS_ORDER } = (() => {
  const paths = require("./tenantPublicPaths");
  const keys = Object.keys(paths.PAGE_KEY_TO_PATH || {});
  // Prefer stable CMS order when available.
  const preferred = [
    "home",
    "about",
    "leadership",
    "ministries",
    "events",
    "sermons",
    "contact",
    "giving",
  ];
  const ordered = preferred.filter((k) => keys.includes(k));
  for (const k of keys) {
    if (!ordered.includes(k)) ordered.push(k);
  }
  return { PAGE_KEY_TO_PATH: paths.PAGE_KEY_TO_PATH, PUBLIC_PAGE_KEYS_ORDER: ordered };
})();
const {
  publicChurchPagePath,
  publicBranchPagePath,
  tenantBranchPagePath,
} = require("../urls/churchUrlHelper");

/**
 * @param {string} hostname
 * @param {string} pathOnly
 */
function absoluteUrl(hostname, pathOnly) {
  const host = String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");
  const path =
    !pathOnly || pathOnly === "/"
      ? "/"
      : String(pathOnly).startsWith("/")
        ? String(pathOnly)
        : `/${pathOnly}`;
  if (!host) return path;
  return `https://${host}${path}`;
}

/**
 * Church-wide public path for a page key.
 * @param {{ routingMode: 'path'|'tenant', organizationKey?: string|null, pageKey: string }} input
 */
function churchWidePagePath(input) {
  const pageKey = String(input.pageKey || "home");
  if (input.routingMode === "tenant") {
    return PAGE_KEY_TO_PATH[pageKey] || "/";
  }
  return publicChurchPagePath(input.organizationKey, pageKey);
}

/**
 * Branch public path for a page key (multi_site only).
 */
function branchPagePath(input) {
  const pageKey = String(input.pageKey || "home");
  if (input.routingMode === "tenant") {
    return tenantBranchPagePath(input.branchKey, pageKey);
  }
  return publicBranchPagePath(input.organizationKey, input.branchKey, pageKey);
}

/**
 * Deduped absolute discovery URLs for sitemap / share surfaces.
 *
 * @param {{
 *   hostname: string,
 *   routingMode?: 'path'|'tenant',
 *   organizationKey?: string|null,
 *   websiteMode: string,
 *   activeBranches?: Array<{ key: string }>,
 *   pageKeys?: string[],
 * }} input
 * @returns {string[]}
 */
function buildTenantPublicDiscoveryUrls(input) {
  const routingMode = input.routingMode === "tenant" ? "tenant" : "path";
  const organizationKey = input.organizationKey || null;
  const hostname = input.hostname || "";
  const pageKeys = Array.isArray(input.pageKeys) && input.pageKeys.length
    ? input.pageKeys
    : PUBLIC_PAGE_KEYS_ORDER;
  const mode =
    input.websiteMode === WEBSITE_MODE.MULTI_SITE
      ? WEBSITE_MODE.MULTI_SITE
      : WEBSITE_MODE.SINGLE_SITE;

  /** @type {string[]} */
  const urls = [];
  const seen = new Set();

  function pushPath(pathOnly) {
    if (!pathOnly) return;
    const abs = absoluteUrl(hostname, pathOnly);
    if (seen.has(abs)) return;
    seen.add(abs);
    urls.push(abs);
  }

  const branches = Array.isArray(input.activeBranches) ? input.activeBranches : [];
  const excluded =
    input.excludeBranchKeys instanceof Set
      ? input.excludeBranchKeys
      : new Set(Array.isArray(input.excludeBranchKeys) ? input.excludeBranchKeys : []);
  for (const branch of branches) {
    const key = branch && branch.key ? String(branch.key) : "";
    if (!key || excluded.has(key)) continue;
    for (const pageKey of pageKeys) {
      pushPath(
        branchPagePath({
          routingMode,
          organizationKey,
          branchKey: key,
          pageKey,
        })
      );
    }
  }

  return urls;
}

/**
 * Minimal sitemap.xml body (urlset). No lastmod required.
 * @param {string[]} absoluteUrls
 */
function buildTenantPublicSitemapXml(absoluteUrls) {
  return require("../../platform/website/seoDiscovery").buildSitemapXml(absoluteUrls);
}

/**
 * Branch switcher / location discovery DTOs from website mode.
 *
 * @param {{
 *   websiteMode: ReturnType<import('../services/resolveWebsiteMode').deriveWebsiteMode>|object,
 *   routingMode: 'path'|'tenant',
 *   organizationKey?: string|null,
 *   churchHomeHref: string,
 *   currentBranchKey?: string|null,
 * }} input
 */
function buildPublicBranchDiscovery(input) {
  const mode = input.websiteMode;
  const routingMode = input.routingMode === "tenant" ? "tenant" : "path";
  const organizationKey = input.organizationKey || null;
  const currentKey = input.currentBranchKey ? String(input.currentBranchKey) : null;
  const branches =
    mode && Array.isArray(mode.activeBranches) ? mode.activeBranches : [];

  const branchLocations = branches.map((b) => ({
    key: b.key,
    displayName: b.displayName,
    isPrimary: Boolean(b.isPrimary),
    kind: "location",
    websiteHref:
      routingMode === "tenant"
        ? tenantBranchPagePath(b.key, "home")
        : publicBranchPagePath(organizationKey, b.key, "home"),
    isCurrent: currentKey ? b.key === currentKey : Boolean(b.isPrimary),
  }));

  const branchSwitcher = branchLocations.map((loc) => ({
    key: loc.key,
    displayName: loc.displayName,
    isPrimary: loc.isPrimary,
    isCurrent: loc.isCurrent,
    href: loc.websiteHref,
  }));

  return {
    websiteMode: mode && mode.websiteMode ? mode.websiteMode : WEBSITE_MODE.SINGLE_SITE,
    branchSwitcher,
    branchLocations,
  };
}

module.exports = {
  absoluteUrl,
  churchWidePagePath,
  branchPagePath,
  buildTenantPublicDiscoveryUrls,
  buildTenantPublicSitemapXml,
  buildPublicBranchDiscovery,
  PUBLIC_PAGE_KEYS_ORDER,
};
