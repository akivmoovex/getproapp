"use strict";

/**
 * Single-site public routing: collapse /branches/:key… onto the church-wide URL.
 * Uses 301 to match Growth branch-path canonical collapse and BlessBoard host redirects.
 *
 * Does not preserve query strings (same as requirePublicBranchPath collapse).
 * Callers must only invoke this after server-side confirmation that:
 *   - the branch is active and owned by the church, and
 *   - website mode is single_site.
 */

const { publicChurchPagePath } = require("../urls/churchUrlHelper");
const { PAGE_KEY_TO_PATH, normalizePathOnly } = require("./tenantPublicPaths");

const PERMANENT_REDIRECT_STATUS = 301;

/**
 * Church-wide public path for a CMS page key.
 * @param {{
 *   routingMode: 'path'|'tenant',
 *   organizationKey?: string|null,
 *   pageKey: string,
 * }} input
 * @returns {string|null}
 */
function churchWidePublicPathForPage(input) {
  const pageKey = String((input && input.pageKey) || "home")
    .trim()
    .toLowerCase();
  if (!pageKey || !PAGE_KEY_TO_PATH[pageKey]) return null;

  if (input.routingMode === "tenant") {
    return PAGE_KEY_TO_PATH[pageKey];
  }

  return publicChurchPagePath(input.organizationKey, pageKey);
}

/**
 * True when a Location target would be unsafe or a loop.
 * @param {string} currentPathOnly
 * @param {string} targetPathOnly
 */
function isUnsafeSingleSiteRedirectTarget(currentPathOnly, targetPathOnly) {
  const current = normalizePathOnly(currentPathOnly);
  const target = normalizePathOnly(targetPathOnly);
  if (!target) return true;
  if (target === current) return true;
  // Never redirect back onto a branch mini-site path.
  if (/(^|\/)branches\//.test(target)) return true;
  // Tenant targets must be church-wide page paths; path-public must stay under /c/:org.
  return false;
}

/**
 * Permanent redirect to the unified church-wide URL. Returns true if sent.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   routingMode: 'path'|'tenant',
 *   organizationKey?: string|null,
 *   pageKey: string,
 * }} input
 */
function redirectSingleSiteBranchToChurchWide(req, res, input) {
  const target = churchWidePublicPathForPage(input);
  const current = String((req && req.path) || "/").split("?")[0] || "/";
  if (!target || isUnsafeSingleSiteRedirectTarget(current, target)) {
    return false;
  }
  res.redirect(PERMANENT_REDIRECT_STATUS, target);
  return true;
}

module.exports = {
  PERMANENT_REDIRECT_STATUS,
  churchWidePublicPathForPage,
  isUnsafeSingleSiteRedirectTarget,
  redirectSingleSiteBranchToChurchWide,
};
