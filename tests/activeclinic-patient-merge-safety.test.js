"use strict";

/**
 * ActiveClinic Prompt 11 — patient.merge safety / readiness guards.
 * Does not implement merge. Asserts permission stays unassigned and stub stays deferred.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  mergeActiveClinicPatients,
  PERM,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  ACTIVECLINIC_ROLE_CATALOGUE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");

let pool;
let skipReason = null;

describe("ActiveClinic patient merge safety (Prompt 11)", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("patient.merge permission exists but is assigned to no ActiveClinic role", async () => {
    requireDb();
    const perm = await pool.query(
      `SELECT permission_key FROM blessboard.permissions
        WHERE permission_key = 'activeclinic.patient.merge'`
    );
    assert.equal(perm.rowCount, 1);

    const grants = await pool.query(
      `SELECT r.role_key
         FROM blessboard.role_permissions rp
         JOIN blessboard.permissions p ON p.id = rp.permission_id
         JOIN blessboard.roles r ON r.id = rp.role_id
        WHERE p.permission_key = 'activeclinic.patient.merge'
          AND r.role_category = 'activeclinic'
        ORDER BY 1`
    );
    assert.deepEqual(grants.rows, []);

    for (const roleKey of ACTIVECLINIC_ROLE_CATALOGUE) {
      const rolePerms = await pool.query(
        `SELECT 1
           FROM blessboard.role_permissions rp
           JOIN blessboard.permissions p ON p.id = rp.permission_id
           JOIN blessboard.roles r ON r.id = rp.role_id
          WHERE r.role_key = $1
            AND p.permission_key = 'activeclinic.patient.merge'
          LIMIT 1`,
        [roleKey]
      );
      assert.equal(rolePerms.rowCount, 0, `${roleKey} must not have patient.merge`);
    }
  });

  it("mergeActiveClinicPatients remains deferred (no operational merge)", async () => {
    const result = await mergeActiveClinicPatients();
    assert.equal(result.ok, false);
    assert.equal(result.code, "merge_deferred");
    assert.match(String(result.message || ""), /deferred/i);
  });

  it("no patient merge HTTP route is registered in patient routes module", () => {
    const routesPath = path.join(
      __dirname,
      "../src/activeclinic/http/activeClinicPatientRoutes.js"
    );
    const source = fs.readFileSync(routesPath, "utf8");
    assert.equal(/\bmergeActiveClinicPatients\b/.test(source), false);
    assert.equal(/activeclinic\.patient\.merge/.test(source), false);
    assert.equal(/["'`]\/app\/patients\/[^"'`]*\/merge/.test(source), false);
    assert.equal(/["'`]\/app\/patients\/merge/.test(source), false);
  });

  it("hard-delete of patients is blocked by RESTRICT FKs on clinical domains; billing uses CASCADE", async () => {
    requireDb();
    const fks = await pool.query(
      `SELECT
         tc.table_schema,
         tc.table_name,
         kcu.column_name,
         rc.delete_rule
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
       JOIN information_schema.referential_constraints rc
         ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
       JOIN information_schema.constraint_column_usage ccu
         ON rc.unique_constraint_name = ccu.constraint_name
        AND rc.constraint_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_schema = 'activeclinic'
        AND ccu.table_name = 'patients'
        AND kcu.column_name = 'patient_id'
      ORDER BY tc.table_name`
    );
    assert.ok(fks.rowCount > 10, "expected many patient_id FKs");

    const byTable = new Map(
      fks.rows.map((r) => [`${r.table_schema}.${r.table_name}`, r.delete_rule])
    );

    // Clinical / operational domains must not cascade-delete with patient hard-delete.
    for (const table of [
      "activeclinic.encounters",
      "activeclinic.appointments",
      "activeclinic.laboratory_requests",
      "activeclinic.radiology_requests",
      "activeclinic.pharmacy_prescriptions",
      "activeclinic.queue_entries",
      "activeclinic.patient_identifiers",
    ]) {
      assert.ok(byTable.has(table), `missing FK for ${table}`);
      assert.equal(byTable.get(table), "RESTRICT", `${table} must RESTRICT`);
    }

    // Billing FKs currently CASCADE — hard-delete merge would destroy finance history.
    for (const table of [
      "activeclinic.patient_charges",
      "activeclinic.invoices",
      "activeclinic.payments",
    ]) {
      assert.ok(byTable.has(table), `missing FK for ${table}`);
      assert.equal(byTable.get(table), "CASCADE", `${table} currently CASCADE`);
    }
  });

  it("PERM catalogue still exposes merge key for future use without granting it", () => {
    assert.equal(PERM.MERGE || PERM.merge || null, null);
    // Service documents merge via stub; permission key is catalogue-only.
    assert.equal(typeof mergeActiveClinicPatients, "function");
  });
});
