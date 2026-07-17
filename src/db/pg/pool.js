"use strict";

const os = require("os");

/**
 * Lazy PostgreSQL connection pool for Supabase (or any Postgres).
 * Used by repositories and by server.js (connect-pg-simple). The HTTP server requires a connection string at boot.
 *
 * Configure with DATABASE_URL (preferred) or GETPRO_DATABASE_URL.
 * Automated tests: set NODE_ENV=test and/or GETPRO_TEST_DB=1 with TEST_DATABASE_URL to use a dedicated
 * Postgres database (never mixed with local/production). In test intent mode, DATABASE_URL and
 * GETPRO_DATABASE_URL are ignored; if TEST_DATABASE_URL is unset, PostgreSQL is treated as not configured.
 * SSL: set GETPRO_PG_SSL to strict | no-verify | off (see README). When unset, Supabase-style hosts default to no-verify.
 * When explicit ssl is set, sslmode=… query params are stripped from the URI so node-pg is not told both “require” and a conflicting Pool.ssl.
 * Do not commit secrets.
 */

const { Pool } = require("pg");
const { isBlessBoardOrgTestingDeployment } = require("../../church/blessBoardEnv");
const { isV5FoundationMode } = require("../../platform/config/v5FoundationMode");

let pool = null;
let startupLogged = false;
/** Cached so startup log and Pool() use identical ssl + connection string. Cleared in closePgPool. */
let resolvedPoolOptions = null;

/** Non-empty string check (same semantics as {@link connectionStringFromEnv}). */
function envStringIsSet(value) {
  return value != null && String(value).trim() !== "";
}

