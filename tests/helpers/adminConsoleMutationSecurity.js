"use strict";

/**
 * Shared CSRF + session helpers for Admin Console mutation security suites.
 * Wraps platform v5 CSRF issuance and deployment-session expiry probes.
 */

const assert = require("node:assert/strict");
const {
  CSRF_FIELD,
  CSRF_COOKIE,
  getCsrfCookieName,
  issueCsrfToken,
} = require("../../src/platform/http/v5Csrf");
const {
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  hasAuthoritativeDeploymentProfile,
  getDeploymentProfile,
} = require("../../src/platform/config/deploymentProfiles");
const { DEFAULT_V5_COOKIE } = require("../../src/platform/session/v5SessionCookie");
const { hashSessionToken } = require("../../src/platform/session/sessionToken");
const { expectIsolationDenied } = require("./authzNegativeHelpers");

/**
 * Resolve BB CSRF cookie name from env/profile (not the deprecated CSRF_COOKIE alias alone).
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveBbCsrfCookieName(env) {
  return getCsrfCookieName(env || process.env);
}

/**
 * Resolve BB session cookie name from authoritative deployment profile when set.
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveBbSessionCookieName(env) {
  const source = env || process.env;
  if (hasAuthoritativeDeploymentProfile(source)) {
    const profile = getDeploymentProfile(source);
    if (profile && profile.sessionCookieName) return String(profile.sessionCookieName);
  }
  if (source.SESSION_COOKIE_NAME) return String(source.SESSION_COOKIE_NAME).trim();
  return DEFAULT_V5_COOKIE;
}

function extractCsrfToken(html) {
  const text = String(html || "");
  const meta = text.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const m = text.match(
    new RegExp(
      `name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`
    )
  );
  return (m && (m[1] || m[2])) || null;
}

function extractSetCookie(res, name) {
  const raw = res && res.headers && res.headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const line of list) {
    if (String(line).startsWith(`${name}=`)) {
      return String(line).split(";")[0].slice(name.length + 1);
    }
  }
  return null;
}

function assertNoServerError(res, label) {
  assert.ok(
    ![500, 503].includes(Number(res && res.status)),
    `${label} must not 500/503 (got ${res && res.status})`
  );
}

/** CSRF failures are controlled denials (typically 403). */
function expectCsrfDenied(res, label) {
  assertNoServerError(res, label);
  assert.equal(
    Number(res.status),
    403,
    `${label} expected CSRF 403, got ${res.status}`
  );
}

/** Expired/invalid session → 401/403/404 or login redirect. */
function expectSessionDenied(res, label) {
  assertNoServerError(res, label);
  expectIsolationDenied(res, label);
}

/**
 * Expire a platform.deployment_sessions row by raw cookie token.
 * @param {{ query: Function }} pool
 * @param {string} rawToken
 */
async function expireDeploymentSession(pool, rawToken) {
  const token = String(rawToken || "").trim();
  assert.ok(token, "rawToken required to expire session");
  const result = await pool.query(
    `UPDATE platform.deployment_sessions
        SET created_at = now() - interval '2 hours',
            last_seen_at = now() - interval '2 hours',
            expires_at = now() - interval '1 minute'
      WHERE session_token_hash = $1
      RETURNING id`,
    [hashSessionToken(token)]
  );
  assert.ok(result.rowCount >= 1, "expected a deployment session to expire");
  return result.rows[0].id;
}

/**
 * AC double-submit CSRF pair (cookie + field must match).
 * @param {NodeJS.ProcessEnv} env
 * @param {string} sessionCookieHeader e.g. "ac_org_session=…"
 */
function issueAcCsrfPair(env, sessionCookieHeader) {
  const token = issueCsrfToken(env);
  return {
    token,
    cookie: `${sessionCookieHeader}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${token}`,
  };
}

/**
 * BB CSRF pair from a prior HTML response (preferred) or freshly issued.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} sessionCookieHeader
 * @param {{ text?: string, headers?: object }|null} [pageRes]
 */
function issueBbCsrfPair(env, sessionCookieHeader, pageRes) {
  const csrfCookieName = resolveBbCsrfCookieName(env);
  const fromPage = pageRes ? extractCsrfToken(pageRes.text) : null;
  const fromCookie = pageRes ? extractSetCookie(pageRes, csrfCookieName) : null;
  const token = fromPage || issueCsrfToken(env);
  const cookieToken = fromCookie || token;
  return {
    token,
    csrfCookieName,
    cookie: `${sessionCookieHeader}; ${csrfCookieName}=${cookieToken}`,
  };
}

/**
 * Invalid CSRF: valid signed cookie token ≠ valid signed body token.
 * @param {NodeJS.ProcessEnv} env
 * @param {string} sessionCookieHeader
 * @param {"ac"|"bb"} product
 */
function issueMismatchedCsrfPair(env, sessionCookieHeader, product) {
  const cookieToken = issueCsrfToken(env);
  const bodyToken = issueCsrfToken(env);
  const csrfCookie =
    product === "bb" ? resolveBbCsrfCookieName(env) : CSRF_COOKIE_ACTIVECLINIC_ORG;
  return {
    token: bodyToken,
    csrfCookieName: csrfCookie,
    cookie: `${sessionCookieHeader}; ${csrfCookie}=${cookieToken}`,
  };
}

/**
 * Strip session cookie name value for expired-session probes, keeping CSRF if present.
 * @param {string} cookieHeader
 * @param {string} sessionCookieName
 * @param {string} rawToken
 */
function replaceSessionToken(cookieHeader, sessionCookieName, rawToken) {
  const parts = String(cookieHeader || "")
    .split(/;\s*/)
    .filter(Boolean)
    .filter((p) => !p.startsWith(`${sessionCookieName}=`));
  parts.unshift(`${sessionCookieName}=${rawToken}`);
  return parts.join("; ");
}

module.exports = {
  CSRF_FIELD,
  CSRF_COOKIE,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  getCsrfCookieName,
  resolveBbCsrfCookieName,
  resolveBbSessionCookieName,
  extractCsrfToken,
  extractSetCookie,
  assertNoServerError,
  expectCsrfDenied,
  expectSessionDenied,
  expireDeploymentSession,
  issueAcCsrfPair,
  issueBbCsrfPair,
  issueMismatchedCsrfPair,
  replaceSessionToken,
  issueCsrfToken,
};
