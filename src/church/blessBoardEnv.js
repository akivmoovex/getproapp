"use strict";

/**
 * Central BlessBoard deployment configuration (env-driven, V4-compatible defaults).
 *
 * V4 / blessboard.com defaults are preserved when these vars are unset.
 * V5 / blessboard.org sets BLESSBOARD_CANONICAL_DOMAIN=blessboard.org (and related vars).
 */

const path = require("path");

const DEFAULT_CANONICAL_DOMAIN = "blessboard.com";
const DEFAULT_SESSION_COOKIE_NAME = "getpro_sid";
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const DEFAULT_UPLOAD_ROOT = path.join(PROJECT_ROOT, "data", "uploads");

/** Apex aliases used only when canonical is the V4 default (blessboard.com). */
const DEFAULT_COM_APEX_ALIASES = [
  "blessboard.com",
  "www.blessboard.com",
  "blessboard.org",
  "www.blessboard.org",
];

function normalizeHost(host) {
  return String(host || "")
    .toLowerCase()
    .trim()
    .split(":")[0];
}

function envTrim(name) {
  const v = process.env[name];
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Canonical BlessBoard public domain (no www).
 * Priority:
 * 1. BLESSBOARD_CANONICAL_DOMAIN
 * 2. First non-www host from BLESSBOARD_APEX_DOMAINS (when explicitly set)
 * 3. CHURCH_HOST_DOMAIN
 * 4. blessboard.com
 *
 * (2) prevents V5 Hostinger configs that list only .org apex hosts while leaving
 * CHURCH_HOST_DOMAIN=blessboard.com from silently redirecting .org → .com.
 */
function getBlessBoardCanonicalDomain() {
  const explicit = normalizeHost(envTrim("BLESSBOARD_CANONICAL_DOMAIN"));
  if (explicit) return explicit;

  const apexFromEnv = parseApexDomainsFromEnv();
  if (apexFromEnv && apexFromEnv.length) {
    const nonWww = apexFromEnv.find((h) => h && !h.startsWith("www."));
    if (nonWww) return nonWww;
    const first = apexFromEnv[0];
    if (first.startsWith("www.") && first.length > 4) return first.slice(4);
    return first;
  }

  const church = normalizeHost(envTrim("CHURCH_HOST_DOMAIN"));
  return church || DEFAULT_CANONICAL_DOMAIN;
}

/**
 * Tenant DNS base (e.g. blessboard.com → *.blessboard.com).
 * Same resolution as canonical unless CHURCH_HOST_DOMAIN is set alone.
 */
function getChurchHostDomain() {
  const churchOnly = normalizeHost(envTrim("CHURCH_HOST_DOMAIN"));
  if (churchOnly) return churchOnly;
  return getBlessBoardCanonicalDomain();
}

/**
 * Absolute public marketing URL (no trailing slash), e.g. https://blessboard.com
 */
function getBlessBoardPublicUrl() {
  const fromEnv = envTrim("BLESSBOARD_PUBLIC_URL").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return `https://${getBlessBoardCanonicalDomain()}`;
}

/**
 * Absolute platform-admin base URL (no trailing slash).
 */
function getBlessBoardAdminUrl() {
  const fromEnv = envTrim("BLESSBOARD_ADMIN_URL").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return getBlessBoardPublicUrl();
}

/**
 * @returns {string[]|null}
 */
function parseApexDomainsFromEnv() {
  const raw = envTrim("BLESSBOARD_APEX_DOMAINS");
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((part) => normalizeHost(part))
    .filter(Boolean);
  return list.length ? list : null;
}

/**
 * Default apex list when BLESSBOARD_APEX_DOMAINS is unset.
 * - Canonical blessboard.com → include .org aliases (V4 redirect-to-.com behaviour)
 * - Any other canonical → only that host + www (no cross-TLD aliases)
 */
function defaultApexDomainsForCanonical(canonical) {
  if (canonical === DEFAULT_CANONICAL_DOMAIN) {
    return DEFAULT_COM_APEX_ALIASES.slice();
  }
  return [canonical, `www.${canonical}`];
}

/**
 * Apex hosts that serve BlessBoard platform marketing/admin (not tenants).
 * Always includes the canonical domain and www.{canonical}.
 * @returns {Set<string>}
 */
function getBlessBoardApexDomainSet() {
  const canonical = getBlessBoardCanonicalDomain();
  const fromEnv = parseApexDomainsFromEnv();
  const list =
    fromEnv && fromEnv.length ? fromEnv.slice() : defaultApexDomainsForCanonical(canonical);
  if (!list.includes(canonical)) list.push(canonical);
  const wwwCanonical = `www.${canonical}`;
  if (!list.includes(wwwCanonical)) list.push(wwwCanonical);
  return new Set(list.map(normalizeHost).filter(Boolean));
}

function isBlessBoardApexDomain(host) {
  const clean = normalizeHost(host);
  if (!clean) return false;
  return getBlessBoardApexDomainSet().has(clean);
}

/**
 * express-session cookie name. Default getpro_sid (V4-compatible).
 */
function getSessionCookieName() {
  const name = envTrim("SESSION_COOKIE_NAME");
  return name || DEFAULT_SESSION_COOKIE_NAME;
}

/**
 * Absolute filesystem root for uploads (parent of church/, intake/, etc.).
 */
function getUploadRoot() {
  const fromEnv = envTrim("UPLOAD_ROOT");
  if (fromEnv) return path.resolve(fromEnv);
  return DEFAULT_UPLOAD_ROOT;
}

/**
 * Church-specific upload root: {UPLOAD_ROOT}/church
 */
function getChurchUploadRoot() {
  return path.join(getUploadRoot(), "church");
}

/**
 * Safe upload-root label for logs (redacts /Users/<name> and /home/<name>).
 */
function getUploadRootLogLabel() {
  return String(getUploadRoot()).replace(/(\/Users\/|\/home\/)[^/]+/g, "$1***");
}

/**
 * Master switch for BlessBoard scheduled/cron jobs.
 * Default true (V4-compatible). Set BLESSBOARD_JOBS_ENABLED=0|false|no|off to disable.
 * Manual web workflows are unaffected — only cron/ops entrypoints should check this.
 */
function areBlessBoardJobsEnabled() {
  const raw = envTrim("BLESSBOARD_JOBS_ENABLED").toLowerCase();
  if (!raw) return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return true;
}

/**
 * Deployment label for diagnostics (e.g. production, staging, testing, v5-org).
 */
function getDeploymentEnv() {
  const fromEnv = envTrim("DEPLOYMENT_ENV");
  if (fromEnv) return fromEnv;
  const nodeEnv = envTrim("NODE_ENV");
  return nodeEnv || "development";
}

/**
 * True for BlessBoard.org V5 testing deployments that must use an explicit DATABASE_URL
 * (no silent GETPRO_DATABASE_URL fallback).
 * Trigger: DEPLOYMENT_ENV=testing AND BLESSBOARD_CANONICAL_DOMAIN=blessboard.org
 */
function isBlessBoardOrgTestingDeployment() {
  const deployment = getDeploymentEnv().toLowerCase();
  if (deployment !== "testing") return false;
  return getBlessBoardCanonicalDomain() === "blessboard.org";
}

/**
 * Optional EXPECTED_DATABASE_ENV — when set, must match DEPLOYMENT_ENV (application marker).
 * There is no whole-database environment row in schema; org-level data_environment is unrelated.
 * @returns {{ ok: true } | { ok: false, expected: string, actual: string }}
 */
function validateExpectedDatabaseEnv() {
  const expected = envTrim("EXPECTED_DATABASE_ENV");
  if (!expected) return { ok: true };
  const actual = getDeploymentEnv();
  if (expected.toLowerCase() === actual.toLowerCase()) return { ok: true };
  return { ok: false, expected, actual };
}

module.exports = {
  DEFAULT_CANONICAL_DOMAIN,
  DEFAULT_COM_APEX_ALIASES,
  DEFAULT_SESSION_COOKIE_NAME,
  DEFAULT_UPLOAD_ROOT,
  normalizeHost,
  getBlessBoardCanonicalDomain,
  getChurchHostDomain,
  getBlessBoardPublicUrl,
  getBlessBoardAdminUrl,
  getBlessBoardApexDomainSet,
  isBlessBoardApexDomain,
  getSessionCookieName,
  getUploadRoot,
  getChurchUploadRoot,
  getUploadRootLogLabel,
  areBlessBoardJobsEnabled,
  getDeploymentEnv,
  isBlessBoardOrgTestingDeployment,
  validateExpectedDatabaseEnv,
  parseApexDomainsFromEnv,
  defaultApexDomainsForCanonical,
};
