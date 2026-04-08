"use strict";

const os = require("os");

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

/** Non-empty string check (same semantics as {@link connectionStringFromEnv}). */
function envStringIsSet(value) {
  return value != null && String(value).trim() !== "";
}

/**
 * Safe booleans for diagnostics — never log connection string values.
 * @returns {{ hasDatabaseUrl: boolean, hasGetproDatabaseUrl: boolean, effectiveSource: string }}
 */
function summarizeDatabaseUrlEnv() {
  const hasDatabaseUrl = envStringIsSet(process.env.DATABASE_URL);
  const hasGetproDatabaseUrl = envStringIsSet(process.env.GETPRO_DATABASE_URL);
  const effectiveSource = hasDatabaseUrl
    ? "DATABASE_URL"
    : hasGetproDatabaseUrl
      ? "GETPRO_DATABASE_URL"
      : "(none)";
  return { hasDatabaseUrl, hasGetproDatabaseUrl, effectiveSource };
}

/** Which env var supplies the URL (DATABASE_URL wins when both are set). Never log the value. */
function getDatabaseUrlEnvName() {
  return summarizeDatabaseUrlEnv().effectiveSource;
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

/**
 * Process / host context for correlating logs when env injection differs between restarts.
 * @returns {{ pid: number, ppid: number|null, hostname: string, cwd: string, nodeEnv: string }}
 */
function getStartupProcessSnapshot() {
  return {
    pid: process.pid,
    ppid: typeof process.ppid === "number" ? process.ppid : null,
    hostname: os.hostname(),
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV || "(unset)",
  };
}

/**
 * When DATABASE_URL / GETPRO_DATABASE_URL are absent, print safe diagnostics (no secrets).
 * @param {{ label?: string, envPath?: string, dotenvKeyCount?: number, dotenvErrorMessage?: string|null }} [opts]
 */
function logDatabaseEnvMissingDiagnostics(opts = {}) {
  const label = opts.label != null ? String(opts.label) : "server";
  const snap = getStartupProcessSnapshot();
  const { hasDatabaseUrl, hasGetproDatabaseUrl, effectiveSource } = summarizeDatabaseUrlEnv();
  const envPath = opts.envPath != null ? String(opts.envPath) : "(unknown)";
  const dk = opts.dotenvKeyCount;
  const dotenvKeyLabel = dk != null && Number.isFinite(Number(dk)) ? String(Number(dk)) : "(unknown)";
  const dotenvErr =
    opts.dotenvErrorMessage != null && String(opts.dotenvErrorMessage).trim() !== ""
      ? String(opts.dotenvErrorMessage).trim().slice(0, 240)
      : null;

  const lines = [
    `[getpro] PostgreSQL: configuration missing (${label})`,
    `  DATABASE_URL present: ${hasDatabaseUrl ? "yes" : "no"}`,
    `  GETPRO_DATABASE_URL present: ${hasGetproDatabaseUrl ? "yes" : "no"}`,
    `  Effective DB env source (would be): ${effectiveSource}`,
    `  pid: ${snap.pid} | ppid: ${snap.ppid != null ? snap.ppid : "(unavailable)"} | hostname: ${snap.hostname}`,
    `  cwd: ${snap.cwd}`,
    `  NODE_ENV: ${snap.nodeEnv}`,
    `  .env path: ${envPath}`,
    `  .env keys loaded: ${dotenvKeyLabel}`,
  ];
  if (dotenvErr) {
    lines.push(`  dotenv: ${dotenvErr}`);
  }
  lines.push(
    `  Note: If only some restarts lack DATABASE_URL, the supervisor/host often failed to inject env for that process (new cwd, worker fork, or panel env not applied to all instances).`
  );
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.error(line);
  }
}

/**
 * @param {{ envPath?: string, dotenvKeyCount?: number }} [dotenvInfo] — optional; from server.js dotenv.config next to server.js
 */
function logPgStartupDiagnostics(dotenvInfo) {
  if (startupLogged || !isPgConfigured()) return;
  startupLogged = true;
  const { sslLabel } = getPoolConnectionOptions();
  const urlName = getDatabaseUrlEnvName();
  const { hasDatabaseUrl, hasGetproDatabaseUrl } = summarizeDatabaseUrlEnv();
  const snap = getStartupProcessSnapshot();
  const nodeEnv = process.env.NODE_ENV || "(unset)";
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const max = Number(process.env.GETPRO_PG_POOL_MAX) || 10;
  const idle = Number(process.env.GETPRO_PG_IDLE_MS) || 30000;
  const cto = Number(process.env.GETPRO_PG_CONNECT_TIMEOUT_MS) || 10000;
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] PostgreSQL: ${urlName} is set | NODE_ENV=${nodeEnv} (mode=${mode}) | pool max=${max} idleTimeoutMs=${idle} connectionTimeoutMs=${cto} | ssl=${sslLabel}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] PostgreSQL env flags: DATABASE_URL=${hasDatabaseUrl ? "yes" : "no"} GETPRO_DATABASE_URL=${hasGetproDatabaseUrl ? "yes" : "no"} | effective=${urlName} | pid=${snap.pid} ppid=${snap.ppid != null ? snap.ppid : "n/a"} host=${snap.hostname}`
  );
  // eslint-disable-next-line no-console
  console.log(`[getpro] Process: cwd=${snap.cwd}`);
  if (dotenvInfo && (dotenvInfo.envPath != null || dotenvInfo.dotenvKeyCount != null)) {
    const ep = dotenvInfo.envPath != null ? String(dotenvInfo.envPath) : "(unknown)";
    const kc = dotenvInfo.dotenvKeyCount != null ? String(dotenvInfo.dotenvKeyCount) : "(unknown)";
    // eslint-disable-next-line no-console
    console.log(`[getpro] dotenv: path=${ep} keysLoaded=${kc} (file is optional; production often uses host-injected env only)`);
  }
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
  logDatabaseEnvMissingDiagnostics,
  getDatabaseUrlEnvName,
  summarizeDatabaseUrlEnv,
  getStartupProcessSnapshot,
};
