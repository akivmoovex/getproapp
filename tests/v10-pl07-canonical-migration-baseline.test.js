"use strict";

/**
 * V10 PL07 — Canonical migration baseline / fresh-bootstrap characterization.
 * Ephemeral local foundation DB only — never QA/production.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  MODULE_ORDER,
  discoverMigrations,
  migrate,
} = require("../db/scripts/lib/migrator");
const {
  STRATEGY,
  CANONICAL_CEILING,
  V2_03_REQUIRED_MIGRATIONS,
  REQUIRED_SCHEMAS,
  FRESH_BOOTSTRAP_COMMAND,
  assertCeilingMatchesDisk,
  assertRequiredMigrationsOnDisk,
  scanCrossSchemaDdlSmells,
  describeBaseline,
  verifyCanonicalFreshSchema,
} = require("../db/scripts/lib/canonicalMigrationBaseline");
const { auditMigrationOwnership, FUTURE_RULES } = require("../db/scripts/lib/migrationOwnershipPolicy");
const {
  resetFoundationDatabase,
  createFoundationPool,
  foundationDbUnavailableSkipReason,
} = require("./helpers/foundationDb");
const { ensureDatabaseIdentity } = require("../db/scripts/lib/databaseIdentity");

const ROOT = path.resolve(__dirname, "..");
const IDENTITY_KEY = "moovex-platform-v7";

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

describe("PL07 canonical migration baseline", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ pool });
      await ensureDatabaseIdentity(pool, {
        connectionString: databaseUrl,
        identityKey: IDENTITY_KEY,
        environmentCode: "testing",
      });
    } catch (err) {
      skipReason = foundationDbUnavailableSkipReason(
        err && err.message ? err.message : String(err)
      );
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

  it("selects strategy B (cleaned ordered migrations)", () => {
    assert.equal(STRATEGY.code, "B");
    assert.match(STRATEGY.name, /ordered/);
  });

  it("keeps deterministic module discovery order", () => {
    assert.deepEqual(MODULE_ORDER, FUTURE_RULES.moduleOrder);
    const files = discoverMigrations();
    assert.ok(files.length >= 200);
    let lastIdx = -1;
    for (const f of files) {
      const idx = MODULE_ORDER.indexOf(f.module);
      assert.ok(idx >= lastIdx, `${f.module}/${f.filename}`);
      lastIdx = idx;
      assert.equal(f.filename.includes(" 2."), false);
    }
  });

  it("canonical ceiling matches highest on-disk migration per module", () => {
    assert.deepEqual(assertCeilingMatchesDisk(), []);
    assert.equal(CANONICAL_CEILING.platform.version, "047");
    assert.equal(CANONICAL_CEILING.blessboard.version, "128");
    assert.equal(CANONICAL_CEILING.activeclinic.version, "042");
  });

  it("V2.03 required migration markers exist on disk", () => {
    assert.deepEqual(assertRequiredMigrationsOnDisk(), []);
    assert.ok(V2_03_REQUIRED_MIGRATIONS.length >= 10);
  });

  it("ownership audit has zero orphans; historical exceptions stay documented", () => {
    const { orphans, missingAllowlistEntries } = auditMigrationOwnership();
    assert.deepEqual(orphans, []);
    assert.deepEqual(missingAllowlistEntries, []);
  });

  it("fresh-path DDL ownership: no BB CREATE/ALTER of activeclinic.*; no AC CREATE of platform.*", () => {
    assert.deepEqual(scanCrossSchemaDdlSmells(), []);
  });

  it("documents fresh-bootstrap command and refuses QA/prod reset in PL07 script", () => {
    assert.equal(FRESH_BOOTSTRAP_COMMAND.ephemeral, "npm run db:canonical-fresh-bootstrap");
    const script = fs.readFileSync(
      path.join(ROOT, "db/scripts/canonical-fresh-bootstrap.js"),
      "utf8"
    );
    assert.match(script, /Ephemeral local only|ephemeral local/i);
    assert.match(script, /Never uses hosted QA\/production|No QA\/production reset/i);
    assert.match(script, /resetFoundationDatabase/);
    const baseline = describeBaseline();
    assert.equal(baseline.strategy.code, "B");
    assert.equal(baseline.freshBootstrapCommand, FRESH_BOOTSTRAP_COMMAND.ephemeral);
  });

  it("fresh empty DB migrate reaches V2.03 canonical schema + ceiling", async () => {
    if (!requireDb()) return;
    const verify = await verifyCanonicalFreshSchema(pool);
    assert.equal(verify.ok, true, (verify.failures || []).join("\n"));
    for (const schema of REQUIRED_SCHEMAS) {
      assert.equal(verify.details.schemas[schema], true, schema);
    }
  });
});
