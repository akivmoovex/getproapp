"use strict";

/**
 * DATABASE_URL-only resolution for the clean foundation tooling.
 * Never falls back to GETPRO_DATABASE_URL. Never logs the URL value.
 */

function envStringIsSet(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * @returns {string}
 * @throws {Error}
 */
function requireDatabaseUrl() {
  if (!envStringIsSet(process.env.DATABASE_URL)) {
    throw new Error(
      "[db] DATABASE_URL is required. This tool does not fall back to GETPRO_DATABASE_URL."
    );
  }
  return String(process.env.DATABASE_URL).trim();
}

/**
 * @param {string} connectionString
 * @returns {string}
 */
function parseDatabaseName(connectionString) {
  try {
    const u = new URL(String(connectionString || "").replace(/^postgresql:/i, "postgres:"));
    return decodeURIComponent((u.pathname || "").replace(/^\//, "")) || "";
  } catch {
    return "";
  }
}

/**
 * @param {string} connectionString
 * @returns {string}
 */
function parseDatabaseHost(connectionString) {
  try {
    const u = new URL(String(connectionString || "").replace(/^postgresql:/i, "postgres:"));
    return (u.hostname || "").toLowerCase();
  } catch {
    return "";
  }
}

module.exports = {
  envStringIsSet,
  requireDatabaseUrl,
  parseDatabaseName,
  parseDatabaseHost,
};
