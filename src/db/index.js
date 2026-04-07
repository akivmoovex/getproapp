"use strict";

/**
 * PostgreSQL-only guard: stub `db` for legacy imports. Legacy SQLite DDL (`schema.js`,
 * `migrations/*`, etc.) was removed from this package — see `MIGRATIONS.md`.
 */

const { isPgConfigured } = require("./pg/pool");

const isProduction = process.env.NODE_ENV === "production";

const REMOVED = Object.assign(
  new Error(
    "[getpro] SQLite application database has been removed. Configure DATABASE_URL or GETPRO_DATABASE_URL (PostgreSQL required)."
  ),
  { code: "SQLITE_RUNTIME_REMOVED" }
);

/**
 * Fail fast if production is misconfigured to allow the SQLite escape hatch.
 */
function verifyProductionPgOnlyRuntime() {
  if (!isProduction) return;
  if (!isPgConfigured()) return;
  if (process.env.GETPRO_ALLOW_SQLITE_WITH_PG === "1") {
    const err = new Error(
      "[getpro] GETPRO_ALLOW_SQLITE_WITH_PG must not be set when NODE_ENV=production and PostgreSQL is configured."
    );
    err.code = "SQLITE_ESCAPE_HATCH_FORBIDDEN_IN_PRODUCTION";
    throw err;
  }
}

const db = new Proxy(
  {},
  {
    get() {
      throw REMOVED;
    },
  }
);

function getSqliteDb() {
  throw REMOVED;
}

function run() {
  throw REMOVED;
}

function getOne() {
  throw REMOVED;
}

function getAll() {
  throw REMOVED;
}

module.exports = {
  db,
  getSqliteDb,
  verifyProductionPgOnlyRuntime,
  run,
  getOne,
  getAll,
};
