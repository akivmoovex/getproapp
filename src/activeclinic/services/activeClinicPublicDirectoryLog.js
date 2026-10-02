"use strict";

/**
 * Structured logging for ActiveClinic public clinic directory.
 * Never logs PII, cookies, CSRF, DATABASE_URL, or SQL parameters.
 */

const crypto = require("crypto");

function newDirectoryRequestId() {
  return `acd_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function classifyDirectoryError(err) {
  const code = err && err.code ? String(err.code) : null;
  const message = err && err.message ? String(err.message) : "";
  if (
    code === "42P01" ||
    (/activeclinic\.(healthcare_organizations|facilities)/i.test(message) &&
      /does not exist/i.test(message))
  ) {
    return {
      category: "schema_missing",
      safeDatabaseErrorCode: code || "42P01",
      repositoryFunction: "listPublishableClinics",
      stage: "query",
    };
  }
  if (
    code === "42703" ||
    /website_published|show_in_directory|public_booking_enabled|public_website_visible/i.test(message)
  ) {
    return {
      category: "schema_column_missing",
      safeDatabaseErrorCode: code || "42703",
      repositoryFunction: "listPublishableClinics",
      stage: "query",
    };
  }
  if (code === "42501" || code === "28000" || code === "28P01") {
    return {
      category: "database_permission",
      safeDatabaseErrorCode: code,
      repositoryFunction: "listPublishableClinics",
      stage: "query",
    };
  }
  if (code === "57P01" || code === "57P03" || code === "08006" || code === "08001") {
    return {
      category: "database_unavailable",
      safeDatabaseErrorCode: code,
      repositoryFunction: "listPublishableClinics",
      stage: "connect_or_query",
    };
  }
  return {
    category: "unexpected",
    safeDatabaseErrorCode: code || "unknown",
    repositoryFunction: "listPublishableClinics",
    stage: "unknown",
  };
}

function logDirectoryLoadFailed(input) {
  const payload = {
    event: "activeclinic.public.directory_load_failed",
    request_id: input.requestId || null,
    deployment_code: input.deploymentCode || null,
    environment_code: input.environmentCode || null,
    operation: "list_publishable_clinics",
    repository_function: input.repositoryFunction || "listPublishableClinics",
    safe_database_error_code: input.safeDatabaseErrorCode || null,
    exception_class: input.exceptionClass || null,
    stage: input.stage || null,
    category: input.category || null,
    filters_present: Boolean(input.filtersPresent),
    timestamp: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.error(JSON.stringify(payload));
  if (input.includeStack && input.err && input.err.stack) {
    // eslint-disable-next-line no-console
    console.error(String(input.err.stack).split("\n").slice(0, 12).join("\n"));
  }
}

function logDirectoryLoaded(input) {
  const payload = {
    event: "activeclinic.public.directory_loaded",
    request_id: input.requestId || null,
    result_count: typeof input.resultCount === "number" ? input.resultCount : null,
    filters_present: Boolean(input.filtersPresent),
    page: input.page || 1,
    timestamp: new Date().toISOString(),
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}

module.exports = {
  newDirectoryRequestId,
  classifyDirectoryError,
  logDirectoryLoadFailed,
  logDirectoryLoaded,
};
