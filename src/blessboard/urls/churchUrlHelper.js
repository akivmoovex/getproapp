"use strict";

/**
 * Server-side church URL helper for V5 testing path routing and HQ surfaces.
 * Does not invent unsupported wildcard hosts.
 */

const { normalizeOrganizationKey } = require("../services/organizationKey");
const { normalizeBranchKey } = require("../services/listBlessBoardBranches");
const {
  buildPublicOrganizationWebsitePath,
  buildPublicWebsiteSettingsPath,
  buildPublicWebsitePublishPath,
  PRODUCT_CODE,
} = require("../../platform/website/publicWebsiteUrl");

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
  return buildPublicOrganizationWebsitePath({
    product: PRODUCT_CODE.BLESSBOARD,
    organizationKey: norm.key,
  });
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
  const norm = normalizeOrganizationKey(String(organizationKey || "").trim().toLowerCase());
  if (!norm.ok) return null;
  return buildPublicOrganizationWebsitePath({
    product: PRODUCT_CODE.BLESSBOARD,
    organizationKey: norm.key,
    pageKey: key,
  });
}

/**
 * Path-public branch mini website home: /c/:organizationKey/branches/:branchKey
 * @param {unknown} organizationKey
 * @param {unknown} branchKey
 * @returns {string | null}
 */
function publicBranchHomePath(organizationKey, branchKey) {
  const norm = normalizeOrganizationKey(
    String(organizationKey == null ? "" : organizationKey).trim().toLowerCase()
  );
  const bKey = normalizeBranchKey(branchKey);
  if (!norm.ok || !bKey) return null;
  return buildPublicOrganizationWebsitePath({
    product: PRODUCT_CODE.BLESSBOARD,
    organizationKey: norm.key,
    scope: { kind: "branch", branchKey: bKey },
  });
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
  const norm = normalizeOrganizationKey(
    String(organizationKey == null ? "" : organizationKey).trim().toLowerCase()
  );
  const bKey = normalizeBranchKey(branchKey);
  if (!norm.ok || !bKey) return null;
  return buildPublicOrganizationWebsitePath({
    product: PRODUCT_CODE.BLESSBOARD,
    organizationKey: norm.key,
    pageKey: key,
    scope: { kind: "branch", branchKey: bKey },
  });
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
  return (
    buildPublicWebsiteSettingsPath({ product: PRODUCT_CODE.BLESSBOARD }) || "/hq/website"
  );
}

function hqDashboardPath() {
  return "/hq";
}

/**
 * HQ branch mini-website editor base: /hq/website/branches/:branchKey
 * @param {unknown} branchKey
 * @returns {string | null}
 */
function hqWebsiteBranchBasePath(branchKey) {
  const bKey = normalizeBranchKey(branchKey);
  if (!bKey) return null;
  return `/hq/website/branches/${bKey}`;
}

/**
 * Church-wide or branch-scoped publish review.
 * @param {unknown} [branchKey]
 * @returns {string}
 */
function hqWebsitePublishReviewPath(branchKey) {
  const bKey = normalizeBranchKey(branchKey);
  return (
    buildPublicWebsitePublishPath({
      product: PRODUCT_CODE.BLESSBOARD,
      scope: bKey ? { kind: "branch", branchKey: bKey } : null,
    }) || "/hq/website/publish/review"
  );
}

/**
 * Church-wide or branch-scoped publish POST target.
 * @param {unknown} [branchKey]
 * @returns {string}
 */
function hqWebsitePublishPath(branchKey) {
  const base = hqWebsiteBranchBasePath(branchKey);
  return base ? `${base}/publish` : "/hq/website/publish";
}

/**
 * Branch website details / identity editor (canonical Stage 5 page editor).
 * @param {unknown} branchKey
 * @returns {string | null}
 */
function hqWebsiteBranchDetailsPath(branchKey) {
  const base = hqWebsiteBranchBasePath(branchKey);
  return base ? `${base}/pages/home` : null;
}

/**
 * @param {unknown} branchKey
 * @param {string} [pageKey]
 * @returns {string | null}
 */
function hqBranchPreviewPagePath(branchKey, pageKey) {
  const base = hqWebsiteBranchBasePath(branchKey);
  if (!base) return null;
  const key = String(pageKey == null ? "home" : pageKey)
    .trim()
    .toLowerCase();
  return `${base}/preview/${key || "home"}`;
}

/**
 * @param {unknown} branchKey
 * @param {string} [pageKey]
 * @returns {string | null}
 */
function hqBranchContentPagePath(branchKey, pageKey) {
  const base = hqWebsiteBranchBasePath(branchKey);
  if (!base) return null;
  const key = String(pageKey == null ? "home" : pageKey)
    .trim()
    .toLowerCase();
  return `${base}/pages/${key || "home"}`;
}

module.exports = {
  PUBLIC_PAGE_KEYS,
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
  hqWebsiteBranchBasePath,
  hqWebsitePublishReviewPath,
  hqWebsitePublishPath,
  hqWebsiteBranchDetailsPath,
  hqBranchPreviewPagePath,
  hqBranchContentPagePath,
};
