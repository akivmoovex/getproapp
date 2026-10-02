"use strict";

/**
 * Admin Pool options for foundation CLI tools (migrate / bootstrap / verify / identity).
 * DATABASE_URL-only callers pass the connection string explicitly.
 * Never logs the URL. Does not set NODE_TLS_REJECT_UNAUTHORIZED.
 */

const { parseDatabaseHost } = require("./databaseUrl");

function isSupabaseHost(host) {
  if (!host) return false;
  return (
    host.endsWith(".supabase.co") ||
    host.endsWith(".pooler.supabase.com") ||
    host.includes(".supabase.com")
  );
}

function isLocalHost(host) {
  const h = String(host || "").toLowerCase();
  return !h || h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function normalizeFoundationPgSsl() {
  // Prefer FOUNDATION_PG_SSL; fall back to GETPRO_PG_SSL for operator familiarity.
  const raw = String(process.env.FOUNDATION_PG_SSL || process.env.GETPRO_PG_SSL || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw === "strict") return "strict";
  if (raw === "no-verify") return "no-verify";
  if (raw === "off" || raw === "0" || raw === "false" || raw === "disable") return "off";
  if (raw === "require" || raw === "true" || raw === "1") return "strict";
  return null;
}

function stripSslQueryParams(connectionString) {
  try {
    const normalized = connectionString.replace(/^postgresql:/i, "postgres:");
    const u = new URL(normalized);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    return u.toString().replace(/^postgres:/i, "postgresql:");
  } catch {
    return connectionString;
  }
}

/**
 * @param {string} connectionString
 * @returns {{ connectionString: string, ssl: boolean|{rejectUnauthorized:boolean}|undefined, sslLabel: string, connectionTimeoutMillis: number }}
 */
function getFoundationPoolOptions(connectionString) {
  const raw = String(connectionString || "").trim();
  const mode = normalizeFoundationPgSsl();
  const host = parseDatabaseHost(raw);
  const local = isLocalHost(host);
  const supabase = isSupabaseHost(host);

  let ssl = undefined;
  let sslLabel = "";

  if (mode === "off") {
    ssl = false;
    sslLabel = "off";
  } else if (mode === "strict") {
    ssl = { rejectUnauthorized: true };
    sslLabel = "strict";
  } else if (mode === "no-verify") {
    // Local Postgres often has no TLS; do not force SSL for localhost even when
    // GETPRO_PG_SSL=no-verify is set in a developer shell / .env.
    if (local) {
      ssl = undefined;
      sslLabel = "no-verify-ignored-local";
    } else {
      ssl = { rejectUnauthorized: false };
      sslLabel = "no-verify";
    }
  } else if (local) {
    ssl = undefined;
    sslLabel = "default-local";
  } else if (supabase) {
    // Supabase pooler / direct hosts typically present a cert chain that needs TLS on,
    // with rejectUnauthorized false unless the operator opts into FOUNDATION_PG_SSL=strict.
    ssl = { rejectUnauthorized: false };
    sslLabel = "default-supabase-no-verify";
  } else {
    ssl = { rejectUnauthorized: true };
    sslLabel = "default-remote-strict";
  }

  const connectionTimeoutMillis = Math.min(
    Math.max(Number(process.env.FOUNDATION_PG_CONNECT_TIMEOUT_MS || 15000), 1000),
    120000
  );

  return {
    connectionString: ssl !== undefined ? stripSslQueryParams(raw) : raw,
    ssl,
    sslLabel,
    connectionTimeoutMillis,
  };
}

/**
 * @param {string} connectionString
 * @param {import('pg').PoolConfig} [extra]
 * @returns {import('pg').PoolConfig}
 */
function buildFoundationPoolConfig(connectionString, extra) {
  const opts = getFoundationPoolOptions(connectionString);
  const config = {
    connectionString: opts.connectionString,
    max: (extra && extra.max) || 2,
    connectionTimeoutMillis: opts.connectionTimeoutMillis,
    idleTimeoutMillis: (extra && extra.idleTimeoutMillis) || 10000,
  };
  if (opts.ssl !== undefined) {
    config.ssl = opts.ssl;
  }
  return config;
}

module.exports = {
  isSupabaseHost,
  isLocalHost,
  getFoundationPoolOptions,
  buildFoundationPoolConfig,
};
