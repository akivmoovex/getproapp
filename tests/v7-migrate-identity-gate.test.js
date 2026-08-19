"use strict";

/**
 * db:migrate must refuse a mismatched database identity when an expected key
 * is set, and must still bootstrap when identity is not initialized.
 */

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const {
  MODULE_ORDER,
  discoverMigrations,
  assertMigrateIdentityGate,
  migrate,
} = require("../db/scripts/lib/migrator");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");
const {
  EXPECTED_KEY: TESTING_MIGRATE_KEY,
  EXPECTED_ENV: TESTING_MIGRATE_ENV,
  assertTestingMigrateTarget,
  assertTestingDatabaseIdentity,
} = require("../db/scripts/migrate-testing");
const {
  REQUIRED_MIGRATIONS,
  CAPABILITY,
  inspectV7RuntimeSchemaCompatibility,
  assertV7RuntimeSchemaCompatibilityOrExit,
} = require("../src/platform/schema/v7RuntimeSchemaCompatibility");

const IDENTITY_KEY = "blessboard-platform-v5";
const PROCESS_KEYS = ["DATABASE_IDENTITY_EXPECTED", "DATABASE_IDENTITY_ENV", "DEPLOYMENT_ENV"];

let pool;
let skipReason = null;
let databaseUrl = null;

function requireDb() {
  if (skipReason) {
    // eslint-disable-next-line no-console
    console.log("skip:", skipReason);
    return false;
  }
  return true;
}

