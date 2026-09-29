"use strict";

/**
 * V8 ↔ V7 shared-database compatibility baseline tests.
 * Disposable local PostgreSQL only. Never targets hosted/production URLs.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate, FOUNDATION_MIGRATE_LOCK_KEY } = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  COMPAT_PHASE,
  PHASE_RULES,
  V7_REQUIRED_RELATIONS,
  SHARED_WRITE_RISKS,
  REQUIRED_MIGRATIONS,
  lintMigrationSqlForV7Compatibility,
  isAdditiveColumnDdlSafe,
  inspectV7RequiredRelations,
} = require("../src/platform/schema/v8DbCompatibilityContract");
const {
  inspectV7RuntimeSchemaCompatibility,
} = require("../src/platform/schema/v7RuntimeSchemaCompatibility");

const IDENTITY_KEY = "moovex-platform-v7";
const ROOT = path.resolve(__dirname, "..");

let pool;
let skipReason = null;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

describe("V8 DB compatibility baseline", () => {
  before(async () => {
    try {
      const url = await resetFoundationDatabase();
      pool = createFoundationPool(url);
      await migrate({ pool });
      await ensureDatabaseIdentity(pool, {
        connectionString: url,
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

  it("defines expand/contract rules that forbid V7 contract while V7 is active", () => {
    assert.ok(PHASE_RULES[COMPAT_PHASE.EXPAND]);
    assert.ok(PHASE_RULES[COMPAT_PHASE.CONTRACT]);
    assert.match(
      PHASE_RULES[COMPAT_PHASE.CONTRACT].forbidden.join(" "),
      /Remove V7|while V7 remains active/i
    );
    assert.ok(SHARED_WRITE_RISKS.length >= 5);
    assert.ok(V7_REQUIRED_RELATIONS.length >= 15);
    assert.ok(REQUIRED_MIGRATIONS.length >= 10);
  });

  it("lints destructive SQL as incompatible with shared V7/V8 database", () => {
    const dropCol = lintMigrationSqlForV7Compatibility(
      "ALTER TABLE platform.organizations DROP COLUMN display_name;"
    );
    assert.equal(dropCol.ok, false);
    assert.ok(dropCol.violations.some((v) => v.id === "drop_column"));

    const rename = lintMigrationSqlForV7Compatibility(
      "ALTER TABLE platform.identities RENAME COLUMN email_normalized TO email_norm;"
    );
    assert.equal(rename.ok, false);

    const dropTable = lintMigrationSqlForV7Compatibility(
      "DROP TABLE platform.deployment_sessions;"
    );
    assert.equal(dropTable.ok, false);

    const additive = lintMigrationSqlForV7Compatibility(
      "ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS v8_notes TEXT NULL;"
    );
    assert.equal(additive.ok, true);
  });

  it("accepts only safe additive column DDL", () => {
    assert.equal(
      isAdditiveColumnDdlSafe(
        "ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS v8_flag TEXT NULL"
      ),
      true
    );
    assert.equal(
      isAdditiveColumnDdlSafe(
        "ALTER TABLE platform.organizations ADD COLUMN v8_flag TEXT NOT NULL DEFAULT 'x'"
      ),
      true
    );
    assert.equal(
      isAdditiveColumnDdlSafe(
        "ALTER TABLE platform.organizations ADD COLUMN v8_flag TEXT NOT NULL"
      ),
      false
    );
  });

  it("documents migrator locking and ledger constants", () => {
    assert.equal(FOUNDATION_MIGRATE_LOCK_KEY, 824510017);
    const migratorSrc = fs.readFileSync(
      path.join(ROOT, "db/scripts/lib/migrator.js"),
      "utf8"
    );
    assert.match(migratorSrc, /pg_advisory_lock/);
    assert.match(migratorSrc, /platform\.schema_migrations/);
    assert.match(migratorSrc, /Checksum drift rejected/);
  });

  it("application servers must not run migrations at startup", () => {
    const files = [
      "src/platform/http/moovexPlatformRuntimeServer.js",
      "src/activeclinic/http/activeClinicFoundationServer.js",
      "src/platform/http/v5FoundationServer.js",
      "src/platform/schema/v7RuntimeSchemaCompatibility.js",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(src, /\bmigrate\s*\(\s*\{/);
      assert.doesNotMatch(src, /require\(["'].*migrator["']\)/);
    }
    const gate = fs.readFileSync(
      path.join(ROOT, "src/platform/schema/v7RuntimeSchemaCompatibility.js"),
      "utf8"
    );
    assert.match(gate, /Do not run migrations from application startup/);
  });

  it("baseline documentation exists and forbids separate V8 database", () => {
    const doc = fs.readFileSync(
      path.join(ROOT, "docs/database/V8_DB_COMPATIBILITY_BASELINE.md"),
      "utf8"
    );
    assert.match(doc, /no separate V8 database/i);
    assert.match(doc, /expand\/contract/i);
    assert.match(doc, /neuniversity\.org/);
    assert.match(doc, /pronline\.org/);
    assert.match(doc, /Do not run migrations from application startup|startup does not run migrations/i);
  });

  it("migrated fixture retains all V7-required relation columns", async () => {
    if (!requireDb()) return;
    const report = await inspectV7RequiredRelations(pool);
    assert.equal(
      report.ok,
      true,
      report.failed.map((f) => `${f.relation}:${f.missing.join(",")}`).join("; ")
    );
  });

  it("V7 runtime schema compatibility remains ok on fixture", async () => {
    if (!requireDb()) return;
    const report = await inspectV7RuntimeSchemaCompatibility(pool);
    assert.equal(report.compatible, true, JSON.stringify(report.failures || report, null, 2));
  });

  it("additive nullable column does not break V7-required reads", async () => {
    if (!requireDb()) return;
    const ddl =
      "ALTER TABLE platform.organizations ADD COLUMN IF NOT EXISTS v8_compat_probe TEXT NULL";
    assert.equal(isAdditiveColumnDdlSafe(ddl), true);
    assert.equal(lintMigrationSqlForV7Compatibility(ddl).ok, true);

    await pool.query(ddl);

    const cols = await inspectV7RequiredRelations(pool);
    assert.equal(cols.ok, true);

    const sample = await pool.query(
      `SELECT id, organization_key, display_name, status, data_environment
         FROM platform.organizations
        LIMIT 1`
    );
    assert.ok(Array.isArray(sample.rows));

    const probe = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_schema = 'platform'
          AND table_name = 'organizations'
          AND column_name = 'v8_compat_probe'`
    );
    assert.equal(probe.rowCount, 1);
  });

  it("migrate re-execution is idempotent (checksum skip)", async () => {
    if (!requireDb()) return;
    const firstCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.schema_migrations`
    );
    const summary = await migrate({ pool });
    assert.equal(summary.applied.length, 0);
    assert.ok(summary.skipped.length > 0);
    const secondCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM platform.schema_migrations`
    );
    assert.equal(secondCount.rows[0].n, firstCount.rows[0].n);
  });

  it("failed DDL rolls back inside a migration transaction (no partial apply)", async () => {
    if (!requireDb()) return;
    const client = await pool.connect();
    try {
      const before = await client.query(
        `SELECT COUNT(*)::int AS n
           FROM information_schema.columns
          WHERE table_schema = 'platform' AND table_name = 'organizations'
            AND column_name = 'v8_rollback_probe'`
      );
      assert.equal(before.rows[0].n, 0);

      await client.query("BEGIN");
      try {
        await client.query(
          "ALTER TABLE platform.organizations ADD COLUMN v8_rollback_probe TEXT NULL"
        );
        await client.query("SELECT definitely_missing_relation_xyz___");
        await client.query("COMMIT");
        assert.fail("expected SQL failure");
      } catch {
        await client.query("ROLLBACK");
      }

      const after = await client.query(
        `SELECT COUNT(*)::int AS n
           FROM information_schema.columns
          WHERE table_schema = 'platform' AND table_name = 'organizations'
            AND column_name = 'v8_rollback_probe'`
      );
      assert.equal(after.rows[0].n, 0);
    } finally {
      client.release();
    }
  });

  it("policy forbids automatic production migrations", () => {
    const policy = fs.readFileSync(
      path.join(ROOT, "docs/platform/V8_DEVELOPMENT_POLICY.md"),
      "utf8"
    );
    assert.match(policy, /No automatic migrations or deployments to production/i);
    assert.match(policy, /V7-compatible/i);
  });
});
