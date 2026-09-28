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
  let socketHost = null;
  try {
    const u = new URL(String(connectionString).replace(/^postgresql:/i, "postgres:"));
    socketHost = u.searchParams.get("host");
  } catch {
    socketHost = null;
  }
  const unixSocket =
    Boolean(socketHost) &&
    (socketHost === "/tmp" ||
      socketHost.startsWith("/tmp/") ||
      socketHost.includes("Postgres") ||
      socketHost.startsWith("/var/") ||
      socketHost.startsWith("/private/tmp"));

  if (unixSocket) {
    // Unix socket URLs often have empty hostname / default port — still local-only.
  } else if (!LOCAL_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `PRODUCTION_DB_GUARD: refusing non-local PostgreSQL host for test admin (${parsed.hostname || "empty"})`
    );
  } else if (String(parsed.port) !== "5432") {
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
 * Default local admin URL. Prefer Unix-socket peer/trust via host=/tmp
 * (inet_server_addr null). Postgres.app intermittently returns XX000
 * "rejected trust authentication" for rapid TCP connects under batched
 * node:test churn; socket query avoids that path while remaining local-only.
 *
 * WHATWG URL requires a hostname token, so we keep 127.0.0.1 as a placeholder
 * and override with ?host=/tmp for node-pg.
 */
function defaultLocalAdminConnectionString() {
  const user = localOsUser();
  const q = "host=%2Ftmp";
  if (user) {
    return `postgresql://${encodeURIComponent(user)}@127.0.0.1/postgres?${q}`;
  }
  return `postgresql://127.0.0.1/postgres?${q}`;
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
  assertLocalNonProductionAdminUrl(admin, {
    allowDatabaseNames: ["postgres"],
  });
  const user = parsePgUrl(admin).username || localOsUser();
  let socketDir = null;
  try {
    const u = new URL(String(admin).replace(/^postgresql:/i, "postgres:"));
    socketDir = u.searchParams.get("host");
  } catch {
    socketDir = null;
  }
  if (socketDir && socketDir.startsWith("/")) {
    const q = `host=${encodeURIComponent(socketDir)}`;
    if (user) {
      return `postgresql://${encodeURIComponent(user)}@127.0.0.1/${name}?${q}`;
    }
    return `postgresql://127.0.0.1/${name}?${q}`;
  }
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
