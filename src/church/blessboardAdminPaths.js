"use strict";

/**
 * Canonical BlessBoard platform admin paths (blessboard.com apex only).
 */
const BLESSBOARD_ADMIN = {
  login: "/admin/login",
  dashboard: "/admin/dashboard",
  churches: "/admin/churches",
  churchesNew: "/admin/churches/new",
  churchDetail: (id) => `/admin/churches/${id}`,
  diagnostics: "/admin/diagnostics",
};

/** Legacy GetPro-mounted church admin paths (redirect away from getproapp.org). */
const LEGACY_GETPRO_CHURCH_ADMIN_PREFIX = "/admin/church";

/**
 * Rewrite incoming blessboard admin paths to internal church platform router paths.
 * @param {string} method
 * @param {string} path - Path relative to /admin mount (leading slash).
 * @returns {string | null} Rewritten path or null if no rewrite.
 */
function rewriteBlessBoardAdminPathToInternal(method, path) {
  const p = String(path || "");
  if (p === "/dashboard" || p === "/dashboard/") return "/church";
  if (p === "/diagnostics" || p === "/diagnostics/") return "/church/diagnostics";
  if (p === "/churches" || p === "/churches/") return "/church/organizations";
  if (p === "/churches/new" || p === "/churches/new/") return "/church/organizations/new";
  const detail = p.match(/^\/churches\/(\d+)\/?$/);
  if (detail) return `/church/organizations/${detail[1]}`;
  if (method === "POST" && (p === "/churches" || p === "/churches/")) return "/church/organizations";
  return null;
}

/**
 * Map legacy getproapp.org church admin path to blessboard.com canonical path.
 * @param {string} adminPath - Full path starting with /admin/...
 * @returns {string | null}
 */
function mapLegacyGetProChurchAdminPathToBlessBoard(adminPath) {
  const p = String(adminPath || "");
  if (p === "/admin/church" || p === "/admin/church/") return BLESSBOARD_ADMIN.dashboard;
  if (p === "/admin/church/diagnostics" || p === "/admin/church/diagnostics/") {
    return BLESSBOARD_ADMIN.diagnostics;
  }
  if (p === "/admin/church/organizations" || p === "/admin/church/organizations/") {
    return BLESSBOARD_ADMIN.churches;
  }
  if (p === "/admin/church/organizations/new" || p === "/admin/church/organizations/new/") {
    return BLESSBOARD_ADMIN.churchesNew;
  }
  if (p === "/admin/church/branches/new" || p === "/admin/church/branches/new/") {
    return BLESSBOARD_ADMIN.churchesNew;
  }
  const orgDetail = p.match(/^\/admin\/church\/organizations\/(\d+)(\/.*)?$/);
  if (orgDetail) {
    const suffix = orgDetail[2] || "";
    return `${BLESSBOARD_ADMIN.churchDetail(orgDetail[1])}${suffix}`;
  }
  if (p.startsWith("/admin/church/")) {
    return p.replace("/admin/church", "/admin");
  }
  return null;
}

/**
 * True when path is BlessBoard platform admin (not branch/member login).
 * @param {string} path - Relative to /admin mount.
 */
function isBlessBoardPlatformAdminPath(path) {
  const p = String(path || "");
  return (
    p === "/dashboard" ||
    p.startsWith("/dashboard/") ||
    p === "/diagnostics" ||
    p.startsWith("/diagnostics/") ||
    p.startsWith("/churches") ||
    p.startsWith("/church")
  );
}

/**
 * Organization detail URL for current admin context.
 * @param {import("express").Request} req
 * @param {number|string} organizationId
 * @param {string} [query]
 */
function organizationAdminDetailPath(req, organizationId, query = "") {
  if (req && req.blessboardAdminMode) {
    return `${BLESSBOARD_ADMIN.churchDetail(organizationId)}${query}`;
  }
  return `/admin/church/organizations/${organizationId}${query}`;
}

module.exports = {
  BLESSBOARD_ADMIN,
  LEGACY_GETPRO_CHURCH_ADMIN_PREFIX,
  rewriteBlessBoardAdminPathToInternal,
  mapLegacyGetProChurchAdminPathToBlessBoard,
  isBlessBoardPlatformAdminPath,
  organizationAdminDetailPath,
};
