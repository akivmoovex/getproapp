"use strict";

/**
 * Compose HQ / Branch Admin website nav labels from resolveWebsiteMode.
 * Presentation only — does not change routes, CMS scope, or authorization.
 */

const { WEBSITE_MODE } = require("../services/resolveWebsiteMode");
const { hqWebsiteBranchBasePath } = require("../urls/churchUrlHelper");
const { normalizeBranchKey } = require("../services/listBlessBoardBranches");

const HQ_CONTENT_KEY = "content";
const BRANCH_WEBSITE_KEY = "website";
const BRANCH_WEBSITES_HEADING_KEY = "branch_websites";

/**
 * @param {string} branchKey
 */
function hqWebsiteBranchNavKey(branchKey) {
  const key = normalizeBranchKey(branchKey);
  return key ? `website_branch_${key}` : null;
}

/**
 * Derive which website-related nav key is active from the request path.
 * @param {string} pathOnly
 * @param {string} fallbackActiveNav
 */
function resolveHqWebsiteActiveNavFromPath(pathOnly, fallbackActiveNav) {
  const path = String(pathOnly || "").split("?")[0] || "";
  const m =
    /^\/hq\/website\/branches\/([^/]+)/.exec(path) ||
    /^\/hq\/content\/b\/([^/]+)/.exec(path);
  if (m) {
    const navKey = hqWebsiteBranchNavKey(m[1]);
    if (navKey) return navKey;
  }
  return fallbackActiveNav || HQ_CONTENT_KEY;
}

/**
 * Expand / relabel the HQ "Website" nav entry for single_site vs multi_site.
 *
 * @param {ReadonlyArray<object>} navItems  already entitlement-filtered
 * @param {{
 *   ok?: boolean,
 *   websiteMode?: string,
 *   activeBranches?: Array<{ key: string, displayName: string, isPrimary?: boolean }>,
 * }|null|undefined} websiteMode
 * @param {{ requestPath?: string, activeNav?: string }} [opts]
 * @returns {{ navItems: object[], activeNav: string }}
 */
function applyHqWebsiteModeNav(navItems, websiteMode, opts) {
  const items = Array.isArray(navItems) ? navItems.slice() : [];
  const idx = items.findIndex((item) => item && item.key === HQ_CONTENT_KEY);
  if (idx < 0) {
    return {
      navItems: items,
      activeNav: (opts && opts.activeNav) || HQ_CONTENT_KEY,
    };
  }

  const mode =
    websiteMode && websiteMode.ok && websiteMode.websiteMode === WEBSITE_MODE.MULTI_SITE
      ? WEBSITE_MODE.MULTI_SITE
      : WEBSITE_MODE.SINGLE_SITE;

  const base = items[idx];
  /** @type {object[]} */
  const replacement = [];

  if (mode === WEBSITE_MODE.SINGLE_SITE) {
    replacement.push({
      ...base,
      key: HQ_CONTENT_KEY,
      label: "Website",
      href: "/hq/website",
    });
  } else {
    replacement.push({
      ...base,
      key: HQ_CONTENT_KEY,
      label: "HQ Website",
      href: "/hq/website",
    });
    replacement.push({
      key: BRANCH_WEBSITES_HEADING_KEY,
      label: "Branch Websites",
      href: null,
      icon: "apartment",
      enabled: true,
      nav: true,
      navHeading: true,
    });
    const branches = Array.isArray(websiteMode.activeBranches)
      ? websiteMode.activeBranches
      : [];
    for (const branch of branches) {
      const bKey = normalizeBranchKey(branch && branch.key);
      if (!bKey) continue;
      const href = hqWebsiteBranchBasePath(bKey);
      if (!href) continue;
      replacement.push({
        key: hqWebsiteBranchNavKey(bKey),
        label: String((branch && branch.displayName) || bKey),
        href,
        icon: "location_on",
        enabled: true,
        nav: true,
        branchKey: bKey,
        isPrimary: Boolean(branch && branch.isPrimary),
      });
    }
  }

  items.splice(idx, 1, ...replacement);

  const fallback = (opts && opts.activeNav) || HQ_CONTENT_KEY;
  const activeNav = resolveHqWebsiteActiveNavFromPath(
    (opts && opts.requestPath) || "",
    fallback
  );
  const known = new Set(items.map((i) => i && i.key).filter(Boolean));
  return {
    navItems: items,
    activeNav: known.has(activeNav) ? activeNav : fallback,
  };
}

/**
 * Relabel Branch Admin website nav for single_site vs multi_site.
 * Never injects other branches' management links.
 *
 * @param {ReadonlyArray<object>} navItems
 * @param {{ ok?: boolean, websiteMode?: string }|null|undefined} websiteMode
 * @returns {object[]}
 */
function applyBranchWebsiteModeNav(navItems, websiteMode) {
  const items = Array.isArray(navItems) ? navItems.slice() : [];
  const multi =
    websiteMode &&
    websiteMode.ok &&
    websiteMode.websiteMode === WEBSITE_MODE.MULTI_SITE;

  return items.map((item) => {
    if (!item || item.key !== BRANCH_WEBSITE_KEY) return item;
    return {
      ...item,
      label: multi ? "My Branch Website" : "Website",
      href: "/branch-admin/website",
    };
  });
}

/**
 * Dashboard module tile label for website.
 * @param {ReadonlyArray<object>} modules
 * @param {{ ok?: boolean, websiteMode?: string }|null|undefined} websiteMode
 */
function applyBranchWebsiteModeModules(modules, websiteMode) {
  const list = Array.isArray(modules) ? modules.slice() : [];
  const multi =
    websiteMode &&
    websiteMode.ok &&
    websiteMode.websiteMode === WEBSITE_MODE.MULTI_SITE;
  return list.map((mod) => {
    if (!mod || mod.key !== "content") return mod;
    return {
      ...mod,
      label: multi ? "My Branch Website" : "Website",
    };
  });
}

/**
 * Mobile group keys for HQ branch website entries (dynamic).
 * @param {ReadonlyArray<object>} navItems
 * @returns {string[]}
 */
function hqBranchWebsiteNavKeys(navItems) {
  return (Array.isArray(navItems) ? navItems : [])
    .filter((item) => item && String(item.key || "").startsWith("website_branch_"))
    .map((item) => item.key);
}

module.exports = {
  HQ_CONTENT_KEY,
  BRANCH_WEBSITE_KEY,
  BRANCH_WEBSITES_HEADING_KEY,
  hqWebsiteBranchNavKey,
  resolveHqWebsiteActiveNavFromPath,
  applyHqWebsiteModeNav,
  applyBranchWebsiteModeNav,
  applyBranchWebsiteModeModules,
  hqBranchWebsiteNavKeys,
};