async function withEnv(overrides, fn) {
  const prev = {};
  for (const key of PROCESS_KEYS) prev[key] = process.env[key];
  for (const key of PROCESS_KEYS) {
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  try {
    return await fn();
  } finally {
    for (const key of PROCESS_KEYS) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
}

describe("V7 migrate identity gate and required migration order", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await withEnv({}, async () => {
        await migrate({ pool });
      });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message).slice(0, 240) : "no foundation db";
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  beforeEach(() => {
    for (const key of PROCESS_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of PROCESS_KEYS) delete process.env[key];
  });

  it("applies modules in platform → blessboard → activeclinic → getpro → ngo order", () => {
    assert.deepEqual(MODULE_ORDER, ["platform", "blessboard", "activeclinic", "getpro", "ngo"]);
    const files = discoverMigrations();
    const seen = [];
    for (const file of files) {
      if (!seen.includes(file.module)) seen.push(file.module);
    }
    assert.deepEqual(
      seen.filter((moduleName) => MODULE_ORDER.includes(moduleName)),
      MODULE_ORDER.filter((moduleName) => seen.includes(moduleName))
    );
    const byModule = new Map();
    for (const file of files) {
      const versions = byModule.get(file.module) || [];
      versions.push(file.version);
      byModule.set(file.module, versions);
    }
    for (const versions of byModule.values()) {
      const sorted = versions.slice().sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
      assert.deepEqual(versions, sorted);
    }
  });

  it("required V7 migrations include provision_stage files after canonical lifecycle", () => {
    const keys = REQUIRED_MIGRATIONS.map((item) => `${item.module}:${item.version}`);
    assert.ok(keys.includes("platform:031"));
    assert.ok(keys.includes("blessboard:095"));
    assert.ok(keys.includes("blessboard:099"));
    assert.ok(keys.includes("activeclinic:030"));
    assert.ok(keys.includes("activeclinic:031"));
    const ac030 = keys.indexOf("activeclinic:030");
    const ac031 = keys.indexOf("activeclinic:031");
    const bb098 = keys.indexOf("blessboard:098");
    const bb099 = keys.indexOf("blessboard:099");
    assert.ok(ac030 >= 0 && ac031 > ac030);
    assert.ok(bb098 >= 0 && bb099 > bb098);
  });

  it("skips the identity gate when DATABASE_IDENTITY_EXPECTED is unset", async () => {
    if (!requireDb()) return;
    const result = await withEnv({}, () => assertMigrateIdentityGate(pool));
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "no_expected_identity");
  });

  it("allows migrate when expected identity matches testing", async () => {
    if (!requireDb()) return;
    await withEnv(
      {
        DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
        DATABASE_IDENTITY_ENV: "testing",
      },
      async () => {
        const gate = await assertMigrateIdentityGate(pool);
        assert.equal(gate.gated, true);
        assert.equal(gate.identity_key, IDENTITY_KEY);
        assert.equal(gate.environment_code, "testing");
        const summary = await migrate({ pool });
        assert.ok(Array.isArray(summary.applied));
        assert.equal(summary.applied.length, 0);
      }
    );
  });

  it("refuses migrate when expected identity does not match the connected database", async () => {
    if (!requireDb()) return;
    await withEnv(
      {
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "testing",
      },
      async () => {
        await assert.rejects(
          () => assertMigrateIdentityGate(pool),
          /identity_key mismatch|Refusing/
        );
        await assert.rejects(() => migrate({ pool }), /identity_key mismatch|Refusing/);
      }
    );
  });

  it("refuses migrate when environment_code does not match DATABASE_IDENTITY_ENV", async () => {
    if (!requireDb()) return;
    await withEnv(
      {
        DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
        DATABASE_IDENTITY_ENV: "production",
      },
      async () => {
        await assert.rejects(
          () => assertMigrateIdentityGate(pool),
          /environment_code=testing.*DATABASE_IDENTITY_ENV=production/
        );
      }
    );
  });

  it("testing vs production isolation: production identity is not accepted for testing expected env", async () => {
    if (!requireDb()) return;
    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'production' WHERE id = 1`
    );
    try {
      await withEnv(
        {
          DATABASE_IDENTITY_EXPECTED: IDENTITY_KEY,
          DATABASE_IDENTITY_ENV: "testing",
          DEPLOYMENT_ENV: "testing",
        },
        async () => {
          await assert.rejects(
            () => assertMigrateIdentityGate(pool),
            /environment_code=production|does not match DATABASE_IDENTITY_ENV=testing/
          );
        }
      );
    } finally {
      await pool.query(
        `UPDATE platform.database_identity SET environment_code = 'testing' WHERE id = 1`
      );
    }
  });

  it("compatible schema startup does not exit; missing provision_stage refuses", async () => {
    if (!requireDb()) return;
    let exited = null;
    await assertV7RuntimeSchemaCompatibilityOrExit(pool, {
      env: {
        DEPLOYMENT_ENV: "testing",
        DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
        DATABASE_IDENTITY_ENV: "testing",
      },
      exit: (code) => {
        exited = code;
      },
      logger: { log() {}, error() {} },
    });
    assert.equal(exited, null);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `ALTER TABLE blessboard.platform_church_registration_applications
           DROP COLUMN last_provision_stage`
      );
      await client.query(
        `DELETE FROM platform.schema_migrations
          WHERE module = 'blessboard' AND version = '099'`
      );
      const report = await inspectV7RuntimeSchemaCompatibility(client);
      assert.equal(report.compatible, false);
      assert.ok(report.missing.includes(CAPABILITY.BB_PROVISION_STAGE_COLUMNS));
      assert.ok(report.missing.includes(CAPABILITY.REQUIRED_MIGRATIONS));
      exited = null;
      const logs = [];
      await assertV7RuntimeSchemaCompatibilityOrExit(client, {
        env: { DEPLOYMENT_ENV: "testing" },
        exit: (code) => {
          exited = code;
        },
        logger: {
          log: (line) => logs.push(String(line)),
          error: (line) => logs.push(String(line)),
        },
      });
      assert.equal(exited, 1);
      assert.ok(logs.some((line) => /FATAL/.test(line) && /schema_incompatible|missing=/.test(line)));
      assert.ok(logs.some((line) => /Do not run migrations from application startup/.test(line)));
      assert.ok(logs.some((line) => /099_church_registration_provision_stage/.test(line)));
    } finally {
      await client.query("ROLLBACK").catch(() => {});
      client.release();
    }
  });

  it("db:migrate:testing env gate requires moovex-platform-v7 / testing and rejects production", () => {
    assert.equal(TESTING_MIGRATE_KEY, "moovex-platform-v7");
    assert.equal(TESTING_MIGRATE_ENV, "testing");
    const ok = assertTestingMigrateTarget({
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      DATABASE_IDENTITY_ENV: "testing",
      DEPLOYMENT_ENV: "testing",
    });
    assert.equal(ok.ok, true);
    const missing = assertTestingMigrateTarget({});
    assert.equal(missing.ok, false);
    const wrongKey = assertTestingMigrateTarget({
      DATABASE_IDENTITY_EXPECTED: "blessboard-platform-v5",
      DATABASE_IDENTITY_ENV: "testing",
    });
    assert.equal(wrongKey.ok, false);
    assert.equal(wrongKey.code, "expected_identity_not_testing");
    const productionEnv = assertTestingMigrateTarget({
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      DATABASE_IDENTITY_ENV: "production",
    });
    assert.equal(productionEnv.ok, false);
    const deploymentProduction = assertTestingMigrateTarget({
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      DATABASE_IDENTITY_ENV: "testing",
      DEPLOYMENT_ENV: "production",
    });
    assert.equal(deploymentProduction.ok, false);
    const dualUrl = assertTestingMigrateTarget({
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      DATABASE_IDENTITY_ENV: "testing",
      GETPRO_DATABASE_URL: "postgres://example/other",
    });
    assert.equal(dualUrl.ok, false);
    assert.equal(dualUrl.code, "getpro_database_url_present");
    assert.equal(JSON.stringify(dualUrl).includes("postgres://"), false);
  });

  it("db:migrate:testing identity check rejects production database environment", async () => {
    if (!requireDb()) return;
    await pool.query(
      `UPDATE platform.database_identity
          SET identity_key = 'moovex-platform-v7', environment_code = 'production'
        WHERE id = 1`
    );
    try {
      const result = await assertTestingDatabaseIdentity(pool);
      assert.equal(result.ok, false);
      assert.equal(result.code, "production_rejected");
      assert.match(result.message, /environment_code=production/);
      assert.equal(String(result.message).includes("postgres://"), false);
    } finally {
      await pool.query(
        `UPDATE platform.database_identity
            SET identity_key = $1, environment_code = 'testing'
          WHERE id = 1`,
        [IDENTITY_KEY]
      );
    }
  });

  it("identity gate runs before ledger DDL in migrate()", () => {
    const source = fs.readFileSync(path.join(__dirname, "../db/scripts/lib/migrator.js"), "utf8");
    const migrateFn = source.slice(source.indexOf("async function migrate"));
    const gateAt = migrateFn.indexOf("assertMigrateIdentityGate");
    const ledgerAt = migrateFn.indexOf("ensureMigrationLedger");
    assert.ok(gateAt > 0 && ledgerAt > gateAt);
  });

  it("FATAL schema guidance is derived from missing migrations or capabilities, not a stale hardcoded list", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../src/platform/schema/v7RuntimeSchemaCompatibility.js"),
      "utf8"
    );
    assert.doesNotMatch(
      source,
      /Apply pending migrations \(platform\/031, blessboard\/095, activeclinic\/030\)/
    );
    assert.match(source, /pendingHint/);
    assert.match(source, /missingMigrations/);
    const preflight = fs.readFileSync(
      path.join(__dirname, "../db/scripts/preflight-testing.js"),
      "utf8"
    );
    assert.doesNotMatch(preflight, /\bmigrate\s*\(/);
    assert.match(preflight, /status\(/);
    assert.match(preflight, /inspectV7RuntimeSchemaCompatibility/);
  });

  it("required provision_stage SQL files exist on disk", () => {
    const root = path.join(__dirname, "../db/migrations");
    assert.equal(
      fs.existsSync(path.join(root, "activeclinic/031_clinic_registration_provision_stage.sql")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(root, "blessboard/099_church_registration_provision_stage.sql")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(root, "platform/032_organization_onboarding_progress.sql")),
      true
    );
  });
});
