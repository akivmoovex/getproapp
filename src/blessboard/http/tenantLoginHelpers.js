"use strict";

/**
 * Helpers for BlessBoard V5 tenant ↔ apex login transfer (no shared Domain cookie).
 */

const pathPosix = require("path").posix;
const { resolveTenantForAuthorization } = require("./loadBlessBoardAuthorizationContext");
const { sanitizeReturnPath, normalizeHostname } = require("../../platform/services/authTransferService");

/**
 * Resolved tenant for login initiation (authoritative or proposed shadow).
 * @param {import('express').Request} req
 */
function resolveTenantForLogin(req) {
  return resolveTenantForAuthorization(req);
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function safeTenantNextPath(raw) {
  return sanitizeReturnPath(raw);
}

/**
 * Apex-only safe return path for platform-admin post-login redirects.
 * Accepts only local `/admin` or `/admin/...` paths (no open redirects).
 * @param {unknown} raw
 * @returns {string | null}
 */
function safePlatformAdminNextPath(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return null;
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (/[\s\\?]/.test(s)) return null;

  let decoded = s;
  try {
    decoded = decodeURIComponent(s);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return null;

  const pathOnly = decoded.split("#")[0].split("?")[0];
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return null;

  const normalized = pathPosix.normalize(pathOnly);
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes("..")) return null;
  if (normalized !== "/admin" && !normalized.startsWith("/admin/")) return null;
  if (normalized.length > 200) return null;
  return normalized;
}

/**
 * @param {Array<{ roleKey?: string, role_key?: string } | string>} roles
 * @returns {boolean}
 */
function hasPlatformAdminRole(roles) {
  return (roles || []).some((r) => {
    if (typeof r === "string") return r === "platform_admin";
    return String(r.roleKey || r.role_key || "") === "platform_admin";
  });
}

/**
 * Apex-only safe return path for HQ post-login redirects.
 * Accepts only local `/hq` or `/hq/...` paths (no open redirects).
 * @param {unknown} raw
 * @returns {string | null}
 */
function safeHqNextPath(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return null;
  if (!s.startsWith("/") || s.startsWith("//")) return null;
  if (/[\s\\?]/.test(s)) return null;

  let decoded = s;
  try {
    decoded = decodeURIComponent(s);
  } catch {
    return null;
  }
  if (decoded.includes("\\") || decoded.includes("\0")) return null;

  const pathOnly = decoded.split("#")[0].split("?")[0];
  if (!pathOnly.startsWith("/") || pathOnly.startsWith("//")) return null;

  const normalized = pathPosix.normalize(pathOnly);
  if (!normalized.startsWith("/") || normalized.startsWith("//")) return null;
  if (normalized.includes("..")) return null;
  if (normalized !== "/hq" && !normalized.startsWith("/hq/")) return null;
  if (normalized.startsWith("/hq-admin")) return null;
  if (normalized.length > 200) return null;
  return normalized;
}

/**
 * @param {Array<{ roleKey?: string, role_key?: string } | string>} roles
 * @returns {boolean}
 */
function hasChurchHqAdminRole(roles) {
  return (roles || []).some((r) => {
    if (typeof r === "string") return r === "church_hq_admin";
    return String(r.roleKey || r.role_key || "") === "church_hq_admin";
  });
}

/**
 * Apex post-login destination (no tenant transfer).
 * Platform admins → `/admin`; HQ admins → `/hq` (session-scoped tenant on apex);
 * everyone else → `/account`.
 * @param {Array<{ roleKey?: string, role_key?: string }>} roles
 * @param {unknown} nextRaw
 * @returns {string}
 */
function resolveApexPostLoginPath(roles, nextRaw) {
  if (hasPlatformAdminRole(roles)) {
    return safePlatformAdminNextPath(nextRaw) || "/admin";
  }
  if (hasChurchHqAdminRole(roles)) {
    return safeHqNextPath(nextRaw) || "/hq";
  }
  return "/account";
}

/**
 * @param {Array<{ roleKey?: string, role_key?: string }>} roles
 * @returns {string}
 */
function defaultTenantPostLoginPath(roles) {
  const keys = (roles || []).map((r) => String(r.roleKey || r.role_key || ""));
  if (keys.includes("church_hq_admin") || keys.includes("platform_admin")) {
    return "/hq";
  }
  if (keys.includes("branch_admin")) {
    return "/branch-admin";
  }
  return "/member";
}

/**
 * Public origin for apex redirects (scheme + host, no trailing slash).
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [apexHost]
 */
function getApexOrigin(env, apexHost) {
  const source = env || process.env;
  const configured = String(source.BLESSBOARD_APEX_ORIGIN || "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const scheme = String(source.PUBLIC_SCHEME || "https").trim().toLowerCase() || "https";
  const host = String(apexHost || "blessboard.org")
    .trim()
    .toLowerCase()
    .split(":")[0];
  return `${scheme}://${host || "blessboard.org"}`;
}

/**
 * Absolute URL on a validated hostname (no open redirects).
 * @param {string} hostname
 * @param {string} pathWithQuery
 * @param {NodeJS.ProcessEnv} [env]
 */
function tenantAbsoluteUrl(hostname, pathWithQuery, env) {
  const host = normalizeHostname(hostname);
  const path = String(pathWithQuery || "");
  if (!host || !path.startsWith("/")) return null;
  const source = env || process.env;
  const scheme = String(source.PUBLIC_SCHEME || "https").trim().toLowerCase() || "https";
  return `${scheme}://${host}${path}`;
}

/**
 * Redact transfer query params from log URLs.
 * @param {string} url
 */
function redactAuthTransferQuery(url) {
  return String(url || "")
    .replace(/([?&])(tr|code|transfer)=([^&#]*)/gi, "$1$2=REDACTED");
}

module.exports = {
  resolveTenantForLogin,
  safeTenantNextPath,
  safePlatformAdminNextPath,
  safeHqNextPath,
  hasPlatformAdminRole,
  hasChurchHqAdminRole,
  resolveApexPostLoginPath,
  defaultTenantPostLoginPath,
  getApexOrigin,
  tenantAbsoluteUrl,
  redactAuthTransferQuery,
  sanitizeReturnPath,
  normalizeHostname,
};
