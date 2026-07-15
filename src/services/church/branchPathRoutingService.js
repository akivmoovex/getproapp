"use strict";

/**
 * Growth branch path routing helpers.
 * Hostname resolution is unchanged; path routing is additive under /branches/:slug.
 */

const { resolvePackageFromPlanCode } = require("../../church/blessBoardPackageCatalogue");
const { getNumericLimit } = require("./churchEntitlementService");
const { branchPathSlug, normalizeSlug, validateBranchPathSlug } = require("../../church/branchPathSlug");
const { TENANT_PUBLIC_PATHS } = require("../../church/churchTenantPublicSeo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { churchPublicUrl } = require("../../church/platformProvisioningValidation");

const BRANCH_PATH_PREFIX_RE = /^\/branches\/([^/]+)(?:(\/.*)?)?$/i;

/**
 * @param {object | null} org
 * @returns {boolean}
 */
function organisationAllowsBranchPaths(org) {
  if (!org) return false;
  const resolved = resolvePackageFromPlanCode(org.plan_code);
  const plan = {
    packageCode: resolved.packageCode,
    entitlements: resolved.packageDefinition.entitlements,
  };
  const maxActive = getNumericLimit(plan, "branches.max_active");
  // Growth (unlimited / fair use / null) may use path routing; Foundation (1) does not.
  if (maxActive === 1) return false;
  if (resolved.packageCode === "growth") return true;
  return maxActive == null || maxActive > 1;
}

/**
 * @param {string} pathname
 * @returns {{ branchSlug: string, restPath: string } | null}
 */
function parseBranchPath(pathname) {
  const path = String(pathname || "").split("?")[0] || "/";
  const m = path.match(BRANCH_PATH_PREFIX_RE);
  if (!m) return null;
  const branchSlug = normalizeSlug(m[1]);
  if (!branchSlug) return null;
  let rest = m[2] != null ? String(m[2]) : "/";
  if (!rest.startsWith("/")) rest = `/${rest}`;
  if (rest === "") rest = "/";
  return { branchSlug, restPath: rest };
}

/**
 * Strip /branches/:slug for rewrite to existing public handlers.
 * @param {string} restPath e.g. /events
 */
function publicPageKeyFromRestPath(restPath) {
  const p = String(restPath || "/");
  if (p === "/" || p === "") return "home";
  const cleaned = p.replace(/\/$/, "") || "/";
  for (const [key, route] of Object.entries(TENANT_PUBLIC_PATHS)) {
    if (route === cleaned) return key;
  }
  return null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {string} branchSlug
 */
async function findOrganisationBranchByPathSlug(pool, organizationId, branchSlug) {
  const validated = validateBranchPathSlug(branchSlug);
  if (!validated.ok) return null;
  return branchesRepo.findBranchBySlug(pool, organizationId, validated.slug);
}

/**
 * Canonical public path for a branch on the primary (host) church hostname.
 * Primary host branch → root paths. Sibling Growth branch → /branches/{slug}/...
 *
 * @param {{ hostBranch: object, contentBranch: object, pageKey?: string }} opts
 */
function buildCanonicalPublicPath(opts) {
  const pageKey = opts.pageKey || "home";
  const leaf = TENANT_PUBLIC_PATHS[pageKey] || "/";
  const hostSlug = branchPathSlug(opts.hostBranch);
  const contentSlug = branchPathSlug(opts.contentBranch);
  if (!contentSlug) return leaf;
  if (Number(opts.hostBranch.id) === Number(opts.contentBranch.id) || hostSlug === contentSlug) {
    return leaf;
  }
  if (leaf === "/") return `/branches/${contentSlug}`;
  return `/branches/${contentSlug}${leaf}`;
}

/**
 * Absolute public URL for a campus (uses host branch DNS; Growth siblings use path).
 * @param {object} hostBranch - branch owning the hostname
 * @param {object} contentBranch
 * @param {string} [pageKey]
 */
function buildPublicBranchAbsoluteUrl(hostBranch, contentBranch, pageKey = "home") {
  const hostDns = String(hostBranch.host_slug || hostBranch.slug || "")
    .toLowerCase()
    .trim();
  if (!hostDns) return "";
  const path = buildCanonicalPublicPath({ hostBranch, contentBranch, pageKey });
  return churchPublicUrl(hostDns, path === "/" ? "" : path);
}

/**
 * @param {object} branch
 */
function isPubliclyActiveBranch(branch) {
  return branch && String(branch.status || "") === "active";
}

module.exports = {
  organisationAllowsBranchPaths,
  parseBranchPath,
  publicPageKeyFromRestPath,
  findOrganisationBranchByPathSlug,
  buildCanonicalPublicPath,
  buildPublicBranchAbsoluteUrl,
  isPubliclyActiveBranch,
  branchPathSlug,
};
