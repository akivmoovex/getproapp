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
const {
  resolveLocalAdminConnectionString,
  localDatabaseUrlForName,
  assertLocalNonProductionAdminUrl,
} = require("./localPostgresAdmin");

/** Legacy shared name (docs / env examples). Prefer unique names from resetFoundationDatabase(). */
const FOUNDATION_DB_NAME = "blessboard_foundation_test";
const FOUNDATION_DB_NAME_PREFIX = "blessboard_ft_";

/** @type {Set<string>} */
const createdDatabases = new Set();
let cleanupRegistered = false;
/** Serialize admin CREATE/DROP within one process. */
let adminChain = Promise.resolve();

function adminConnectionString() {
  // Canonical local Postgres.app admin URL (production-guarded).
  return resolveLocalAdminConnectionString();
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
    return localDatabaseUrlForName(assertSafeDbName(dbName), adminConnectionString());
  }
  if (process.env.FOUNDATION_DATABASE_URL && String(process.env.FOUNDATION_DATABASE_URL).trim()) {
    const fixed = String(process.env.FOUNDATION_DATABASE_URL).trim();
    // Ephemeral/app DB URLs must still be local — reuse host/port checks via admin parse.
    assertLocalNonProductionAdminUrl(adminConnectionString());
    const hostOk = /@(127\.0\.0\.1|localhost|\[::1\]):5432\//i.test(fixed) ||
      /^postgres(ql)?:\/\/(127\.0\.0\.1|localhost|\[::1\]):5432\//i.test(fixed) ||
      /^postgres(ql)?:\/\/[^/@]+@(127\.0\.0\.1|localhost|\[::1\]):5432\//i.test(fixed);
    if (!hostOk) {
      throw new Error("PRODUCTION_DB_GUARD: FOUNDATION_DATABASE_URL must target local 127.0.0.1:5432");
    }
    return fixed;
  }
  return localDatabaseUrlForName(FOUNDATION_DB_NAME, adminConnectionString());
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
async function connectAdminClient(adminUrl, attempts = 8) {
  let lastErr = null;
  for (let i = 0; i < attempts; i += 1) {
    const client = new Client({ connectionString: adminUrl });
    try {
      await client.connect();
      return client;
    } catch (err) {
      lastErr = err;
      try {
        await client.end();
      } catch {
        /* ignore */
      }
      const code = err && err.code ? String(err.code) : "";
      const msg = err && err.message ? String(err.message) : String(err);
      // Postgres.app intermittently returns XX000 "rejected trust authentication"
      // under rapid CREATE DATABASE / connect churn. Retry with backoff.
      const retryable =
        code === "XX000" ||
        code === "53300" ||
        /rejected "trust" authentication/i.test(msg) ||
        /too many clients/i.test(msg) ||
        /remaining connection slots/i.test(msg);
      if (!retryable || i === attempts - 1) break;
      const delayMs = Math.min(2000, 50 * 2 ** i);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  const code = lastErr && lastErr.code ? String(lastErr.code) : "";
  const msg = lastErr && lastErr.message ? String(lastErr.message) : String(lastErr);
  throw new Error(`foundation admin connect failed${code ? ` [${code}]` : ""}: ${msg}`);
}

async function resetFoundationDatabase() {
  const run = async () => {
    const adminUrl = adminConnectionString();
    const client = await connectAdminClient(adminUrl);
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
 * Drop an ephemeral foundation database by URL (best-effort).
 * Only names matching the foundation test prefix (or legacy shared name) are allowed.
 * @param {string} connectionString
 */
async function dropFoundationDatabaseByUrl(connectionString) {
  const dbName = parseDatabaseNameFromUrl(connectionString);
  if (!dbName) return;
  assertSafeDbName(dbName);
  const allowed =
    dbName === FOUNDATION_DB_NAME || dbName.startsWith(FOUNDATION_DB_NAME_PREFIX);
  if (!allowed) {
    throw new Error("refusing to drop non-foundation database name");
  }
  const client = new Client({ connectionString: adminConnectionString() });
  await client.connect();
  try {
    await dropDatabaseByName(client, dbName);
    createdDatabases.delete(dbName);
  } finally {
    await client.end();
  }
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
  dropFoundationDatabaseByUrl,
  createFoundationPool,
  cleanupCreatedFoundationDatabases,
  foundationDbUnavailableSkipReason,
};
