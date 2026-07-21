"use strict";

/**
 * Server-side church URL helper for V5 testing path routing and HQ surfaces.
 * Does not invent unsupported wildcard hosts.
 */

const { normalizeOrganizationKey } = require("../services/organizationKey");

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
  const allowed = new Set([
    "about",
    "leadership",
    "ministries",
    "events",
    "sermons",
    "contact",
    "giving",
  ]);
  if (!allowed.has(key)) return null;
  return `${home}/${key}`;
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
  hqContentPagePath,
  hqPreviewPagePath,
  hqWebsitePath,
  hqDashboardPath,
};
