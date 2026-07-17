"use strict";

/**
 * Host safety checks for foundation admin CLIs.
 * Never logs the full URL or credentials.
 */

const { parseDatabaseHost } = require("./databaseUrl");

const BLOCKED_EXACT_HOSTS = new Set([
  "base",
  "localhost",
  "127.0.0.1",
  "::1",
  "example.com",
  "www.example.com",
]);

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isLocalhostExplicitlyAllowed(env) {
  const source = env || process.env;
  const flag = String(source.FOUNDATION_ALLOW_LOCALHOST || "")
    .trim()
    .toLowerCase();
  if (flag === "1" || flag === "true" || flag === "yes") return true;
  const testIntent =
    String(source.NODE_ENV || "").trim().toLowerCase() === "test" ||
    ["1", "true", "yes"].includes(String(source.GETPRO_TEST_DB || "").trim().toLowerCase());
  return testIntent;
}

/**
 * @param {string} connectionString
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ ok: true, host: string } | { ok: false, reason: string, host: string }}
 */
function assertSafeFoundationDatabaseHost(connectionString, env) {
  const host = parseDatabaseHost(connectionString);
  if (!host) {
    return { ok: false, reason: "unparseable_host", host: "" };
  }
  if (BLOCKED_EXACT_HOSTS.has(host)) {
    if (
      (host === "localhost" || host === "127.0.0.1" || host === "::1") &&
      isLocalhostExplicitlyAllowed(env)
    ) {
      return { ok: true, host };
    }
    return { ok: false, reason: "placeholder_or_blocked_host", host };
  }
  if (host.endsWith(".example.com") || host.endsWith(".example.org")) {
    return { ok: false, reason: "placeholder_or_blocked_host", host };
  }
  return { ok: true, host };
}

module.exports = {
  BLOCKED_EXACT_HOSTS,
  isLocalhostExplicitlyAllowed,
  assertSafeFoundationDatabaseHost,
};
