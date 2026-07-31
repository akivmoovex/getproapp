"use strict";

/**
 * Map HQ branch website/editor mounts onto church-wide paths for single_site mode.
 * Auth-gated admin paths only (303). Does not touch public /branches URLs.
 */

const { normalizePathOnly } = require("./tenantPublicPaths");

/**
 * @param {string} pathOnly
 * @returns {string|null} church-wide HQ path, or null if not a branch mount
 */
function canonicalChurchWideHqContentPath(pathOnly) {
  const path = normalizePathOnly(pathOnly);
  let m = /^\/hq\/content\/b\/[^/]+(\/.*)?$/.exec(path);
  if (m) {
    const rest = m[1] || "";
    return `/hq/content${rest === "/" ? "" : rest}` || "/hq/content";
  }
  m = /^\/hq\/website\/branches\/[^/]+(\/.*)?$/.exec(path);
  if (m) {
    const rest = m[1] || "";
    if (!rest || rest === "/") return "/hq/website";
    // CMS preview / page editors share the church-wide content mount.
    if (
      /^\/(preview|draft-preview|pages)(\/|$)/.test(rest) ||
      /^\/(leadership|ministries|events|sermons|contact|giving)(\/|$)/.test(rest)
    ) {
      return `/hq/content${rest}`;
    }
    // Publish / service-times / settings stay under church-wide website hub when possible.
    if (/^\/(publish|details|service-times|settings)(\/|$)/.test(rest)) {
      return `/hq/website${rest}`;
    }
    return `/hq/content${rest}`;
  }
  return null;
}

/**
 * True when the request path is already church-wide (no branch segment).
 * @param {string} pathOnly
 */
function isChurchWideHqContentPath(pathOnly) {
  const path = normalizePathOnly(pathOnly);
  if (path === "/hq/content" || path.startsWith("/hq/content/")) {
    return !path.startsWith("/hq/content/b/");
  }
  if (path === "/hq/website" || path.startsWith("/hq/website/")) {
    return !path.startsWith("/hq/website/branches/");
  }
  return false;
}

module.exports = {
  canonicalChurchWideHqContentPath,
  isChurchWideHqContentPath,
};
