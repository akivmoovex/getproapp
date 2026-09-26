"use strict";

/**
 * PC06 — platform schema / migration ownership guard.
 * Documentation/test-only: does not rewrite migration history.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  MODULE_ORDER,
  discoverMigrations,
} = require("../db/scripts/lib/migrator");
const {
  HISTORICAL_EXCEPTIONS,
  FUTURE_RULES,
  auditMigrationOwnership,
  describeHistoricalException,
  listMigrationRelPaths,
} = require("../db/scripts/lib/migrationOwnershipPolicy");

const ROOT = path.resolve(__dirname, "..");

describe("PC06 platform schema ownership", () => {
  it("keeps migrator module order aligned with ownership policy", () => {
    assert.deepEqual(MODULE_ORDER, FUTURE_RULES.moduleOrder);
    assert.deepEqual(MODULE_ORDER.slice(0, 3), [
      "platform",
      "blessboard",
      "activeclinic",
    ]);
  });

  it("discovers migrations in module order without Finder junk", () => {
    const files = discoverMigrations();
    assert.ok(files.length > 50);
    assert.equal(
      files.some((f) => f.filename.includes(" 2.")),
      false
    );
    let lastIdx = -1;
    for (const f of files) {
      const idx = MODULE_ORDER.indexOf(f.module);
      assert.ok(idx >= 0, f.module);
      assert.ok(idx >= lastIdx, `module order violated at ${f.module}/${f.filename}`);
      lastIdx = idx;
    }
  });

  it("every historical exception file still exists on disk", () => {
    for (const rel of HISTORICAL_EXCEPTIONS) {
      const abs = path.join(ROOT, "db", "migrations", rel);
      assert.equal(fs.existsSync(abs), true, `missing historical exception ${rel}`);
    }
  });

  it("documents each historical exception with a justification class", () => {
    for (const rel of HISTORICAL_EXCEPTIONS) {
      const meta = describeHistoricalException(rel);
      assert.equal(meta.path, rel);
      assert.ok(meta.class, rel);
      assert.ok(String(meta.justification || "").length > 20, rel);
    }
  });

  it("rejects new cross-product filename placements outside the allowlist", () => {
    const { orphans, missingAllowlistEntries } = auditMigrationOwnership();
    assert.deepEqual(
      missingAllowlistEntries,
      [],
      `allowlist entries missing on disk:\n${missingAllowlistEntries.join("\n")}`
    );
    assert.deepEqual(
      orphans,
      [],
      `New cross-product migration placement — move under the owning product module or document as HISTORICAL_EXCEPTIONS:\n${orphans
        .map((o) => ` - ${o.path}: ${o.reason}`)
        .join("\n")}`
    );
  });

  it("states forward ownership rules for operators", () => {
    assert.ok(FUTURE_RULES.summary.length >= 5);
    assert.match(FUTURE_RULES.summary.join("\n"), /activeclinic/i);
    assert.match(FUTURE_RULES.summary.join("\n"), /platform/i);
    assert.match(FUTURE_RULES.summary.join("\n"), /Never rename/i);
    const policyDoc = fs.readFileSync(
      path.join(ROOT, "docs", "database", "PLATFORM_SCHEMA_OWNERSHIP.md"),
      "utf8"
    );
    assert.match(policyDoc, /PLATFORM_SCHEMA_OWNERSHIP_PLAN/);
    assert.match(policyDoc, /035_platform_contact_inquiries/);
    assert.match(policyDoc, /Forward rules/);
  });

  it("035 contact inquiries remain AC-owned objects (historical naming only)", () => {
    const sql = fs.readFileSync(
      path.join(ROOT, "db", "migrations", "activeclinic", "035_platform_contact_inquiries.sql"),
      "utf8"
    );
    assert.match(sql, /activeclinic\.platform_contact_inquiries/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS platform\./i);
  });

  it("lists more migration files than the frozen exception set (sanity)", () => {
    assert.ok(listMigrationRelPaths().length > HISTORICAL_EXCEPTIONS.length);
  });
});
