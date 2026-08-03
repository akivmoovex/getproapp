"use strict";

/**
 * Clean multi-schema migration runner.
 * Authority: db/migrations/<module>/*.sql + db/seeds/*.sql
 * Connection: DATABASE_URL only. Never prints credentials.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
const { requireDatabaseUrl } = require("./databaseUrl");
const { buildFoundationPoolConfig } = require("./foundationPool");

const MODULE_ORDER = ["platform", "blessboard", "activeclinic", "getpro", "ngo"];

/** pg_advisory_lock key for foundation migrate concurrency protection */
const FOUNDATION_MIGRATE_LOCK_KEY = 824510017;

const DB_ROOT = path.resolve(__dirname, "..", "..");
const MIGRATIONS_ROOT = path.join(DB_ROOT, "migrations");
const SEEDS_ROOT = path.join(DB_ROOT, "seeds");

const SCHEMA_MIGRATIONS_DDL = `
CREATE SCHEMA IF NOT EXISTS platform;

CREATE TABLE IF NOT EXISTS platform.schema_migrations (
  module TEXT NOT NULL,
  version TEXT NOT NULL,
  filename TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  execution_ms INTEGER NOT NULL CHECK (execution_ms >= 0),
  PRIMARY KEY (module, version)
);

CREATE INDEX IF NOT EXISTS schema_migrations_applied_at_idx
  ON platform.schema_migrations (applied_at);
`;

function sha256Hex(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function versionFromFilename(filename) {
  const base = path.basename(filename);
  const m = /^(\d+)_/.exec(base);
  if (!m) {
    throw new Error(`[db:migrate] Filename must start with digits_: ${base}`);
  }
  return m[1];
}

/**
 * @param {string} dir
 * @param {string} moduleName
 * @returns {Array<{ module: string, version: string, filename: string, absolutePath: string, checksum: string, sql: string }>}
 */
function listSqlFiles(dir, moduleName) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.includes(" 2."))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    .map((filename) => {
      const absolutePath = path.join(dir, filename);
      const sql = fs.readFileSync(absolutePath, "utf8");
      return {
        module: moduleName,
        version: versionFromFilename(filename),
        filename,
        absolutePath,
        checksum: sha256Hex(sql),
        sql,
      };
    });
}

function discoverMigrations() {
  const files = [];
  for (const moduleName of MODULE_ORDER) {
    files.push(...listSqlFiles(path.join(MIGRATIONS_ROOT, moduleName), moduleName));
  }
  return files;
}

function discoverSeeds() {
  return listSqlFiles(SEEDS_ROOT, "seeds");
}

/**
 * @param {import('pg').Pool} pool
 */
async function ensureMigrationLedger(pool) {
  await pool.query(SCHEMA_MIGRATIONS_DDL);
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} moduleName
 * @param {string} version
 */
async function getAppliedRow(client, moduleName, version) {
  const r = await client.query(
    `SELECT module, version, filename, checksum, applied_at, execution_ms
       FROM platform.schema_migrations
      WHERE module = $1 AND version = $2`,
    [moduleName, version]
  );
  return r.rows[0] || null;
}

/**
 * @param {import('pg').PoolClient} client
 * @param {{ module: string, version: string, filename: string, checksum: string, sql: string }} file
 * @returns {Promise<'applied'|'skipped'>}
 */
