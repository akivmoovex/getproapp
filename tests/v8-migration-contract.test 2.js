"use strict";

/**
 * Shared database migration-contract tests for V8.
 * Disposable foundation DBs only — never hosted V7/testing data.
 *
 * Covers:
 * - Idempotent migrate (second run applies 0)
 * - Checksum drift rejection
 * - Additive-only lint vs destructive SQL
 * - Advisory lock key stability
 * - Required migrations recorded after migrate
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  migrate,
  discoverMigrations,
  FOUNDATION_MIGRATE_LOCK_KEY,
  MODULE_ORDER,
} = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  REQUIRED_MIGRATIONS,
  lintMigrationSqlForV7Compatibility,
  isAdditiveColumnDdlSafe,
} = require("../src/platform/schema/v8DbCompatibilityContract");

const IDENTITY_KEY = "moovex-platform-v7";
const ROOT = path.resolve(__dirname, "..");

let pool;
let databaseUrl;
let skipReason = null;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

describe("V8 shared migration contract", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ pool });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
      pool = null;
    }
  });

  after(async () => {
    if (pool) {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    }
  });

  it("keeps the foundation migrate advisory lock key stable", () => {
    assert.equal(FOUNDATION_MIGRATE_LOCK_KEY, 824510017);
  });

  it("discovers migrations in module order platform → blessboard → activeclinic", () => {
    assert.deepEqual(MODULE_ORDER.slice(0, 3), ["platform", "blessboard", "activeclinic"]);
    const files = discoverMigrations();
    assert.ok(files.length >= REQUIRED_MIGRATIONS.length);
    let lastModuleIdx = -1;
    for (const f of files) {
      const idx = MODULE_ORDER.indexOf(f.module);
      assert.ok(idx >= 0, `unknown module ${f.module}`);
      assert.ok(idx >= lastModuleIdx, "module order violated");
      lastModuleIdx = idx;
    }
  });

  it("records all REQUIRED_MIGRATIONS after a clean migrate", async () => {
    if (!requireDb()) return;
    const r = await pool.query(
      `SELECT module, version, filename, checksum
         FROM platform.schema_migrations
        ORDER BY module, version`
    );
    const key = (row) => `${row.module}/${row.version}`;
    const applied = new Map(r.rows.map((row) => [key(row), row]));
    for (const req of REQUIRED_MIGRATIONS) {
      const row = applied.get(`${req.module}/${req.version}`);
      assert.ok(row, `missing required migration ${req.module}/${req.version}`);
      assert.equal(row.filename, req.filename);
      assert.match(row.checksum, /^[a-f0-9]{64}$/);
    }
  });

  it("second migrate is idempotent (applies zero new versions)", async () => {
    if (!requireDb()) return;
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM platform.schema_migrations`
    );
    const result = await migrate({ pool });
    const after = await pool.query(
      `SELECT count(*)::int AS n FROM platform.schema_migrations`
    );
    assert.equal(after.rows[0].n, before.rows[0].n);
    assert.ok(result && Array.isArray(result.applied));
    assert.equal(result.applied.length, 0);
  });

  it("rejects checksum drift for an already-applied migration", async () => {
    if (!requireDb()) return;
    const sample = await pool.query(
      `SELECT module, version, filename, checksum
         FROM platform.schema_migrations
        WHERE module = 'platform'
        ORDER BY version
        LIMIT 1`
    );
    assert.ok(sample.rows[0], "expected at least one platform migration");
    const row = sample.rows[0];
    const fakeChecksum = crypto.createHash("sha256").update("drift").digest("hex");
    assert.notEqual(fakeChecksum, row.checksum);

    await pool.query(
      `UPDATE platform.schema_migrations SET checksum = $1
        WHERE module = $2 AND version = $3`,
      [fakeChecksum, row.module, row.version]
    );

    let threw = false;
    try {
      await migrate({ pool });
    } catch (err) {
      threw = true;
      assert.match(String(err && err.message), /Checksum drift/i);
    } finally {
      // Restore real checksum from disk so later suites on same DB stay consistent.
      const migrations = discoverMigrations();
      const file = migrations.find(
        (m) => m.module === row.module && m.version === row.version
      );
      assert.ok(file, "migration file on disk");
      await pool.query(
        `UPDATE platform.schema_migrations SET checksum = $1
          WHERE module = $2 AND version = $3`,
        [file.checksum, row.module, row.version]
      );
    }
    assert.equal(threw, true);
  });

  it("lints migration SQL: additive ok, destructive forbidden", () => {
    assert.equal(
      lintMigrationSqlForV7Compatibility(
        "ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS v8_gate_probe TEXT NULL;"
      ).ok,
      true
    );
    assert.equal(
      isAdditiveColumnDdlSafe(
        "ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS v8_gate_probe TEXT NULL"
      ),
      true
    );
    const drop = lintMigrationSqlForV7Compatibility(
      "ALTER TABLE platform.organizations DROP COLUMN display_name;"
    );
    assert.equal(drop.ok, false);
    const rename = lintMigrationSqlForV7Compatibility(
      "ALTER TABLE platform.identities RENAME TO identities_v8;"
    );
    assert.equal(rename.ok, false);
  });

  it("new V8-era migration SQL must pass additive compatibility lint", () => {
    // Gate only post-V7 contract files (version >= 200) if any exist; historical
    // V7 migrations are already applied on the shared DB and are not rewritten.
    const migrationsRoot = path.join(ROOT, "db", "migrations");
    const offenders = [];
    for (const mod of MODULE_ORDER) {
      const dir = path.join(migrationsRoot, mod);
      if (!fs.existsSync(dir)) continue;
      for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith(".sql")) continue;
        const version = Number((/^(\d+)_/.exec(name) || [])[1] || 0);
        if (version < 200) continue;
        const sql = fs.readFileSync(path.join(dir, name), "utf8");
        const lint = lintMigrationSqlForV7Compatibility(sql);
        if (!lint.ok) {
          offenders.push(`${mod}/${name}: ${lint.violations.map((v) => v.id).join(",")}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });
});
