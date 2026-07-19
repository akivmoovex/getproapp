"use strict";

/**
 * Ephemeral empty PostgreSQL helper for clean-foundation tests.
 * Never logs connection strings or credentials.
 *
 * Each resetFoundationDatabase() call allocates a unique database name so
 * concurrent `node --test` files do not DROP/CREATE the same DB mid-suite.
 */

const crypto = require("crypto");
const { Pool, Client } = require("pg");

/** Legacy shared name (docs / env examples). Prefer unique names from resetFoundationDatabase(). */
const FOUNDATION_DB_NAME = "blessboard_foundation_test";
const FOUNDATION_DB_NAME_PREFIX = "blessboard_ft_";

/** @type {Set<string>} */
const createdDatabases = new Set();
let cleanupRegistered = false;
/** Serialize admin CREATE/DROP within one process. */
let adminChain = Promise.resolve();

function adminConnectionString() {
  // Local maintenance DB only — no secrets in repo; user/peer auth for Postgres.app.
  return (
    process.env.FOUNDATION_ADMIN_DATABASE_URL ||
    process.env.DATABASE_URL_ADMIN ||
    "postgresql://localhost:5432/postgres"
  );
}

/**
 * @param {string} name
 */
function assertSafeDbName(name) {
  const n = String(name || "");
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(n)) {
    throw new Error("unsafe foundation database name");
  }
  return n;
}

/**
 * @param {string} connectionString
 */
function parseDatabaseNameFromUrl(connectionString) {
  try {
    const u = new URL(String(connectionString || "").replace(/^postgresql:/i, "postgres:"));
    const name = (u.pathname || "").replace(/^\//, "").split("/")[0];
    return name ? decodeURIComponent(name) : "";
  } catch {
    return "";
  }
}

function allocateFoundationDbName() {
  return assertSafeDbName(
    `${FOUNDATION_DB_NAME_PREFIX}${process.pid}_${Date.now().toString(36)}_${crypto
      .randomBytes(2)
      .toString("hex")}`
  );
}

function foundationDatabaseUrl(dbName) {
  if (dbName) {
    return `postgresql://localhost:5432/${assertSafeDbName(dbName)}`;
  }
  if (process.env.FOUNDATION_DATABASE_URL && String(process.env.FOUNDATION_DATABASE_URL).trim()) {
    return String(process.env.FOUNDATION_DATABASE_URL).trim();
  }
  return `postgresql://localhost:5432/${FOUNDATION_DB_NAME}`;
}

/**
 * @param {import('pg').Client} client
 * @param {string} dbName
 */
async function dropDatabaseByName(client, dbName) {
  const name = assertSafeDbName(dbName);
  await client.query(
    `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
      WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [name]
  );
  await client.query(`DROP DATABASE IF EXISTS ${name}`);
}

async function cleanupCreatedFoundationDatabases() {
  if (createdDatabases.size === 0) return;
  const names = [...createdDatabases];
  createdDatabases.clear();
  const client = new Client({ connectionString: adminConnectionString() });
  try {
    await client.connect();
    for (const name of names) {
      try {
        await dropDatabaseByName(client, name);
      } catch {
        /* best-effort */
      }
    }
  } catch {
    /* best-effort */
  } finally {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
  }
}

function registerCleanup() {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.once("beforeExit", () => {
    void cleanupCreatedFoundationDatabases();
  });
}

/**
 * Drop and recreate an ephemeral foundation test database (empty).
 * Returns a connection URL unique to this call (unless FOUNDATION_DATABASE_URL is set).
 */
async function resetFoundationDatabase() {
  const run = async () => {
    const adminUrl = adminConnectionString();
    const client = new Client({ connectionString: adminUrl });
    await client.connect();
    try {
      const fixedUrl =
        process.env.FOUNDATION_DATABASE_URL && String(process.env.FOUNDATION_DATABASE_URL).trim()
          ? String(process.env.FOUNDATION_DATABASE_URL).trim()
          : "";

      if (fixedUrl) {
        // Explicit shared URL — operator must avoid concurrent resets against the same name.
        const dbName = assertSafeDbName(parseDatabaseNameFromUrl(fixedUrl) || FOUNDATION_DB_NAME);
        await dropDatabaseByName(client, dbName);
        await client.query(`CREATE DATABASE ${dbName}`);
        return fixedUrl;
      }

      const dbName = allocateFoundationDbName();
      await client.query(`CREATE DATABASE ${dbName}`);
      createdDatabases.add(dbName);
      registerCleanup();
      return foundationDatabaseUrl(dbName);
    } finally {
      await client.end();
    }
  };

  const next = adminChain.then(run, run);
  adminChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
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

/**
 * Explicit skip reason for node:test when foundation setup cannot run locally.
 * Prefer this over opaque "setup failed" so CI reports stay actionable.
 * @param {string} detail
 */
function foundationDbUnavailableSkipReason(detail) {
  const msg = String(detail || "unknown").slice(0, 240);
  return (
    `REQUIRES DATABASE: local PostgreSQL foundation fixture unavailable (${msg}). ` +
    "Start local Postgres (or set FOUNDATION_ADMIN_DATABASE_URL); this skip is not a product pass."
  );
}

module.exports = {
  FOUNDATION_DB_NAME,
  FOUNDATION_DB_NAME_PREFIX,
  adminConnectionString,
  foundationDatabaseUrl,
  resetFoundationDatabase,
  dropFoundationSchemas,
  createFoundationPool,
  cleanupCreatedFoundationDatabases,
  foundationDbUnavailableSkipReason,
};
