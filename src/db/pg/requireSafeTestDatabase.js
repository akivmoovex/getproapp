"use strict";

/**
 * Safety guard for destructive test-database operations (schema apply, truncation, bulk cleanup).
 * Never logs connection strings or credentials.
 */

function envStringIsSet(value) {
  return value != null && String(value).trim() !== "";
}

function isGetproTestDbIntent() {
  const v = (process.env.GETPRO_TEST_DB || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "test";
}

function parseDatabaseName(connectionString) {
  try {
    const u = new URL(String(connectionString || "").replace(/^postgresql:/i, "postgres:"));
    const name = decodeURIComponent((u.pathname || "").replace(/^\//, ""));
    return name || "";
  } catch {
    return "";
  }
}

function databaseNameLooksLikeTest(name) {
  const n = String(name || "").toLowerCase();
  if (!n) return false;
  return n.includes("test") || n.includes("_ci") || n.endsWith("ci");
}

/**
 * @returns {{ connectionString: string, databaseName: string }}
 * @throws {Error} when configuration is unsafe or incomplete (message never includes the URL)
 */
function requireSafeTestDatabaseUrl(opts) {
  const options = opts && typeof opts === "object" ? opts : {};
  const label = String(options.label || "test-database").trim() || "test-database";

  if (!isGetproTestDbIntent()) {
    throw new Error(
      `[getpro] ${label}: refusing destructive database work outside test mode. Set NODE_ENV=test or GETPRO_TEST_DB=1.`
    );
  }

  if (!envStringIsSet(process.env.TEST_DATABASE_URL)) {
    throw new Error(
      `[getpro] ${label}: TEST_DATABASE_URL is required. Do not use DATABASE_URL for destructive test setup.`
    );
  }

  const connectionString = String(process.env.TEST_DATABASE_URL).trim();
  const databaseName = parseDatabaseName(connectionString);
  const allowReset =
    String(process.env.ALLOW_TEST_DB_RESET || "")
      .trim()
      .toLowerCase() === "true";

  if (!databaseNameLooksLikeTest(databaseName) && !allowReset) {
    throw new Error(
      `[getpro] ${label}: refusing unsafe test database name. Use a name containing "test" (e.g. getpro_test) or set ALLOW_TEST_DB_RESET=true.`
    );
  }

  return { connectionString, databaseName };
}

module.exports = {
  requireSafeTestDatabaseUrl,
  parseDatabaseName,
  databaseNameLooksLikeTest,
  isGetproTestDbIntent,
  envStringIsSet,
};
