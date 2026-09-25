"use strict";

/**
 * Release Notes Center query/filter + public sanitization.
 */

const {
  STATUS,
  PRODUCTS,
  VERSION_ORDER,
  VERSIONS,
} = require("./releaseNotesCatalog");

const SENSITIVE_PATTERN =
  /(password|secret|credential|database_url|connection string|session[_-]?secret|Bearer\s+[A-Za-z0-9._-]+|postgres:\/\/\S+)/i;

/**
 * @param {string} version
 */
function normalizeVersion(version) {
  const raw = String(version || "").trim();
  if (!raw) return null;
  const match = VERSION_ORDER.find((v) => v === raw || v === raw.replace(/^v/i, ""));
  return match || null;
}

function listVersions() {
  return VERSION_ORDER.map((version) => {
    const entry = VERSIONS.find((v) => v.version === version);
    return {
      version,
      summary: entry ? entry.summary : "",
      releaseDate: entry ? entry.releaseDate : null,
      qaVerification: entry ? entry.qaVerification : STATUS.DOCUMENTATION_PENDING,
      deploymentStatus: entry ? entry.deploymentStatus : STATUS.UNVERIFIED,
      featureCount: entry ? entry.features.length : 0,
      bugCount: entry ? entry.bugs.length : 0,
      openBugCount: entry
        ? entry.bugs.filter((b) =>
            /open|blocked|incomplete|mitigated/i.test(String(b.verificationStatus || ""))
          ).length
        : 0,
    };
  });
}

/**
 * @param {string} version
 */
function getVersion(version) {
  const id = normalizeVersion(version);
  if (!id) return null;
  return VERSIONS.find((v) => v.version === id) || null;
}

/**
 * @param {object} [filters]
 */
function filterCatalog(filters) {
  const f = filters || {};
  const version = f.version ? normalizeVersion(f.version) : null;
  const product = String(f.product || "").trim();
  const featureType = String(f.featureType || "").trim();
  const implementationStatus = String(f.implementationStatus || "").trim();
  const qaStatus = String(f.qaStatus || "").trim();
  const severity = String(f.severity || "").trim();

  let versions = VERSIONS.slice();
  if (version) {
    versions = versions.filter((v) => v.version === version);
  }

  return versions.map((entry) => {
    let features = entry.features.slice();
    let bugs = entry.bugs.slice();
    let qaChecklist = entry.qaChecklist.slice();

    if (product) {
      features = features.filter((item) => item.products.includes(product));
      bugs = bugs.filter((item) => item.product === product);
      qaChecklist = qaChecklist.filter((item) => item.product === product);
    }
    if (featureType) {
      features = features.filter((item) => item.featureType === featureType);
    }
    if (implementationStatus) {
      features = features.filter(
        (item) => item.implementationStatus === implementationStatus
      );
    }
    if (qaStatus) {
      features = features.filter((item) => item.qaStatus === qaStatus);
      qaChecklist = qaChecklist.filter((item) => item.status === qaStatus);
    }
    if (severity) {
      bugs = bugs.filter(
        (item) => String(item.severity).toLowerCase() === severity.toLowerCase()
      );
    }

    return {
      ...entry,
      features,
      bugs,
      qaChecklist,
    };
  });
}

/**
 * Strip internal-only fields for public share view.
 * @param {ReturnType<typeof getVersion>} entry
 * @param {{ includeInternal?: boolean }} [opts]
 */
function sanitizeForAudience(entry, opts) {
  if (!entry) return null;
  const includeInternal = opts && opts.includeInternal === true;
  const scrub = (text) => {
    const value = String(text == null ? "" : text);
    if (!SENSITIVE_PATTERN.test(value)) return value;
    return value.replace(SENSITIVE_PATTERN, "[redacted]");
  };

  const features = entry.features
    .filter((item) => includeInternal || item.publicSafe !== false)
    .map((item) => ({
      id: item.id,
      name: item.name,
      description: scrub(item.description),
      workflow: scrub(item.workflow),
      expectedBehavior: scrub(item.expectedBehavior),
      products: item.products.slice(),
      featureType: item.featureType,
      implementationStatus: item.implementationStatus,
      qaStatus: item.qaStatus,
      testCaseIds: includeInternal ? item.testCaseIds.slice() : [],
      sources: includeInternal ? item.sources.slice() : [],
    }));

  const bugs = entry.bugs
    .filter((item) => includeInternal || item.publicSafe !== false)
    .map((item) => ({
      id: item.id,
      severity: item.severity,
      product: item.product,
      problem: scrub(item.problem),
      rootCause: includeInternal ? scrub(item.rootCause) : scrub(item.rootCause),
      fix: scrub(item.fix),
      verificationStatus: item.verificationStatus,
      regressionTests: includeInternal ? item.regressionTests.slice() : [],
      outstanding: scrub(item.outstanding),
      sources: includeInternal ? item.sources.slice() : [],
    }));

  const qaChecklist = includeInternal
    ? entry.qaChecklist.map((item) => ({
        ...item,
        objective: scrub(item.objective),
        prerequisites: scrub(item.prerequisites),
        steps: item.steps.map(scrub),
        expectedResult: scrub(item.expectedResult),
        evidence: scrub(item.evidence),
      }))
    : entry.qaChecklist.map((item) => ({
        id: item.id,
        featureOrBugId: item.featureOrBugId,
        product: item.product,
        objective: scrub(item.objective),
        status: item.status,
        // Public share omits detailed steps/evidence paths that may include internal ops detail.
        prerequisites: "",
        steps: [],
        expectedResult: scrub(item.expectedResult),
        evidence: "Internal evidence withheld — use authorized internal view",
      }));

  return {
    version: entry.version,
    summary: scrub(entry.summary),
    releaseDate: entry.releaseDate,
    products: entry.products.slice(),
    deploymentStatus: scrub(entry.deploymentStatus),
    qaVerification: scrub(entry.qaVerification),
    acceptanceCriteria: entry.acceptanceCriteria.map(scrub),
    pendingDevelopment: includeInternal
      ? entry.pendingDevelopment.map(scrub)
      : entry.pendingDevelopment.map(scrub),
    knownIssues: entry.knownIssues.map(scrub),
    documentationGaps: includeInternal
      ? entry.documentationGaps.map(scrub)
      : [],
    features,
    bugs,
    qaChecklist,
    sources: includeInternal ? entry.sources.slice() : [],
    audience: includeInternal ? "internal" : "public",
  };
}

