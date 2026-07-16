"use strict";

/**
 * Central BlessBoard deployment configuration (env-driven, V4-compatible defaults).
 *
 * V4 / blessboard.com defaults are preserved when these vars are unset.
 * V5 / blessboard.org sets BLESSBOARD_CANONICAL_DOMAIN=blessboard.org (and related vars).
 *
 * Values are read from process.env on each call (never captured at require-time).
 * Bootstrap / Hostinger env must be loaded before church domain middleware runs.
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

/**
 * Trim env values and strip a single layer of wrapping quotes (Hostinger / dotenv quirks).
 * Does not strip quotes around comma-separated lists — those are handled per-segment.
 */
function envTrim(name) {
  const v = process.env[name];
  if (v == null) return "";
  let s = String(v).trim();
  if (s.includes(",")) return s;
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

function stripWrappingQuotes(value) {
  let s = String(value || "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

/**
 * True when an env flag is explicitly off. Accepts 0 / false / no / off (case-insensitive).
 * Empty / unset is not disabled.
 */
function isEnvFlagDisabled(name) {
  const raw = envTrim(name).toLowerCase();
  return raw === "0" || raw === "false" || raw === "no" || raw === "off";
}

function hostFromAbsoluteUrl(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    return normalizeHost(new URL(withScheme).hostname);
  } catch {
    return "";
  }
}

function canonicalFromApexList(apexList) {
  if (!apexList || !apexList.length) return "";
  const nonWww = apexList.find((h) => h && !h.startsWith("www."));
  if (nonWww) return nonWww;
  const first = apexList[0];
  if (first.startsWith("www.") && first.length > 4) return first.slice(4);
  return first;
}

/**
 * Canonical BlessBoard public domain (no www).
 * Priority:
 * 1. BLESSBOARD_CANONICAL_DOMAIN when it belongs to BLESSBOARD_APEX_DOMAINS (if apex is set)
 * 2. First non-www host from BLESSBOARD_APEX_DOMAINS (when explicitly set)
 * 3. BLESSBOARD_CANONICAL_DOMAIN (when apex list unset)
 * 4. Host from BLESSBOARD_PUBLIC_URL
 * 5. CHURCH_HOST_DOMAIN
 * 6. blessboard.com
 *
 * When apex is org-only, a leftover CANONICAL_DOMAIN=blessboard.com is ignored so
 * .org is not treated as an alias of .com.
 */
function getBlessBoardCanonicalDomain() {
  const explicit = normalizeHost(envTrim("BLESSBOARD_CANONICAL_DOMAIN"));
  const apexFromEnv = parseApexDomainsFromEnv();

  if (apexFromEnv && apexFromEnv.length) {
    if (explicit && apexFromEnv.includes(explicit)) return explicit;
    const fromApex = canonicalFromApexList(apexFromEnv);
    if (fromApex) return fromApex;
  }

  if (explicit) return explicit;

  const fromPublic = hostFromAbsoluteUrl(envTrim("BLESSBOARD_PUBLIC_URL"));
  if (fromPublic) return fromPublic.replace(/^www\./, "");

  const church = normalizeHost(envTrim("CHURCH_HOST_DOMAIN"));
  return church || DEFAULT_CANONICAL_DOMAIN;
}

/**
 * Tenant DNS base (e.g. blessboard.com → *.blessboard.com).
 * Prefer CHURCH_HOST_DOMAIN when set, unless an explicit BLESSBOARD_APEX_DOMAINS list
 * does not include that host (leftover .com on a .org-only V5 app).
 */
function getChurchHostDomain() {
  const churchOnly = normalizeHost(envTrim("CHURCH_HOST_DOMAIN"));
  const canonical = getBlessBoardCanonicalDomain();
  if (!churchOnly) return canonical;

  const apexFromEnv = parseApexDomainsFromEnv();
  if (
    apexFromEnv &&
    apexFromEnv.length &&
    churchOnly !== canonical &&
    !apexFromEnv.includes(churchOnly) &&
    !apexFromEnv.includes(`www.${churchOnly}`)
  ) {
    return canonical;
  }
  return churchOnly;
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
    .map((part) => normalizeHost(stripWrappingQuotes(part)))
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
 * When BLESSBOARD_APEX_DOMAINS is set, that list is authoritative (plus www.{canonical}
 * only when canonical is already in the list). Never force-adds a foreign TLD.
 * @returns {Set<string>}
 */
function getBlessBoardApexDomainSet() {
  const fromEnv = parseApexDomainsFromEnv();
  const canonical = getBlessBoardCanonicalDomain();

  let list;
  if (fromEnv && fromEnv.length) {
    list = fromEnv.slice();
    // Keep www companion for the effective canonical when that host is in the deployment list.
    if (list.includes(canonical)) {
      const wwwCanonical = `www.${canonical}`;
      if (!list.includes(wwwCanonical)) list.push(wwwCanonical);
    }
  } else {
    list = defaultApexDomainsForCanonical(canonical);
    if (!list.includes(canonical)) list.push(canonical);
    const wwwCanonical = `www.${canonical}`;
    if (!list.includes(wwwCanonical)) list.push(wwwCanonical);
  }

  return new Set(list.map(normalizeHost).filter(Boolean));
}

function isBlessBoardApexDomain(host) {
  const clean = normalizeHost(host);
  if (!clean) return false;
  return getBlessBoardApexDomainSet().has(clean);
}

/**
 * Apex-host remapping (www / alias → canonical). Default on.
 * BLESSBOARD_CANONICAL_REDIRECT=0|false|no|off disables host remap only.
 */
function isCanonicalHostRedirectEnabled() {
  return !isEnvFlagDisabled("BLESSBOARD_CANONICAL_REDIRECT");
}

/**
 * HTTPS enforcement for BlessBoard product hosts. Default on.
 * BLESSBOARD_FORCE_HTTPS=0|false|no|off disables.
 */
function isBlessBoardForceHttpsEnabled() {
  return !isEnvFlagDisabled("BLESSBOARD_FORCE_HTTPS");
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
  if (!envTrim("BLESSBOARD_JOBS_ENABLED")) return true;
  return !isEnvFlagDisabled("BLESSBOARD_JOBS_ENABLED");
}

/** Accepted DEPLOYMENT_ENV modes for demo visibility / seed gates (not NODE_ENV). */
const DEPLOYMENT_ENV_TESTING = "testing";
const DEPLOYMENT_ENV_PRODUCTION = "production";

let deploymentEnvFallbackWarned = false;

/**
 * Raw deployment label for diagnostics (e.g. production, staging, testing, v5-org).
 * Prefer {@link getDeploymentEnvMode} / {@link isTestingDeployment} for policy gates.
 * Does not invent a production/testing mode from NODE_ENV alone for those gates.
 */
function getDeploymentEnv() {
  const fromEnv = envTrim("DEPLOYMENT_ENV");
  if (fromEnv) return fromEnv;
  const nodeEnv = envTrim("NODE_ENV");
  return nodeEnv || "development";
}

/**
 * Authoritative deployment mode for demo visibility and seed safety.
 * Reads DEPLOYMENT_ENV only (case-insensitive, trimmed). Does not use NODE_ENV.
 * Accepted: "testing" | "production". Missing or unknown → "production" (safe: hide demos).
 * @returns {"testing"|"production"}
 */
function getDeploymentEnvMode() {
  const raw = envTrim("DEPLOYMENT_ENV").toLowerCase();
  if (raw === DEPLOYMENT_ENV_TESTING) return DEPLOYMENT_ENV_TESTING;
  if (raw === DEPLOYMENT_ENV_PRODUCTION) return DEPLOYMENT_ENV_PRODUCTION;
  if (!deploymentEnvFallbackWarned) {
    deploymentEnvFallbackWarned = true;
    const reason = raw
      ? `unrecognised DEPLOYMENT_ENV value (expected testing|production)`
      : "DEPLOYMENT_ENV unset";
    // eslint-disable-next-line no-console
    console.warn(
      `[blessboard] ${reason}; using safe fallback mode=production (demo tenants hidden from directory/selector). NODE_ENV is not used for this gate.`
    );
  }
  return DEPLOYMENT_ENV_PRODUCTION;
}

/** True when DEPLOYMENT_ENV is testing (demo tenants may appear in directory/selector). */
function isTestingDeployment() {
  return getDeploymentEnvMode() === DEPLOYMENT_ENV_TESTING;
}

/**
 * True when DEPLOYMENT_ENV is production, or when missing/invalid (safe fallback).
 * Demo tenants stay hidden from public directory/selector.
 */
function isProductionDeployment() {
  return getDeploymentEnvMode() === DEPLOYMENT_ENV_PRODUCTION;
}

/**
 * True for BlessBoard.org V5 testing deployments that must use an explicit DATABASE_URL
 * (no silent GETPRO_DATABASE_URL fallback).
 * Trigger: DEPLOYMENT_ENV=testing AND effective canonical blessboard.org
 */
function isBlessBoardOrgTestingDeployment() {
  if (!isTestingDeployment()) return false;
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

/**
 * Safe snapshot for startup logs (no secrets).
 * @returns {{
 *   deploymentEnv: string,
 *   canonicalDomain: string,
 *   apexDomains: string,
 *   churchHostDomain: string,
 *   publicUrl: string,
 *   canonicalRedirectEnabled: boolean
 * }}
 */
function getBlessBoardDomainDiagnostics() {
  const apex = [...getBlessBoardApexDomainSet()].sort();
  return {
    deploymentEnv: getDeploymentEnv(),
    canonicalDomain: getBlessBoardCanonicalDomain(),
    apexDomains: apex.join(",") || "(none)",
    churchHostDomain: getChurchHostDomain(),
    publicUrl: getBlessBoardPublicUrl(),
    canonicalRedirectEnabled: isCanonicalHostRedirectEnabled(),
  };
}

module.exports = {
  DEFAULT_CANONICAL_DOMAIN,
  DEFAULT_COM_APEX_ALIASES,
  DEFAULT_SESSION_COOKIE_NAME,
  DEFAULT_UPLOAD_ROOT,
  normalizeHost,
  envTrim,
  isEnvFlagDisabled,
  getBlessBoardCanonicalDomain,
  getChurchHostDomain,
  getBlessBoardPublicUrl,
  getBlessBoardAdminUrl,
  getBlessBoardApexDomainSet,
  isBlessBoardApexDomain,
  isCanonicalHostRedirectEnabled,
  isBlessBoardForceHttpsEnabled,
  getSessionCookieName,
  getUploadRoot,
  getChurchUploadRoot,
  getUploadRootLogLabel,
  areBlessBoardJobsEnabled,
  getDeploymentEnv,
  getDeploymentEnvMode,
  isTestingDeployment,
  isProductionDeployment,
  DEPLOYMENT_ENV_TESTING,
  DEPLOYMENT_ENV_PRODUCTION,
  isBlessBoardOrgTestingDeployment,
  validateExpectedDatabaseEnv,
  getBlessBoardDomainDiagnostics,
  parseApexDomainsFromEnv,
  defaultApexDomainsForCanonical,
};
