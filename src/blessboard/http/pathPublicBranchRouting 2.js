"use strict";

/**
 * Path-public branch routing helpers for canonical /c/:org/:branch URLs.
 */

const { PUBLIC_PAGE_KEYS } = require("../services/publicContentConstants");
const { normalizeBranchKey } = require("../services/listBlessBoardBranches");
const {
  publicBranchHomePath,
  publicBranchPagePath,
  publicChurchHomePath,
} = require("../urls/churchUrlHelper");
const { PAGE_KEY_TO_PATH, pageKeyFromPath } = require("./tenantPublicPaths");
const { appendQuery, searchFromRequest } = require("../../platform/website/publicWebsiteUrl");

const ORG_LEVEL_SPECIAL_SEGMENTS = Object.freeze(["sitemap.xml", "robots.txt"]);
const LEGACY_BRANCH_PREFIX = "branches";

/**
 * @param {string} segment
 */
function isOrgLevelSpecialSegment(segment) {
  return ORG_LEVEL_SPECIAL_SEGMENTS.includes(String(segment || "").trim().toLowerCase());
}

/**
 * @param {string} segment
 */
function isLegacyPublicPageSegment(segment) {
  const key = String(segment || "").trim().toLowerCase();
  if (!key || key === "home") return false;
  return PUBLIC_PAGE_KEYS.includes(key);
}

/**
 * @param {string} segment
 * @param {Array<{ key: string }>} activeBranches
 */
function resolveBranchKeyFromSegment(segment, activeBranches) {
  const normalized = normalizeBranchKey(segment);
  if (!normalized) return null;
  const branches = Array.isArray(activeBranches) ? activeBranches : [];
  const match = branches.find((b) => b && b.key === normalized);
  return match ? match.key : null;
}

/**
 * @param {{
 *   organizationKey: string,
 *   primaryBranchKey?: string|null,
 *   pageKey?: string,
 *   query?: string|Record<string, unknown>,
 * }} input
 */
function primaryBranchPublicPath(input) {
  const orgKey = String((input && input.organizationKey) || "").trim();
  const branchKey = normalizeBranchKey(input && input.primaryBranchKey);
  const pageKey = String((input && input.pageKey) || "home").trim().toLowerCase();
  if (!orgKey || !branchKey) return null;
  const path =
    !pageKey || pageKey === "home"
      ? publicBranchHomePath(orgKey, branchKey)
      : publicBranchPagePath(orgKey, branchKey, pageKey);
  return path ? appendQuery(path, input && input.query) : null;
}

/**
 * Legacy /c/:org/branches/:branch(/page)? → flat canonical path.
 * @param {import('express').Request} req
 * @param {string} organizationKey
 * @param {string} branchKey
 * @param {string} [suffixPath]
 */
function legacyBranchPublicRedirectTarget(req, organizationKey, branchKey, suffixPath) {
  const orgKey = String(organizationKey || "").trim();
  const bKey = normalizeBranchKey(branchKey);
  if (!orgKey || !bKey) return null;
  const suffix = String(suffixPath || "/");
  const pageKey = pageKeyFromPath(suffix) || "home";
  return primaryBranchPublicPath({
    organizationKey: orgKey,
    primaryBranchKey: bKey,
    pageKey,
    query: searchFromRequest(req),
  });
}

/**
 * Church-wide legacy page /c/:org/:page → primary branch page.
 * @param {import('express').Request} req
 * @param {string} organizationKey
 * @param {string} pageKey
 * @param {string|null|undefined} primaryBranchKey
 */
function legacyChurchWidePageRedirectTarget(req, organizationKey, pageKey, primaryBranchKey) {
  return primaryBranchPublicPath({
    organizationKey,
    primaryBranchKey,
    pageKey,
    query: searchFromRequest(req),
  });
}

/**
 * Org home /c/:org → primary branch home.
 */
function orgHomeRedirectTarget(req, organizationKey, primaryBranchKey) {
  return primaryBranchPublicPath({
    organizationKey,
    primaryBranchKey,
    pageKey: "home",
    query: searchFromRequest(req),
  });
}

module.exports = {
  LEGACY_BRANCH_PREFIX,
  ORG_LEVEL_SPECIAL_SEGMENTS,
  isOrgLevelSpecialSegment,
  isLegacyPublicPageSegment,
  resolveBranchKeyFromSegment,
  primaryBranchPublicPath,
  legacyBranchPublicRedirectTarget,
  legacyChurchWidePageRedirectTarget,
  orgHomeRedirectTarget,
  PAGE_KEY_TO_PATH,
};