/** When true, only TEST_DATABASE_URL is used (isolates CI/local test DB from dev .env). */
function isGetproTestDbIntent() {
  const v = (process.env.GETPRO_TEST_DB || "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "test";
}

/**
 * Single source for the Postgres connection string (never log the return value).
 * With test intent (NODE_ENV=test or GETPRO_TEST_DB=1): TEST_DATABASE_URL only (empty if unset — PG tests skip).
 * BlessBoard.org V5 testing (DEPLOYMENT_ENV=testing + canonical blessboard.org): DATABASE_URL only.
 * V5 foundation mode (PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5 + DEPLOYMENT_ENV=testing): DATABASE_URL only.
 * Otherwise: DATABASE_URL, then GETPRO_DATABASE_URL.
 * @returns {string}
 */
function getDatabaseUrl() {
  if (isGetproTestDbIntent()) {
    if (envStringIsSet(process.env.TEST_DATABASE_URL)) return String(process.env.TEST_DATABASE_URL).trim();
    return "";
  }
  if (envStringIsSet(process.env.DATABASE_URL)) return String(process.env.DATABASE_URL).trim();
  // V5 must never silently attach to GETPRO / production DB via fallback.
  if (isBlessBoardOrgTestingDeployment() || isV5FoundationMode()) return "";
  if (envStringIsSet(process.env.GETPRO_DATABASE_URL)) return String(process.env.GETPRO_DATABASE_URL).trim();
  return "";
}

function connectionStringFromEnv() {
  return getDatabaseUrl();
}

/**
 * Safe booleans for diagnostics — never log connection string values.
 * @returns {{ hasDatabaseUrl: boolean, hasGetproDatabaseUrl: boolean, effectiveSource: string, getproFallbackDisabled: boolean }}
 */
function summarizeDatabaseUrlEnv() {
  if (isGetproTestDbIntent()) {
    const hasTestDatabaseUrl = envStringIsSet(process.env.TEST_DATABASE_URL);
    return {
      hasDatabaseUrl: false,
      hasGetproDatabaseUrl: false,
      effectiveSource: hasTestDatabaseUrl ? "TEST_DATABASE_URL" : "(none)",
      getproFallbackDisabled: false,
    };
  }
  const hasDatabaseUrl = envStringIsSet(process.env.DATABASE_URL);
  const hasGetproDatabaseUrl = envStringIsSet(process.env.GETPRO_DATABASE_URL);
  const orgTesting = isBlessBoardOrgTestingDeployment();
  const v5Foundation = isV5FoundationMode();
  const getproFallbackDisabled = orgTesting || v5Foundation;
  let effectiveSource = "(none)";
  if (hasDatabaseUrl) effectiveSource = "DATABASE_URL";
  else if (!getproFallbackDisabled && hasGetproDatabaseUrl) effectiveSource = "GETPRO_DATABASE_URL";
  return {
    hasDatabaseUrl,
    hasGetproDatabaseUrl,
    effectiveSource,
    getproFallbackDisabled,
  };
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

/**
 * Redacted host fingerprint for logs (never password, user, path, or full URI).
 * Example: "ab***.supabase.co"
 * @param {string} connectionString
 * @returns {string}
 */
function redactDatabaseHostFingerprint(connectionString) {
  if (!connectionString || !String(connectionString).trim()) return "(none)";
  const host = parsePgHost(connectionString);
  if (!host) return "(unparseable)";
  const labels = host.split(".").filter(Boolean);
  if (labels.length === 0) return "(unparseable)";
  if (labels.length === 1) {
    const h = labels[0];
    return h.length <= 3 ? "***" : `${h.slice(0, 2)}***`;
  }
  const first = labels[0];
  const rest = labels.slice(1).join(".");
  const redactedFirst = first.length <= 2 ? "**" : `${first.slice(0, 2)}***`;
  return `${redactedFirst}.${rest}`;
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
 * @param {{ startupEntry?: string }} [extra]
 * @returns {{ pid: number, ppid: number|null, hostname: string, cwd: string, nodeEnv: string, startupEntry: string }}
 */
function getStartupProcessSnapshot(extra = {}) {
  const startupEntry =
    extra.startupEntry != null && String(extra.startupEntry).trim() !== ""
      ? String(extra.startupEntry).trim()
      : "(unknown)";
  return {
    pid: process.pid,
    ppid: typeof process.ppid === "number" ? process.ppid : null,
    hostname: os.hostname(),
    cwd: process.cwd(),
    nodeEnv: process.env.NODE_ENV || "(unset)",
    startupEntry,
  };
}

/**
 * When DATABASE_URL / GETPRO_DATABASE_URL are absent, print safe diagnostics (no secrets).
 * @param {{ label?: string, envPath?: string, dotenvKeyCount?: number, dotenvErrorMessage?: string|null, startupEntry?: string, beforeDbSnapshot?: { DATABASE_URL: boolean, GETPRO_DATABASE_URL: boolean }, envFileExists?: boolean, dotenvSkipped?: boolean, dbProvenanceLogLine?: string, liteSpeedLsnode?: boolean, workerLabel?: string }} [opts]
 */
function logDatabaseEnvMissingDiagnostics(opts = {}) {
  const label = opts.label != null ? String(opts.label) : "server";
  const snap = getStartupProcessSnapshot({ startupEntry: opts.startupEntry });
  const { hasDatabaseUrl, hasGetproDatabaseUrl, effectiveSource } = summarizeDatabaseUrlEnv();
  const envPath = opts.envPath != null ? String(opts.envPath) : "(unknown)";
  const dk = opts.dotenvKeyCount;
  const dotenvKeyLabel = dk != null && Number.isFinite(Number(dk)) ? String(Number(dk)) : "(unknown)";
  const dotenvErr =
    opts.dotenvErrorMessage != null && String(opts.dotenvErrorMessage).trim() !== ""
      ? String(opts.dotenvErrorMessage).trim().slice(0, 240)
      : null;
  const before = opts.beforeDbSnapshot;
  const hostBeforeLine =
    before && typeof before === "object"
      ? `  Host env BEFORE dotenv merge: DATABASE_URL=${before.DATABASE_URL ? "yes" : "no"} GETPRO_DATABASE_URL=${before.GETPRO_DATABASE_URL ? "yes" : "no"}`
      : null;
  const envFileLine =
    opts.envFileExists !== undefined ? `  .env file exists at app root: ${opts.envFileExists ? "yes" : "no"}` : null;
  const skipLine =
    opts.dotenvSkipped !== undefined ? `  GETPRO_SKIP_DOTENV (dotenv not merged): ${opts.dotenvSkipped ? "yes" : "no"}` : null;
  const lsLine =
    opts.liteSpeedLsnode !== undefined
      ? `  LiteSpeed lsnode wrapper entry: ${opts.liteSpeedLsnode ? "yes (fcgi-bin/lsnode.js is normal)" : "no"}`
      : null;
  const provLine =
    opts.dbProvenanceLogLine != null && String(opts.dbProvenanceLogLine).trim() !== ""
      ? `  ${String(opts.dbProvenanceLogLine).trim()}`
      : null;

  const wl =
    opts.workerLabel != null && String(opts.workerLabel).trim() !== ""
      ? ` workerLabel=${String(opts.workerLabel).trim()}`
      : "";
  const lines = [
    `[getpro] PostgreSQL: MISCONFIGURED WORKER — no database URL in this Node process (${label})${wl}`,
    `  (Compare envTrace phase=earliest vs bootstrap_complete — both should show DATABASE_URL=no if the host omitted vars before Node started.)`,
    `  (Other workers may still be healthy if the host injected DATABASE_URL/GETPRO_DATABASE_URL only for some instances.)`,
    `  DATABASE_URL present (after bootstrap): ${hasDatabaseUrl ? "yes" : "no"}`,
    `  GETPRO_DATABASE_URL present (after bootstrap): ${hasGetproDatabaseUrl ? "yes" : "no"}`,
    `  Effective DB env source (would be): ${effectiveSource}`,
  ];
  if (hostBeforeLine) lines.push(hostBeforeLine);
  if (envFileLine) lines.push(envFileLine);
  if (skipLine) lines.push(skipLine);
  if (lsLine) lines.push(lsLine);
  if (provLine) lines.push(provLine);
  lines.push(
    `  pid: ${snap.pid} | ppid: ${snap.ppid != null ? snap.ppid : "(unavailable)"} | hostname (OS): ${snap.hostname}`,
    `  cwd: ${snap.cwd}`,
    `  NODE_ENV: ${snap.nodeEnv}`,
    `  startup entry: ${snap.startupEntry}`,
    `  .env path (app root): ${envPath}`,
    `  .env keys merged: ${dotenvKeyLabel}`,
  );
  if (dotenvErr) {
    lines.push(`  dotenv: ${dotenvErr}`);
  }
  lines.push(
    `  Note: Ensure DATABASE_URL is set in Hostinger → Environment variables for every Node worker and/or the Hostinger-recommended production .env file (bootstrap log productionEnvFile; missing keys only).`
  );
  for (const line of lines) {
    // eslint-disable-next-line no-console
    console.error(line);
  }
}

/**
 * @param {{ envPath?: string, dotenvKeyCount?: number, startupEntry?: string, dbProvenanceLogLine?: string }} [dotenvInfo] — from runBootstrap()
 */
function logPgStartupDiagnostics(dotenvInfo) {
  if (startupLogged || !isPgConfigured()) return;
  startupLogged = true;
  const { sslLabel } = getPoolConnectionOptions();
  const urlName = getDatabaseUrlEnvName();
  const { hasDatabaseUrl, hasGetproDatabaseUrl } = summarizeDatabaseUrlEnv();
  const snap = getStartupProcessSnapshot({ startupEntry: dotenvInfo && dotenvInfo.startupEntry });
  const nodeEnv = process.env.NODE_ENV || "(unset)";
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  const max = Number(process.env.GETPRO_PG_POOL_MAX) || 10;
  const idle = Number(process.env.GETPRO_PG_IDLE_MS) || 30000;
  const cto = Number(process.env.GETPRO_PG_CONNECT_TIMEOUT_MS) || 10000;
  const prov =
    dotenvInfo && dotenvInfo.dbProvenanceLogLine != null && String(dotenvInfo.dbProvenanceLogLine).trim() !== ""
      ? String(dotenvInfo.dbProvenanceLogLine).trim()
      : null;
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] PostgreSQL: connection string from ${urlName} (value not logged) | NODE_ENV=${nodeEnv} (mode=${mode}) | pool max=${max} idleTimeoutMs=${idle} connectionTimeoutMs=${cto} | ssl=${sslLabel}`
  );
  if (prov) {
    // eslint-disable-next-line no-console
    console.log(`[getpro] ${prov}`);
  }
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] PostgreSQL env flags: DATABASE_URL=${hasDatabaseUrl ? "yes" : "no"} GETPRO_DATABASE_URL=${hasGetproDatabaseUrl ? "yes" : "no"} | effective=${urlName} | pid=${snap.pid} ppid=${snap.ppid != null ? snap.ppid : "n/a"} host=${snap.hostname}`
  );
  // eslint-disable-next-line no-console
  console.log(
    `[getpro] Healthy worker: DB URL available after bootstrap | startup entry=${snap.startupEntry} | cwd=${snap.cwd}`
  );
  if (dotenvInfo && (dotenvInfo.envPath != null || dotenvInfo.dotenvKeyCount != null)) {
    const ep = dotenvInfo.envPath != null ? String(dotenvInfo.envPath) : "(unknown)";
    const kc = dotenvInfo.dotenvKeyCount != null ? String(dotenvInfo.dotenvKeyCount) : "(unknown)";
    // eslint-disable-next-line no-console
    console.log(
      `[getpro] dotenv: path=${ep} keysLoaded=${kc} (repo .env merged when not production; production uses Hostinger env + optional productionEnvFile — see bootstrap logs)`
    );
  }
}

function isPgConfigured() {
  return connectionStringFromEnv().length > 0;
}

function getPoolRuntimeConfig() {
  return {
    max: Number(process.env.GETPRO_PG_POOL_MAX) || 5,
    idleTimeoutMillis: Number(process.env.GETPRO_PG_IDLE_MS) || 30000,
    connectionTimeoutMillis: Number(process.env.GETPRO_PG_CONNECT_TIMEOUT_MS) || 10000,
  };
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
    const runtime = getPoolRuntimeConfig();
    const config = {
      connectionString,
      max: runtime.max,
      idleTimeoutMillis: runtime.idleTimeoutMillis,
      connectionTimeoutMillis: runtime.connectionTimeoutMillis,
    };
    if (ssl !== undefined) {
      config.ssl = ssl;
    }
    pool = new Pool(config);
    // eslint-disable-next-line no-console
    console.log(
      `[getpro] PostgreSQL pool: max=${runtime.max} idleTimeoutMs=${runtime.idleTimeoutMillis} connectionTimeoutMs=${runtime.connectionTimeoutMillis}`
    );
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
  getDatabaseUrl,
  getDatabaseUrlEnvName,
  summarizeDatabaseUrlEnv,
  getStartupProcessSnapshot,
  getPoolRuntimeConfig,
  isGetproTestDbIntent,
  envStringIsSet,
  redactDatabaseHostFingerprint,
};