async function applyOne(client, file) {
  const existing = await getAppliedRow(client, file.module, file.version);
  if (existing) {
    if (existing.checksum !== file.checksum) {
      throw new Error(
        `[db:migrate] Checksum drift rejected for ${file.module}/${file.version} (${file.filename}). ` +
          `Recorded checksum does not match file on disk. Refusing to continue.`
      );
    }
    return "skipped";
  }

  const started = Date.now();
  await client.query("BEGIN");
  try {
    await client.query(file.sql);
    const executionMs = Math.max(0, Date.now() - started);
    await client.query(
      `INSERT INTO platform.schema_migrations
         (module, version, filename, checksum, applied_at, execution_ms)
       VALUES ($1, $2, $3, $4, now(), $5)`,
      [file.module, file.version, file.filename, file.checksum, executionMs]
    );
    await client.query("COMMIT");
    return "applied";
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * @param {{ pool?: import('pg').Pool, connectionString?: string }} [opts]
 */
async function createPool(opts = {}) {
  if (opts.pool) return { pool: opts.pool, owned: false };
  const connectionString = opts.connectionString || requireDatabaseUrl();
  const pool = new Pool(buildFoundationPoolConfig(connectionString, { max: 2 }));
  return { pool, owned: true };
}

/**
 * @param {{ pool?: import('pg').Pool, connectionString?: string }} [opts]
 */
async function migrate(opts = {}) {
  const { pool, owned } = await createPool(opts);
  const client = await pool.connect();
  const summary = {
    applied: [],
    skipped: [],
    seedsApplied: [],
    seedsSkipped: [],
  };
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [FOUNDATION_MIGRATE_LOCK_KEY]);
    locked = true;

    await ensureMigrationLedger(pool);

    const migrations = discoverMigrations();
    for (const file of migrations) {
      const result = await applyOne(client, file);
      if (result === "applied") summary.applied.push(`${file.module}/${file.filename}`);
      else summary.skipped.push(`${file.module}/${file.filename}`);
    }

    const seeds = discoverSeeds();
    for (const file of seeds) {
      const result = await applyOne(client, file);
      if (result === "applied") summary.seedsApplied.push(file.filename);
      else summary.seedsSkipped.push(file.filename);
    }

    return summary;
  } finally {
    if (locked) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [FOUNDATION_MIGRATE_LOCK_KEY]);
      } catch {
        /* ignore */
      }
    }
    client.release();
    if (owned) await pool.end();
  }
}

/**
 * Read-only migration status. Does not create the ledger.
 * @param {{ pool?: import('pg').Pool, connectionString?: string }} [opts]
 */
async function statusReadOnly(opts = {}) {
  const { pool, owned } = await createPool(opts);
  try {
    const tableCheck = await pool.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'platform' AND table_name = 'schema_migrations'`
    );
    if (tableCheck.rowCount === 0) {
      const discovered = [...discoverMigrations(), ...discoverSeeds()];
      return {
        total: discovered.length,
        applied: 0,
        pending: discovered.length,
        drift: 0,
        ledger_missing: true,
        rows: discovered.map((file) => ({
          module: file.module,
          version: file.version,
          filename: file.filename,
          state: "pending",
          checksum: file.checksum,
          applied_at: null,
          execution_ms: null,
        })),
      };
    }

    const discovered = [...discoverMigrations(), ...discoverSeeds()];
    const r = await pool.query(
      `SELECT module, version, filename, checksum, applied_at, execution_ms
         FROM platform.schema_migrations
        ORDER BY module, version`
    );
    const appliedByKey = new Map(r.rows.map((row) => [`${row.module}:${row.version}`, row]));

    const rows = discovered.map((file) => {
      const key = `${file.module}:${file.version}`;
      const applied = appliedByKey.get(key);
      let state = "pending";
      if (applied) {
        state = applied.checksum === file.checksum ? "applied" : "drift";
      }
      return {
        module: file.module,
        version: file.version,
        filename: file.filename,
        state,
        checksum: file.checksum,
        applied_at: applied ? applied.applied_at : null,
        execution_ms: applied ? applied.execution_ms : null,
      };
    });

    return {
      total: rows.length,
      applied: rows.filter((x) => x.state === "applied").length,
      pending: rows.filter((x) => x.state === "pending").length,
      drift: rows.filter((x) => x.state === "drift").length,
      ledger_missing: false,
      rows,
    };
  } finally {
    if (owned) await pool.end();
  }
}

/**
 * Migration status report (read-only). Does not create schemas or the ledger.
 * @param {{ pool?: import('pg').Pool, connectionString?: string }} [opts]
 */
async function status(opts = {}) {
  return statusReadOnly(opts);
}

module.exports = {
  MODULE_ORDER,
  DB_ROOT,
  MIGRATIONS_ROOT,
  SEEDS_ROOT,
  FOUNDATION_MIGRATE_LOCK_KEY,
  discoverMigrations,
  discoverSeeds,
  ensureMigrationLedger,
  migrate,
  status,
  statusReadOnly,
  sha256Hex,
  versionFromFilename,
};
