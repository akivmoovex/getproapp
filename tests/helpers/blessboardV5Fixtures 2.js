"use strict";

/**
 * Thin BlessBoard V5 test fixture helpers.
 *
 * Prefer UUID relationships returned by provision* / create* services.
 * Do not use display names or organization/church keys as identity fields.
 * Does not create a mega-seed, connect to hosted DB, or mock authorization.
 */

const { DEFAULT_V5_COOKIE } = require("../../src/platform/session/v5SessionCookie");

const V5_DEPLOYMENT_CODE = "blessboard-org-staging";
const V5_IDENTITY_KEY = "blessboard-platform-v5";
const V5_DATA_ENVIRONMENT = "testing";
/** Matches v5EnvValidation session-secret floor used by foundation apps. */
const V5_TEST_SESSION_SECRET = "test-session-secret-at-least-32-chars!!";

/** Loose UUID shape (includes test doubles like 11111111-1111-…). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function assertUuidId(value, label) {
  const s = String(value == null ? "" : value).trim();
  if (!UUID_RE.test(s)) {
    throw new Error(
      `V5 fixture ${label} must be a UUID relationship id (got ${JSON.stringify(String(value).slice(0, 48))})`
    );
  }
  return s;
}

/**
 * Standard env bag for createV5FoundationApp / session tests under blessboard-org-staging.
 * Pairing with DEPLOYMENT_ENV=testing is required by V5 env validation for this deployment.
 * @param {Record<string, string | undefined>} [overrides]
 */
function baseV5TestEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: V5_DEPLOYMENT_CODE,
    SESSION_SECRET: V5_TEST_SESSION_SECRET,
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
    // Tests that need a one-host pilot override this; default * preserves prior suite behavior.
    BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST: "*",
    // Opt-in for suites that exercise upload; Hostinger should leave unset/0.
    BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1",
    ...(overrides || {}),
  };
}

/**
 * Build a resolved tenant context matching buildBlessBoardTenantContext shape.
 * primaryBranch may be a campus; hqBranch must remain the church HQ when distinct.
 *
 * @param {{
 *   organization: { id: string, organization_key?: string, key?: string },
 *   church: {
 *     id: string,
 *     church_key?: string,
 *     churchKey?: string,
 *     display_name?: string,
 *     displayName?: string,
 *     data_environment?: string | null,
 *     dataEnvironment?: string | null,
 *   },
 *   primaryBranch: { id: string, branch_key?: string, branchKey?: string, display_name?: string, displayName?: string },
 *   hqBranch?: { id: string, branch_key?: string, branchKey?: string, display_name?: string, displayName?: string },
 * }} parts
 */
function makeResolvedTenantContext(parts) {
  const source = parts && typeof parts === "object" ? parts : {};
  const organization = source.organization;
  const church = source.church;
  const primaryBranch = source.primaryBranch;
  const hqBranch = source.hqBranch || primaryBranch;

  if (!organization || !church || !primaryBranch || !hqBranch) {
    throw new Error("makeResolvedTenantContext requires organization, church, and primaryBranch");
  }

  const orgId = assertUuidId(organization.id, "organization.id");
  const churchId = assertUuidId(church.id, "church.id");
  const primaryId = assertUuidId(primaryBranch.id, "primaryBranch.id");
  const hqId = assertUuidId(hqBranch.id, "hqBranch.id");

  return {
    resolved: true,
    organization: {
      id: orgId,
      key: organization.organization_key || organization.key || null,
    },
    church: {
      id: churchId,
      key: church.church_key || church.churchKey || null,
      displayName: church.display_name || church.displayName || "",
      dataEnvironment: church.data_environment || church.dataEnvironment || null,
    },
    hqBranch: {
      id: hqId,
      key: hqBranch.branch_key || hqBranch.branchKey || null,
      displayName: hqBranch.display_name || hqBranch.displayName || "",
    },
    primaryBranch: {
      id: primaryId,
      key: primaryBranch.branch_key || primaryBranch.branchKey || null,
      displayName: primaryBranch.display_name || primaryBranch.displayName || "",
    },
  };
}

/**
 * Positional wrapper used by many suites: makeTenant(church, org, primaryBranch[, hqBranch]).
 * When primaryBranch is a campus, pass the HQ branch as the 4th argument.
 *
 * @param {object} church
 * @param {object} organization
 * @param {object} primaryBranch
 * @param {object} [hqBranch]
 */
function makeTenant(church, organization, primaryBranch, hqBranch) {
  return makeResolvedTenantContext({
    organization,
    church,
    primaryBranch,
    hqBranch,
  });
}

/**
 * @param {{ ok?: boolean, message?: string, reason?: string }} result
 * @param {string} label
 */
function assertProvisionOk(result, label) {
  if (!result || result.ok !== true) {
    const detail = (result && (result.message || result.reason)) || "unknown";
    throw new Error(`${label} failed: ${detail}`);
  }
  return result;
}

/**
 * @param {import('supertest').Response | { headers?: Record<string, string | string[]> }} res
 * @param {string} name
 * @returns {string | null}
 */
function extractSetCookie(res, name) {
  const raw = res && res.headers ? res.headers["set-cookie"] : null;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const prefix = `${name}=`;
  for (const line of list) {
    const part = String(line).split(";")[0];
    if (part.startsWith(prefix)) return part.slice(prefix.length);
  }
  return null;
}

/**
 * @param {...(string | null | undefined)} pairs cookie "name=value" fragments
 */
function joinCookieHeader(...pairs) {
  return pairs.filter(Boolean).join("; ");
}

module.exports = {
  V5_DEPLOYMENT_CODE,
  V5_IDENTITY_KEY,
  V5_DATA_ENVIRONMENT,
  V5_TEST_SESSION_SECRET,
  DEFAULT_V5_COOKIE,
  UUID_RE,
  assertUuidId,
  baseV5TestEnv,
  makeResolvedTenantContext,
  makeTenant,
  assertProvisionOk,
  extractSetCookie,
  joinCookieHeader,
};
