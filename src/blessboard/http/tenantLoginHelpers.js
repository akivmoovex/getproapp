"use strict";

/**
 * Helpers for BlessBoard V5 tenant ↔ apex login transfer (no shared Domain cookie).
 */

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
  defaultTenantPostLoginPath,
  getApexOrigin,
  tenantAbsoluteUrl,
  redactAuthTransferQuery,
  sanitizeReturnPath,
  normalizeHostname,
};
