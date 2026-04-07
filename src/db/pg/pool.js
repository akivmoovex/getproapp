"use strict";

/**
 * Lazy PostgreSQL connection pool for Supabase (or any Postgres).
 * Used by repositories and by server.js (connect-pg-simple). The HTTP server requires a connection string at boot.
 *
 * Configure with DATABASE_URL or GETPRO_DATABASE_URL (connection string from Supabase → Settings → Database).
 * Do not commit secrets.
 */

const { Pool } = require("pg");

let pool = null;

function connectionStringFromEnv() {
  const raw = process.env.DATABASE_URL || process.env.GETPRO_DATABASE_URL || "";
  return typeof raw === "string" ? raw.trim() : "";
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
    pool = new Pool({
      connectionString: connectionStringFromEnv(),
      max: Number(process.env.GETPRO_PG_POOL_MAX) || 10,
      idleTimeoutMillis: Number(process.env.GETPRO_PG_IDLE_MS) || 30000,
      connectionTimeoutMillis: Number(process.env.GETPRO_PG_CONNECT_TIMEOUT_MS) || 10000,
    });
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
}

module.exports = {
  getPgPool,
  isPgConfigured,
  closePgPool,
};
