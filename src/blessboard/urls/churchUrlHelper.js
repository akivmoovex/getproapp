"use strict";

/**
 * Server-side church URL helper for V5 testing path routing and HQ surfaces.
 * Does not invent unsupported wildcard hosts.
 */

const { normalizeOrganizationKey } = require("../services/organizationKey");
const { normalizeBranchKey } = require("../services/listBlessBoardBranches");

const PUBLIC_PAGE_KEYS = Object.freeze([
  "home",
  "about",
  "leadership",
  "ministries",
  "events",
  "sermons",
  "contact",
  "giving",
]);

/**
 * @param {unknown} organizationKey
 * @returns {string | null}
 */
function publicChurchHomePath(organizationKey) {
  const key = String(organizationKey == null ? "" : organizationKey)
    .trim()
    .toLowerCase();
  const norm = normalizeOrganizationKey(key);
  if (!norm.ok) return null;
  return `/c/${norm.key}`;
}

/**
 * @param {unknown} organizationKey
 * @param {string} [pageKey]
 * @returns {string | null}
 */
function publicChurchPagePath(organizationKey, pageKey) {
  const home = publicChurchHomePath(organizationKey);
  if (!home) return null;
  const key = String(pageKey == null ? "home" : pageKey)
    .trim()
    .toLowerCase();
  if (!key || key === "home") return home;
  if (!PUBLIC_PAGE_KEYS.includes(key)) return null;
  return `${home}/${key}`;
}

/**
 * Path-public branch mini website home: /c/:organizationKey/branches/:branchKey
 * @param {unknown} organizationKey
 * @param {unknown} branchKey
 * @returns {string | null}
 */
function publicBranchHomePath(organizationKey, branchKey) {
  const home = publicChurchHomePath(organizationKey);
  const bKey = normalizeBranchKey(branchKey);
  if (!home || !bKey) return null;
  return `${home}/branches/${bKey}`;
}

/**
 * @param {unknown} organizationKey
 * @param {unknown} branchKey
 * @param {string} [pageKey]
 * @returns {string | null}
 */
function publicBranchPagePath(organizationKey, branchKey, pageKey) {
  const home = publicBranchHomePath(organizationKey, branchKey);
  if (!home) return null;
  const key = String(pageKey == null ? "home" : pageKey)
    .trim()
    .toLowerCase();
  if (!key || key === "home") return home;
  if (!PUBLIC_PAGE_KEYS.includes(key)) return null;
  return `${home}/${key}`;
}

/**
 * Tenant-host branch mini website home: /branches/:branchKey
 * @param {unknown} branchKey
 * @returns {string | null}
 */
function tenantBranchHomePath(branchKey) {
  const bKey = normalizeBranchKey(branchKey);
  if (!bKey) return null;
  return `/branches/${bKey}`;
}

/**
 * @param {unknown} branchKey
 * @param {string} [pageKey]
 * @returns {string | null}
 */
function tenantBranchPagePath(branchKey, pageKey) {
  const home = tenantBranchHomePath(branchKey);
  if (!home) return null;
  const key = String(pageKey == null ? "home" : pageKey)
    .trim()
    .toLowerCase();
  if (!key || key === "home") return home;
  if (!PUBLIC_PAGE_KEYS.includes(key)) return null;
  return `${home}/${key}`;
}

/**
 * Build public path map for the current website scope.
 * @param {{
 *   organizationKey?: string|null,
 *   branchKey?: string|null,
 *   mode?: 'path'|'tenant',
 * }} input
 */
function buildPublicWebsitePaths(input) {
  const mode = input && input.mode === "tenant" ? "tenant" : "path";
  const orgKey = input && input.organizationKey;
  const branchKey = input && input.branchKey;
  /** @type {Record<string, string|null>} */
  const paths = Object.create(null);
  for (const pageKey of PUBLIC_PAGE_KEYS) {
    if (branchKey) {
      paths[pageKey] =
        mode === "tenant"
          ? tenantBranchPagePath(branchKey, pageKey)
          : publicBranchPagePath(orgKey, branchKey, pageKey);
    } else {
      paths[pageKey] =
        mode === "tenant"
          ? pageKey === "home"
            ? "/"
            : `/${pageKey}`
          : publicChurchPagePath(orgKey, pageKey);
    }
  }
  return paths;
}

/**
 * @param {string} [pageKey]
 * @returns {string}
 */
function hqContentPagePath(pageKey) {
  const key = String(pageKey == null ? "home" : pageKey)
    .trim()
    .toLowerCase();
  return `/hq/content/pages/${key || "home"}`;
}

/**
 * @param {string} [pageKey]
 * @returns {string}
 */
function hqPreviewPagePath(pageKey) {
  const key = String(pageKey == null ? "home" : pageKey)
    .trim()
    .toLowerCase();
  return `/hq/content/preview/${key || "home"}`;
}

function hqWebsitePath() {
  return "/hq/website";
}

function hqDashboardPath() {
  return "/hq";
}

module.exports = {
  publicChurchHomePath,
  publicChurchPagePath,
  publicBranchHomePath,
  publicBranchPagePath,
  tenantBranchHomePath,
  tenantBranchPagePath,
  buildPublicWebsitePaths,
  hqContentPagePath,
  hqPreviewPagePath,
  hqWebsitePath,
  hqDashboardPath,
};
