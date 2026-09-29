"use strict";

/**
 * Seeds 004–006 stay checksum-stable for testing. Seed 007 retires testing-only
 * catalogue rows only when platform.database_identity.environment_code=production.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { resetFoundationDatabase, createFoundationPool } = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");

const ROOT = path.resolve(__dirname, "..");
const TESTING_CODES = [
  "activeclinic-org-v6",
  "moovex-platform-testing",
  "blessboard-pronline-testing",
  "activeclinic-pronline-testing",
  "getpro-pronline-testing",
  "netraz-pronline-testing",
];

describe("production catalogue seed hygiene", () => {
  let databaseUrl;
  let pool;
  let skipSuite = false;
  let skipReason = "";

  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipSuite = true;
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb() {
    if (skipSuite) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("does not rewrite seeds 004-006 (testing checksum stability)", () => {
    const s004 = fs.readFileSync(path.join(ROOT, "db/seeds/004_activeclinic_product_and_deployment.sql"), "utf8");
    const s006 = fs.readFileSync(path.join(ROOT, "db/seeds/006_v7_unified_deployments.sql"), "utf8");
    assert.match(s004, /activeclinic-org-v6/);
    assert.match(s006, /moovex-platform-testing/);
    assert.match(s006, /blessboard\.pronline\.org/);
  });

  it("seed 007 is production-gated and lists testing-only codes", () => {
    const sql = fs.readFileSync(path.join(ROOT, "db/seeds/007_production_catalogue_hygiene.sql"), "utf8");
    assert.match(sql, /env_code IS DISTINCT FROM 'production'/);
    for (const code of TESTING_CODES) {
      assert.match(sql, new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
    assert.match(sql, /activeclinic-org-production/);
    assert.doesNotMatch(sql, /UPDATE\s+blessboard\.public_pages/i);
    assert.doesNotMatch(sql, /DELETE\s+FROM\s+blessboard\.public_pages/i);
  });

  it("seed 008 is production-gated and inserts moovex-platform-production", () => {
    const sql = fs.readFileSync(
      path.join(ROOT, "db/seeds/008_moovex_platform_production_deployment.sql"),
      "utf8"
    );
    assert.match(sql, /env_code IS DISTINCT FROM 'production'/);
    assert.match(sql, /'moovex-platform-production'/);
    assert.match(sql, /moovex_platform_production_sid/);
    assert.match(sql, /ON CONFLICT \(deployment_code\) DO UPDATE/);
    assert.match(sql, /environment_code = 'production'/);
    // Must not INSERT the testing unified code (comment mentions are OK).
    assert.doesNotMatch(
      sql,
      /INSERT INTO platform\.deployments[\s\S]*'moovex-platform-testing'/i
    );
  });

  it("seed 006 still omits moovex-platform-production (checksum-stable; 008 owns the row)", () => {
    const s006 = fs.readFileSync(path.join(ROOT, "db/seeds/006_v7_unified_deployments.sql"), "utf8");
    assert.doesNotMatch(s006, /moovex-platform-production/);
  });

  it("testing identity keeps testing catalogue rows after 007", async () => {
    requireDb();
    await pool.query(
      `INSERT INTO platform.database_identity
         (id, database_instance_id, environment_code, database_name, host_fingerprint, identity_key)
       VALUES (1, gen_random_uuid(), 'testing', 'foundation', 'local-rehearsal', 'blessboard-platform-v5')
       ON CONFLICT (id) DO UPDATE SET environment_code = 'testing'`
    );
    const sql = fs.readFileSync(path.join(ROOT, "db/seeds/007_production_catalogue_hygiene.sql"), "utf8");
    await pool.query(sql);
    const rows = await pool.query(
      `SELECT deployment_code, status FROM platform.deployments
        WHERE deployment_code = ANY($1::text[])`,
      [TESTING_CODES]
    );
    assert.ok(rows.rowCount >= 2, "expected testing deployment rows");
    assert.ok(rows.rows.every((r) => r.status === "active"));
  });

  it("production identity retires testing rows and can add activeclinic-org-production", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'production'`
    );
    const sql = fs.readFileSync(path.join(ROOT, "db/seeds/007_production_catalogue_hygiene.sql"), "utf8");
    await pool.query(sql);
    await pool.query(sql);

    const testing = await pool.query(
      `SELECT deployment_code, status, canonical_domain FROM platform.deployments
        WHERE deployment_code = ANY($1::text[])`,
      [TESTING_CODES]
    );
    assert.ok(testing.rows.length > 0);
    assert.ok(testing.rows.every((r) => r.status === "retired"));
    assert.ok(testing.rows.every((r) => String(r.canonical_domain).includes("__testing_not_for_production__")));

    const acProd = await pool.query(
      `SELECT status, canonical_domain, environment_code, session_cookie_name
         FROM platform.deployments WHERE deployment_code = 'activeclinic-org-production'`
    );
    assert.equal(acProd.rowCount, 1);
    assert.equal(acProd.rows[0].status, "active");
    assert.equal(acProd.rows[0].canonical_domain, "activeclinic.org");
    assert.equal(acProd.rows[0].environment_code, "production");
    assert.equal(acProd.rows[0].session_cookie_name, "activeclinic_org_prod_sid");

    const pages = await pool.query(`SELECT count(*)::int AS n FROM blessboard.public_pages`);
    assert.equal(typeof pages.rows[0].n, "number");

    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'testing'`
    );
  });

  it("production identity seed 008 ensures moovex-platform-production active", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'production'`
    );
    // Simulate pre-fix catalogue: remove the row if migrate already applied 008.
    await pool.query(
      `DELETE FROM platform.deployments WHERE deployment_code = 'moovex-platform-production'`
    );
    const sql = fs.readFileSync(
      path.join(ROOT, "db/seeds/008_moovex_platform_production_deployment.sql"),
      "utf8"
    );
    await pool.query(sql);
    await pool.query(sql);

    const row = await pool.query(
      `SELECT status, environment_code, application_code, session_cookie_name, canonical_domain
         FROM platform.deployments WHERE deployment_code = 'moovex-platform-production'`
    );
    assert.equal(row.rowCount, 1);
    assert.equal(row.rows[0].status, "active");
    assert.equal(row.rows[0].environment_code, "production");
    assert.equal(row.rows[0].application_code, "platform");
    assert.equal(row.rows[0].session_cookie_name, "moovex_platform_production_sid");
    assert.ok(String(row.rows[0].canonical_domain || "").length > 0);

    // Testing identity must not insert/activate the production unified row via 008.
    await pool.query(
      `DELETE FROM platform.deployments WHERE deployment_code = 'moovex-platform-production'`
    );
    await pool.query(
      `UPDATE platform.database_identity SET environment_code = 'testing'`
    );
    await pool.query(sql);
    const absent = await pool.query(
      `SELECT 1 FROM platform.deployments WHERE deployment_code = 'moovex-platform-production'`
    );
    assert.equal(absent.rowCount, 0);
  });
});
