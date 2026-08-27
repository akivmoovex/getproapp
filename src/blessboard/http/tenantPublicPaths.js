"use strict";

/**
 * V5 tenant public page path ↔ page_key mapping.
 * Includes Stage 3 branch mini-website paths under /branches/:branchKey.
 */

const { PUBLIC_PAGE_KEYS, PAGE_KEY_TITLES } = require("../services/publicContentConstants");
const { normalizeBranchKey } = require("../services/listBlessBoardBranches");

const PATH_TO_PAGE_KEY = Object.freeze({
  "/": "home",
  "/about": "about",
  "/leadership": "leadership",
  "/ministries": "ministries",
  "/events": "events",
  "/sermons": "sermons",
  "/contact": "contact",
  "/giving": "giving",
});

const PAGE_KEY_TO_PATH = Object.freeze({
  home: "/",
  about: "/about",
  leadership: "/leadership",
  ministries: "/ministries",
  events: "/events",
  sermons: "/sermons",
  contact: "/contact",
  giving: "/giving",
});

const PAGE_SUFFIXES = Object.freeze([
  "",
  "/about",
  "/leadership",
  "/ministries",
  "/events",
  "/sermons",
  "/contact",
  "/giving",
]);

const NAV_ITEMS = Object.freeze(
  PUBLIC_PAGE_KEYS.map((key) =>
    Object.freeze({
      key,
      href: PAGE_KEY_TO_PATH[key],
      label: PAGE_KEY_TITLES[key],
    })
  )
);

/**
 * @param {string} pathOnly
 */
function normalizePathOnly(pathOnly) {
  const raw = String(pathOnly || "/").split("?")[0] || "/";
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/**
 * @param {string} pathOnly
 * @returns {string|null}
 */
function pageKeyFromPath(pathOnly) {
  const normalized = normalizePathOnly(pathOnly);
  return PATH_TO_PAGE_KEY[normalized] || null;
}

/**
 * @param {string} pathOnly
 */
function isTenantPublicPagePath(pathOnly) {
  return pageKeyFromPath(pathOnly) != null;
}

/**
 * Parse /branches/:branchKey(/page)? for tenant-host mini websites.
 * @param {string} pathOnly
 * @returns {{ branchKey: string, pageKey: string, suffixPath: string }|null}
 */
function parseTenantBranchPublicPath(pathOnly) {
  const normalized = normalizePathOnly(pathOnly);
  const m = /^\/branches\/([^/]+)(?:\/(.*))?$/.exec(normalized);
  if (!m) return null;
  const branchKey = normalizeBranchKey(m[1]);
  if (!branchKey || branchKey !== String(m[1] || "").trim().toLowerCase()) return null;
  const rest = m[2] != null && String(m[2]).trim() !== "" ? `/${m[2]}` : "/";
  const pageKey = pageKeyFromPath(rest);
  if (!pageKey) return null;
  return { branchKey, pageKey, suffixPath: rest === "/" ? "" : rest };
}

/**
 * @param {string} pathOnly
 */
function isTenantPublicBranchPagePath(pathOnly) {
  return parseTenantBranchPublicPath(pathOnly) != null;
}

/** Public action paths (forms) that use tenant context but are not CMS pages. */
const TENANT_PUBLIC_ACTION_PATHS = Object.freeze([
  "/register",
  "/register/submitted",
  "/sitemap.xml",
  "/robots.txt",
]);

/**
 * @param {string} pathOnly
 */
function isTenantPublicActionPath(pathOnly) {
  return TENANT_PUBLIC_ACTION_PATHS.includes(normalizePathOnly(pathOnly));
}

/**
 * CMS pages, public action forms, or public media delivery that need
 * authoritative tenant resolution.
 * @param {string} pathOnly
 */
function isTenantPublicSurfacePath(pathOnly) {
  return (
    isTenantPublicPagePath(pathOnly) ||
    isTenantPublicBranchPagePath(pathOnly) ||
    isTenantPublicActionPath(pathOnly) ||
    isTenantPublicMediaPath(pathOnly)
  );
}

/**
 * Public bytes delivery (/_bb/media/:id) — not CMS HTML, but must resolve tenant church.
 * @param {string} pathOnly
 */
function isTenantPublicMediaPath(pathOnly) {
  return normalizePathOnly(pathOnly).startsWith("/_bb/media");
}

module.exports = {
  PATH_TO_PAGE_KEY,
  PAGE_KEY_TO_PATH,
  PAGE_SUFFIXES,
  NAV_ITEMS,
  TENANT_PUBLIC_ACTION_PATHS,
  pageKeyFromPath,
  isTenantPublicPagePath,
  parseTenantBranchPublicPath,
  isTenantPublicBranchPagePath,
  isTenantPublicActionPath,
  isTenantPublicMediaPath,
  isTenantPublicSurfacePath,
  normalizePathOnly,
};
