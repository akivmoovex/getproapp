"use strict";

/**
 * BlessBoard organisation data-environment classification.
 * Distinguishes production, pilot, demo, and automated test tenants.
 */

const DATA_ENVIRONMENTS = Object.freeze(["production", "pilot", "demo", "test"]);

const DATA_ENVIRONMENT_LABELS = Object.freeze({
  production: "Production",
  pilot: "Pilot",
  demo: "Demo",
  test: "Test",
});

/** Environments that may appear in public directory / production-facing listings. */
const PUBLIC_DIRECTORY_ENVIRONMENTS = Object.freeze(["production", "pilot"]);

/** Environments included in production analytics / cross-tenant report aggregates. */
const REPORT_AGGREGATE_ENVIRONMENTS = Object.freeze(["production", "pilot"]);

/** Only production is billable (draft invoices / Growth branch billing). */
const BILLABLE_ENVIRONMENTS = Object.freeze(["production"]);

/** Environments allowed to receive fabricated public demo content. */
const FABRICATED_CONTENT_ENVIRONMENTS = Object.freeze(["demo", "test"]);

function normalizeDataEnvironment(raw) {
  const v = String(raw || "")
    .trim()
    .toLowerCase();
  if (DATA_ENVIRONMENTS.includes(v)) return v;
  return "production";
}

function isValidDataEnvironment(raw) {
  return DATA_ENVIRONMENTS.includes(
    String(raw || "")
      .trim()
      .toLowerCase()
  );
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

function isPublicDirectoryEnvironment(orgOrEnv) {
  return PUBLIC_DIRECTORY_ENVIRONMENTS.includes(getDataEnvironment(orgOrEnv));
}

function allowsFabricatedPublicContent(orgOrEnv) {
  return FABRICATED_CONTENT_ENVIRONMENTS.includes(getDataEnvironment(orgOrEnv));
}

function isDemoEnvironment(orgOrEnv) {
  return getDataEnvironment(orgOrEnv) === "demo";
}

function isTestEnvironment(orgOrEnv) {
  return getDataEnvironment(orgOrEnv) === "test";
}

function isNonProductionEnvironment(orgOrEnv) {
  return getDataEnvironment(orgOrEnv) !== "production";
}

/**
 * SQL fragment: organisation alias must be `o` (or pass alias).
 * Excludes demo/test from public directory.
 */
function sqlPublicDirectoryEnvironmentFilter(alias = "o") {
  return `${alias}.data_environment IN ('production', 'pilot')`;
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
  AND lower(${branchAlias}.host_slug) <> 'demo'
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
  REPORT_AGGREGATE_ENVIRONMENTS,
  BILLABLE_ENVIRONMENTS,
  FABRICATED_CONTENT_ENVIRONMENTS,
  normalizeDataEnvironment,
  isValidDataEnvironment,
  getDataEnvironment,
  isBillableEnvironment,
  isReportAggregateEnvironment,
  isPublicDirectoryEnvironment,
  allowsFabricatedPublicContent,
  isDemoEnvironment,
  isTestEnvironment,
  isNonProductionEnvironment,
  sqlPublicDirectoryEnvironmentFilter,
  sqlReportAggregateEnvironmentFilter,
  sqlExcludeDemoTestFromReports,
};