function filterOptions() {
  const featureTypes = new Set();
  const implementationStatuses = new Set();
  const qaStatuses = new Set();
  const severities = new Set();
  for (const entry of VERSIONS) {
    for (const feature of entry.features) {
      featureTypes.add(feature.featureType);
      implementationStatuses.add(feature.implementationStatus);
      qaStatuses.add(feature.qaStatus);
    }
    for (const bug of entry.bugs) {
      severities.add(bug.severity);
    }
    for (const tc of entry.qaChecklist) {
      qaStatuses.add(tc.status);
    }
  }
  return {
    versions: VERSION_ORDER.slice(),
    products: Object.values(PRODUCTS),
    featureTypes: Array.from(featureTypes).sort(),
    implementationStatuses: Array.from(implementationStatuses).sort(),
    qaStatuses: Array.from(qaStatuses).sort(),
    severities: Array.from(severities).sort(),
    statusLegend: Object.values(STATUS),
  };
}

/**
 * Whether the Release Notes Center may be served.
 * Testing hubs only — never production deployment env.
 * @param {NodeJS.ProcessEnv} [env]
 */
function isReleaseNotesCenterAllowed(env) {
  const source = env || process.env;
  const deploymentEnv = String(source.DEPLOYMENT_ENV || "")
    .trim()
    .toLowerCase();
  if (deploymentEnv === "production") return false;
  if (deploymentEnv === "testing") return true;
  const nodeEnv = String(source.NODE_ENV || "")
    .trim()
    .toLowerCase();
  if (nodeEnv === "production") return false;
  return true;
}

/**
 * Internal QA detail access via shared token (preserved).
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 */
function canAccessInternalReleaseNotesViaToken(req, env) {
  const {
    isPlatformRuntimeDiagnosticsEndpointAllowed,
  } = require("../../startup/platformRuntimeSnapshot");
  if (!isPlatformRuntimeDiagnosticsEndpointAllowed(env)) return false;
  const expected = String(env.RELEASE_NOTES_INTERNAL_TOKEN || "").trim();
  if (!expected) return false;
  const provided =
    String((req.query && req.query.internal_token) || "").trim() ||
    String(req.get("x-release-notes-internal-token") || "").trim();
  return provided === expected;
}

/**
 * Existing platform_admin role — platform-wide QA/admin, not tenant church/clinic roles.
 * @param {{ query: Function }|null|undefined} pool
 * @param {string|null|undefined} userId
 */
async function userHasPlatformAdminRole(pool, userId) {
  const id = String(userId || "").trim();
  if (!id || !pool || typeof pool.query !== "function") return false;
  try {
    const {
      listActiveAuthorizationRoles,
      findUserStatusById,
    } = require("../../blessboard/repositories/blessBoardAuthorizationRepository");
    const user = await findUserStatusById(pool, id);
    if (!user || String(user.status) !== "active") return false;
    const roles = await listActiveAuthorizationRoles(pool, id);
    return roles.some((r) => String(r.roleKey || "") === "platform_admin");
  } catch {
    return false;
  }
}

/**
 * Resolve whether internal Release Notes may be shown.
 * Order: explicit platformAdminAuthorized → token → active platform_admin session.
 * Ordinary tenant roles (church_hq_admin, clinic staff, etc.) do not unlock internal QA.
 *
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 * @param {{
 *   getPool?: () => { query: Function }|null,
 *   platformAdminAuthorized?: boolean,
 * }} [opts]
 * @returns {Promise<{ allowed: boolean, via: string|null }>}
 */
async function resolveReleaseNotesInternalAccess(req, env, opts) {
  const options = opts || {};
  if (options.platformAdminAuthorized === true) {
    return { allowed: true, via: "platform_admin_session" };
  }
  if (canAccessInternalReleaseNotesViaToken(req, env)) {
    return { allowed: true, via: "token" };
  }
  const session =
    req.v5Session && req.v5Session.authenticated && req.v5Session.session
      ? req.v5Session.session
      : null;
  if (!session || !session.userId) {
    return { allowed: false, via: null };
  }
  const getPool = options.getPool;
  const pool = typeof getPool === "function" ? getPool() : null;
  if (await userHasPlatformAdminRole(pool, session.userId)) {
    return { allowed: true, via: "platform_admin_session" };
  }
  return { allowed: false, via: null };
}

/**
 * Sync token-only helper (tests / callers that do not await session RBAC).
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 */
function canAccessInternalReleaseNotes(req, env) {
  return canAccessInternalReleaseNotesViaToken(req, env);
}

module.exports = {
  STATUS,
  PRODUCTS,
  VERSION_ORDER,
  listVersions,
  getVersion,
  normalizeVersion,
  filterCatalog,
  sanitizeForAudience,
  filterOptions,
  isReleaseNotesCenterAllowed,
  canAccessInternalReleaseNotes,
  canAccessInternalReleaseNotesViaToken,
  resolveReleaseNotesInternalAccess,
  userHasPlatformAdminRole,
};
