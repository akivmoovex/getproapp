"use strict";

/**
 * BlessBoard organisation data-environment classification.
 * Distinguishes production, pilot, demo, and testing tenants.
 *
 * V5 schema / platform.organizations use `testing` (not legacy `test`).
 * Legacy `test` is normalized to `testing` for JS helpers; SQL filters accept both.
 */

const DATA_ENVIRONMENTS = Object.freeze(["production", "pilot", "demo", "testing"]);

const DATA_ENVIRONMENT_LABELS = Object.freeze({
  production: "Production",
  pilot: "Pilot",
  demo: "Demo",
  testing: "Testing",
});

/** Environments that may appear in public directory on production deployments. */
const PUBLIC_DIRECTORY_ENVIRONMENTS = Object.freeze(["production", "pilot"]);

/**
 * Environments that may appear in public directory on testing deployments.
 * Includes V5 testing tenants (`testing`), catalogue demos (`demo`), and production/pilot.
 * Legacy SQL value `test` is also accepted so transitional rows remain visible on testing hosts.
 */
const PUBLIC_DIRECTORY_ENVIRONMENTS_TESTING = Object.freeze([
  "production",
  "pilot",
  "demo",
  "testing",
]);

/** Environments included in production analytics / cross-tenant report aggregates. */
const REPORT_AGGREGATE_ENVIRONMENTS = Object.freeze(["production", "pilot"]);

/** Only production is billable (draft invoices / Growth branch billing). */
const BILLABLE_ENVIRONMENTS = Object.freeze(["production"]);

/** Environments allowed to receive fabricated public demo content. */
const FABRICATED_CONTENT_ENVIRONMENTS = Object.freeze(["demo", "testing"]);

function normalizeDataEnvironment(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "test") return "testing";
  if (DATA_ENVIRONMENTS.includes(v)) return v;
  return "production";
}

function isValidDataEnvironment(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (v === "test") return true;
  return DATA_ENVIRONMENTS.includes(v);
}

function getDataEnvironment(orgOrEnv) {
  if (orgOrEnv == null) return "production";
  if (typeof orgOrEnv === "string") return normalizeDataEnvironment(orgOrEnv);
  return normalizeDataEnvironment(orgOrEnv.data_environment || orgOrEnv.dataEnvironment);
}

function isBillableEnvironment(orgOrEnv) {
  return BILLABLE_ENVIRONMENTS.includes(getDataEnvironment(orgOrEnv));
}

function isReportAggregateEnvironment(orgOrEnv) {
  return REPORT_AGGREGATE_ENVIRONMENTS.includes(getDataEnvironment(orgOrEnv));
}

/**
 * Whether an org may appear in the public church directory / selector.
 * Depends on DEPLOYMENT_ENV (via isTestingDeployment) — not NODE_ENV alone.
 * Pass the explicit app env at request time; process.env is bootstrap-only.
 * @param {string|object} orgOrEnv
 * @param {NodeJS.ProcessEnv} [appEnv]
 */
function isPublicDirectoryEnvironment(orgOrEnv, appEnv) {
  const env = getDataEnvironment(orgOrEnv);
  const { isTestingDeployment } = require("./blessBoardEnv");
  if (isTestingDeployment(appEnv)) {
    return PUBLIC_DIRECTORY_ENVIRONMENTS_TESTING.includes(env);
  }
  return PUBLIC_DIRECTORY_ENVIRONMENTS.includes(env);
}

/** Environments allowed in the public directory for the current deployment mode. */
function publicDirectoryEnvironmentsForDeployment(appEnv) {
  const { isTestingDeployment } = require("./blessBoardEnv");
  return isTestingDeployment(appEnv)
    ? PUBLIC_DIRECTORY_ENVIRONMENTS_TESTING
    : PUBLIC_DIRECTORY_ENVIRONMENTS;
}

function allowsFabricatedPublicContent(orgOrEnv) {
  return FABRICATED_CONTENT_ENVIRONMENTS.includes(getDataEnvironment(orgOrEnv));
}

function isDemoEnvironment(orgOrEnv) {
  return getDataEnvironment(orgOrEnv) === "demo";
}

function isTestEnvironment(orgOrEnv) {
  return getDataEnvironment(orgOrEnv) === "testing";
}

function isNonProductionEnvironment(orgOrEnv) {
  return getDataEnvironment(orgOrEnv) !== "production";
}

/**
 * Authoritative data_environment for new self-registered organizations.
 *
 * Prefer deployment profile / DEPLOYMENT_ENV via getDeploymentEnvMode — never
 * silently default to testing when the runtime is production.
 * Explicit PLATFORM_DATA_ENVIRONMENT / DATA_ENVIRONMENT may select pilot|demo;
 * production|testing explicit values are accepted only when they match the
 * authoritative deployment mode (avoids Hostinger misconfig flipping prod→testing).
 *
 * @param {NodeJS.ProcessEnv|object|null|undefined} env
 * @param {{ explicit?: unknown, deploymentCode?: unknown }} [opts]
 * @returns {"production"|"testing"|"pilot"|"demo"}
 */
