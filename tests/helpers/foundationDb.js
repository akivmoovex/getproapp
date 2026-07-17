"use strict";

/**
 * Ephemeral empty PostgreSQL helper for clean-foundation tests.
 * Never logs connection strings or credentials.
 */

const { Pool, Client } = require("pg");

const FOUNDATION_DB_NAME = "blessboard_foundation_test";

function adminConnectionString() {
  // Local maintenance DB only — no secrets in repo; user/peer auth for Postgres.app.
  return (
    process.env.FOUNDATION_ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL_ADMIN ||
    "postgresql://localhost:5432/postgres"
  );
}

function foundationDatabaseUrl() {
  if (process.env.FOUNDATION_DATABASE_URL && String(process.env.FOUNDATION_DATABASE_URL).trim()) {
    return String(process.env.FOUNDATION_DATABASE_URL).trim();
  }
  return `postgresql://localhost:5432/${FOUNDATION_DB_NAME}`;
}

/**
 * Drop and recreate the ephemeral foundation test database (empty).
 */
async function resetFoundationDatabase() {
  const adminUrl = adminConnectionString();
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      `SELECT pg_terminate_backend(pid)
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [FOUNDATION_DB_NAME]
    );
    await client.query(`DROP DATABASE IF EXISTS ${FOUNDATION_DB_NAME}`);
    await client.query(`CREATE DATABASE ${FOUNDATION_DB_NAME}`);
  } finally {
    await client.end();
  }
  return foundationDatabaseUrl();
}

/**
 * Drop application schemas for a soft reset without recreating the DB.
 * @param {import('pg').Pool} pool
 */
async function dropFoundationSchemas(pool) {
  await pool.query("DROP SCHEMA IF EXISTS platform CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS blessboard CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS getpro CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS ngo CASCADE");
}

/**
 * @param {string} connectionString
 */
function createFoundationPool(connectionString) {
  return new Pool({ connectionString, max: 4 });
}

module.exports = {
  FOUNDATION_DB_NAME,
  adminConnectionString,
  foundationDatabaseUrl,
  resetFoundationDatabase,
  dropFoundationSchemas,
  createFoundationPool,
};
