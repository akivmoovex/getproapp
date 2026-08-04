"use strict";

/**
 * ActiveClinic P06 diagnostics foundation — schema + service smoke.
 * Full workflow HTTP coverage is expanded separately; this keeps migrate/import green.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  RESULT,
  PERM,
} = require("../src/activeclinic/services/activeClinicDiagnosticsService");

let pool;
let databaseUrl;
let skipReason = null;

describe("ActiveClinic P06 diagnostics foundation", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("RESULT and PERM keys are defined", () => {
    assert.equal(typeof RESULT.OK, "string");
    assert.equal(PERM.VIEW, "activeclinic.diagnostics.view");
    assert.equal(PERM.COLLECT, "activeclinic.diagnostics.collect");
    assert.equal(PERM.RESULT, "activeclinic.diagnostics.result");
    assert.equal(PERM.VERIFY, "activeclinic.diagnostics.verify");
  });

  it("diagnostics tables and permissions exist", async () => {
    requireDb();
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'activeclinic'
          AND table_name IN (
            'laboratory_requests', 'specimens', 'specimen_events',
            'laboratory_results', 'radiology_requests', 'radiology_reports'
          )
        ORDER BY table_name`
    );
    assert.ok(tables.rows.length >= 6, JSON.stringify(tables.rows));

    const perms = await pool.query(
      `SELECT permission_key FROM blessboard.permissions
        WHERE permission_key LIKE 'activeclinic.diagnostics.%'
        ORDER BY permission_key`
    );
    assert.ok(perms.rows.length >= 4);

    const churches = await pool.query(
      `SELECT COUNT(*)::int AS c FROM blessboard.churches`
    );
    assert.equal(typeof churches.rows[0].c, "number");
  });
});