function resolveRegistrationDataEnvironment(env, opts = {}) {
  const { getDeploymentEnvMode } = require("./blessBoardEnv");
  const mode = getDeploymentEnvMode(env);
  const explicitRaw = String(
    (opts && opts.explicit != null ? opts.explicit : "") ||
      (env && env.PLATFORM_DATA_ENVIRONMENT) ||
      (env && env.DATA_ENVIRONMENT) ||
      ""
  )
    .trim()
    .toLowerCase();
  const explicit = explicitRaw === "test" ? "testing" : explicitRaw;

  if (explicit === "pilot" || explicit === "demo") {
    return explicit;
  }
  if (explicit === "production" || explicit === "testing") {
    if (explicit === mode) return explicit;
    // eslint-disable-next-line no-console
    console.warn(
      `[blessboard] ignoring data-environment override "${explicit}" that contradicts deployment mode "${mode}"`
    );
  }

  if (!explicit && opts && opts.deploymentCode) {
    const code = String(opts.deploymentCode || "")
      .trim()
      .toLowerCase();
    if (code.includes("production") || code === "blessboard-com-production") {
      return "production";
    }
    if (
      code.includes("testing") ||
      code.includes("staging") ||
      code.includes("pronline")
    ) {
      return "testing";
    }
  }

  return mode === "testing" ? "testing" : "production";
}

/**
 * SQL fragment: organisation alias must be `o` (or pass alias).
 * Production deployments: production + pilot only (never testing/demo).
 * Testing deployments: production + pilot + demo + testing (+ legacy `test`).
 */
function sqlPublicDirectoryEnvironmentFilter(alias = "o", appEnv) {
  const envs = [...publicDirectoryEnvironmentsForDeployment(appEnv)];
  // Accept legacy V4 SQL value `test` wherever `testing` is allowed.
  if (envs.includes("testing") && !envs.includes("test")) {
    envs.push("test");
  }
  const list = envs.map((e) => `'${e}'`).join(", ");
  return `${alias}.data_environment IN (${list})`;
}

/**
 * Production deployments only: exclude churches whose public display name contains
 * "demo" case-insensitively (e.g. Demo Church, My DEMO Church).
 * Testing/dev deployments show demo-named tenants unchanged.
 */
function sqlPublicDirectoryProductionDemoNameExclusion(appEnv) {
  const { isProductionDeployment } = require("./blessBoardEnv");
  if (!isProductionDeployment(appEnv)) {
    return "TRUE";
  }
  return `NOT (
    lower(COALESCE(NULLIF(trim(cs.public_name), ''), c.display_name, o.display_name)) LIKE '%demo%'
  )`;
}

/**
 * SQL fragment for production report aggregates (cross-branch KPIs, etc.).
 */
function sqlReportAggregateEnvironmentFilter(alias = "o") {
  return `${alias}.data_environment IN ('production', 'pilot')`;
}

/**
 * SQL fragment excluding demo/test host patterns + data_environment.
 */
function sqlExcludeDemoTestFromReports(orgAlias = "o", branchAlias = "b") {
  return `
  AND ${sqlReportAggregateEnvironmentFilter(orgAlias)}
  AND ${branchAlias}.status = 'active'
  AND lower(${branchAlias}.host_slug) NOT IN ('demo', 'demo2')
  AND lower(${branchAlias}.host_slug) NOT LIKE 'demo-%'
  AND lower(${branchAlias}.host_slug) NOT LIKE '%-demo'
  AND lower(${branchAlias}.slug) NOT LIKE 'sample%'
  AND lower(${branchAlias}.slug) NOT LIKE 'demo-%'
  AND lower(${branchAlias}.name) NOT LIKE 'sample %'
`;
}

module.exports = {
  DATA_ENVIRONMENTS,
  DATA_ENVIRONMENT_LABELS,
  PUBLIC_DIRECTORY_ENVIRONMENTS,
  PUBLIC_DIRECTORY_ENVIRONMENTS_TESTING,
  REPORT_AGGREGATE_ENVIRONMENTS,
  BILLABLE_ENVIRONMENTS,
  FABRICATED_CONTENT_ENVIRONMENTS,
  normalizeDataEnvironment,
  isValidDataEnvironment,
  getDataEnvironment,
  isBillableEnvironment,
  isReportAggregateEnvironment,
  isPublicDirectoryEnvironment,
  publicDirectoryEnvironmentsForDeployment,
  allowsFabricatedPublicContent,
  isDemoEnvironment,
  isTestEnvironment,
  isNonProductionEnvironment,
  resolveRegistrationDataEnvironment,
  sqlPublicDirectoryEnvironmentFilter,
  sqlPublicDirectoryProductionDemoNameExclusion,
  sqlReportAggregateEnvironmentFilter,
  sqlExcludeDemoTestFromReports,
};
