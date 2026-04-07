"use strict";

/**
 * Lazy PostgreSQL connection pool for Supabase (or any Postgres).
 * Used by repositories and by server.js (connect-pg-simple). The HTTP server requires a connection string at boot.
 *
 * Configure with DATABASE_URL (preferred) or GETPRO_DATABASE_URL.
 * SSL: set GETPRO_PG_SSL to strict | no-verify | off (see README). When unset, Supabase-style hosts default to no-verify.
 * When explicit ssl is set, sslmode=… query params are stripped from the URI so node-pg is not told both “require” and a conflicting Pool.ssl.
 * Do not commit secrets.
 */

const { Pool } = require("pg");

let pool = null;
let startupLogged = false;
/** Cached so startup log and Pool() use identical ssl + connection string. Cleared in closePgPool. */
let resolvedPoolOptions = null;

function connectionStringFromEnv() {
  const raw = process.env.DATABASE_URL || process.env.GETPRO_DATABASE_URL || "";
  return typeof raw === "string" ? raw.trim() : "";
}

/** Which env var supplies the URL (DATABASE_URL wins when both are set). Never log the value. */
function getDatabaseUrlEnvName() {
  const d = process.env.DATABASE_URL;
  if (d != null && String(d).trim() !== "") return "DATABASE_URL";
  const g = process.env.GETPRO_DATABASE_URL;
  if (g != null && String(g).trim() !== "") return "GETPRO_DATABASE_URL";
  return "(none)";
}

function parsePgHost(connectionString) {
  try {
    const u = new URL(connectionString.replace(/^postgresql:/i, "postgres:"));
    return u.hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isSupabaseHost(host) {
  if (!host) return false;
  return (
    host.endsWith(".supabase.co") ||
    host.endsWith(".pooler.supabase.com") ||
    host.includes(".supabase.com")
  );
}

/**
 * Normalize GETPRO_PG_SSL. Returns: "strict" | "no-verify" | "off" | null (unset / use defaults).
 * Legacy: require|true|1 → strict; 0|false|disable → off.
 */
function normalizeGetProPgSsl() {
  const raw = (process.env.GETPRO_PG_SSL || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "strict") return "strict";
  if (raw === "no-verify") return "no-verify";
  if (raw === "off" || raw === "0" || raw === "false" || raw === "disable") return "off";
  if (raw === "require" || raw === "true" || raw === "1") return "strict";
  return null;
}

/** Remove ssl-related query params so Pool.ssl does not fight sslmode=require (verify-full vs no-verify). */
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
 * Single source of truth for Pool config. Admin bootstrap and connect-pg-simple use getPgPool() only — same options.
 */
function getPoolConnectionOptions() {
  if (resolvedPoolOptions) return resolvedPoolOptions;

  const raw = connectionStringFromEnv();
  const mode = normalizeGetProPgSsl();
  const host = parsePgHost(raw);
  const local = !host || host === "localhost" || host === "127.0.0.1" || host === "::1";
  const supabase = isSupabaseHost(host);

  let ssl = undefined;
  let sslLabel = "";

  if (mode === "off") {
    ssl = false;
    sslLabel = "off (GETPRO_PG_SSL=off)";
  } else if (mode === "strict") {
    ssl = { rejectUnauthorized: true };
    sslLabel = "strict (GETPRO_PG_SSL=strict)";
  } else if (mode === "no-verify") {
    ssl = { rejectUnauthorized: false };
    sslLabel = "no-verify (GETPRO_PG_SSL=no-verify)";
  } else if (mode === null) {
    if (local) {
      ssl = undefined;
      sslLabel = "default local (GETPRO_PG_SSL unset, no pool ssl)";
    } else if (supabase) {
      ssl = { rejectUnauthorized: false };
      sslLabel = "default Supabase (GETPRO_PG_SSL unset, no-verify)";
    } else {
      ssl = undefined;
      sslLabel = "default remote (GETPRO_PG_SSL unset, URL/pg driver)";
    }
  }

  const connectionString = ssl !== undefined ? stripSslQueryParams(raw) : raw;

  resolvedPoolOptions = {
    connectionString,
    ssl,
    sslLabel,
  };
  return resolvedPoolOptions;
}

function logPgStartupDiagnostics() {
  if (startupLogged || !isPgConfigured()) return;
  startupLogged = true;
  const { sslLabel } = getPoolConnectionOptions();
  const urlName = getDatabaseUrlEnvName();
  const nodeEnv = process.env.NODE_ENV || "(unset)";
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const max = Number(process.env.GETPRO_PG_POOL_MAX) || 10;
  const idle = Number(process.env.GETPRO_PG_IDLE_MS) || 30000;
  const cto = Number(process.env.GETPRO_PG_CONNECT_TIMEOUT_MS) || 10000;
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] PostgreSQL: ${urlName} is set | NODE_ENV=${nodeEnv} (mode=${mode}) | pool max=${max} idleTimeoutMs=${idle} connectionTimeoutMs=${cto} | ssl=${sslLabel}`
  );
}

function isPgConfigured() {
  return connectionStringFromEnv().length > 0;
}

/**
 * Returns a singleton Pool, or null if no connection string is set.
 * `server.js` requires a connection string at boot; null is for tests/helpers only.
 */
function getPgPool() {
  if (!isPgConfigured()) return null;
  if (!pool) {
    logPgStartupDiagnostics();
    const { connectionString, ssl } = getPoolConnectionOptions();
    const config = {
      connectionString,
      max: Number(process.env.GETPRO_PG_POOL_MAX) || 10,
      idleTimeoutMillis: Number(process.env.GETPRO_PG_IDLE_MS) || 30000,
      connectionTimeoutMillis: Number(process.env.GETPRO_PG_CONNECT_TIMEOUT_MS) || 10000,
    };
    if (ssl !== undefined) {
      config.ssl = ssl;
    }
    pool = new Pool(config);
    pool.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("[getpro] PostgreSQL pool error:", err.message);
    });
  }
  return pool;
}

async function closePgPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  resolvedPoolOptions = null;
}

module.exports = {
  getPgPool,
  isPgConfigured,
  closePgPool,
  logPgStartupDiagnostics,
  getDatabaseUrlEnvName,
};
