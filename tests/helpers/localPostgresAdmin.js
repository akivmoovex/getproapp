"use strict";

/**
 * Canonical local Postgres.app admin connection for foundation / migration fixtures.
 *
 * Never logs credentials. Hard-refuses production / remote Hostinger targets.
 *
 * Intended instance (V2.03 canonical QA baseline):
 *   DB_PROVIDER/INSTANCE = Postgres.app (local)
 *   DB_HOST              = 127.0.0.1
 *   DB_PORT              = 5432
 *   DB_NAME (admin)      = postgres
 *   Auth                 = local peer/trust for OS user (no password in repo)
 */

const os = require("os");

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * @param {string} connectionString
 * @returns {{ protocol: string, username: string, hostname: string, port: string, database: string }}
 */
function parsePgUrl(connectionString) {
  const raw = String(connectionString || "").trim();
  if (!raw) {
    throw new Error("empty PostgreSQL connection string");
  }
  let u;
  try {
    u = new URL(raw.replace(/^postgresql:/i, "postgres:"));
  } catch {
    throw new Error("invalid PostgreSQL connection string");
  }
  return {
    protocol: u.protocol,
    username: decodeURIComponent(u.username || ""),
    hostname: String(u.hostname || "").toLowerCase(),
    port: u.port || "5432",
    database: decodeURIComponent((u.pathname || "").replace(/^\//, "").split("/")[0] || ""),
  };
}

/**
 * Refuse anything that is not clearly a local Postgres maintenance URL.
 * @param {string} connectionString
 * @param {{ allowDatabaseNames?: string[] }} [opts]
 */
function assertLocalNonProductionAdminUrl(connectionString, opts = {}) {
  const parsed = parsePgUrl(connectionString);
  const allowDb = opts.allowDatabaseNames || ["postgres"];

  if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `PRODUCTION_DB_GUARD: refusing non-local PostgreSQL host for test admin (${parsed.hostname || "empty"})`
    );
  }
  if (String(parsed.port) !== "5432") {
    throw new Error(
      `PRODUCTION_DB_GUARD: refusing non-default local PostgreSQL port for test admin (${parsed.port})`
    );
  }
  if (parsed.database && !allowDb.includes(parsed.database)) {
    // Admin URL should target the maintenance DB (postgres), not an app/prod database name.
    throw new Error(
      `PRODUCTION_DB_GUARD: refusing admin database name "${parsed.database}" (expected postgres)`
    );
  }

  const blob = String(connectionString || "").toLowerCase();
  const banned = [
    "hostinger",
    "pronline.org",
    "blessboard.com",
    "activeclinic",
    "amazonaws.com",
    "neon.tech",
    "supabase.co",
    "railway.app",
    "render.com",
  ];
  for (const token of banned) {
    if (blob.includes(token)) {
      throw new Error(
        `PRODUCTION_DB_GUARD: refusing production/remote marker in test admin URL (${token})`
      );
    }
  }

  return parsed;
}

function localOsUser() {
  const fromEnv = String(process.env.USER || process.env.LOGNAME || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const u = os.userInfo();
    if (u && u.username) return String(u.username);
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Default local admin URL. Prefer explicit OS user + 127.0.0.1 so node-pg does not
 * depend on ambiguous peer/trust socket behavior that overnight runs hit via
 * `postgresql://localhost:5432/postgres` under some Postgres.app hba states.
 */
function defaultLocalAdminConnectionString() {
  const user = localOsUser();
  if (user) {
    return `postgresql://${encodeURIComponent(user)}@127.0.0.1:5432/postgres`;
  }
  return "postgresql://127.0.0.1:5432/postgres";
}

/**
 * Resolve admin URL from env (FOUNDATION_ADMIN_DATABASE_URL / DATABASE_URL_ADMIN)
 * or the canonical local default. Always production-guarded.
 */
function resolveLocalAdminConnectionString() {
  const fromEnv =
    (process.env.FOUNDATION_ADMIN_DATABASE_URL &&
      String(process.env.FOUNDATION_ADMIN_DATABASE_URL).trim()) ||
    (process.env.DATABASE_URL_ADMIN && String(process.env.DATABASE_URL_ADMIN).trim()) ||
    "";
  const url = fromEnv || defaultLocalAdminConnectionString();
  assertLocalNonProductionAdminUrl(url);
  return url;
}

/**
 * Build a local ephemeral DB URL (same host/user/port as admin).
 * @param {string} dbName
 * @param {string} [adminUrl]
 */
function localDatabaseUrlForName(dbName, adminUrl) {
  const name = String(dbName || "");
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) {
    throw new Error("unsafe local database name");
  }
  const admin = adminUrl || resolveLocalAdminConnectionString();
  const parsed = assertLocalNonProductionAdminUrl(admin);
  const user = parsed.username || localOsUser();
  if (user) {
    return `postgresql://${encodeURIComponent(user)}@127.0.0.1:5432/${name}`;
  }
  return `postgresql://127.0.0.1:5432/${name}`;
}

module.exports = {
  LOCAL_HOSTS,
  parsePgUrl,
  assertLocalNonProductionAdminUrl,
  defaultLocalAdminConnectionString,
  resolveLocalAdminConnectionString,
  localDatabaseUrlForName,
  localOsUser,
};
