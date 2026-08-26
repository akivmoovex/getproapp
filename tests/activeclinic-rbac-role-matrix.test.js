"use strict";

/**
 * ActiveClinic V6 — RBAC role catalogue matrix (088).
 * Verifies least-privilege role → permission mappings after migration.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  ORGANIZATION_ADMIN,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  CLINIC_MANAGER,
  RECEPTIONIST,
  MEDICAL_RECORDS_OFFICER,
  NURSE,
  CLINICIAN,
  PHARMACIST,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  BILLING_OFFICER,
  CASHIER,
  FINANCE_SUPERVISOR,
  AUDITOR,
  STAFF_ROLE,
  ACTIVECLINIC_ROLE_CATALOGUE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");

let pool;
let skipReason = null;

const REQUIRED_ROLES = Object.freeze([
  ORGANIZATION_ADMIN,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  CLINIC_MANAGER,
  RECEPTIONIST,
  MEDICAL_RECORDS_OFFICER,
  NURSE,
  CLINICIAN,
  PHARMACIST,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  BILLING_OFFICER,
  CASHIER,
  FINANCE_SUPERVISOR,
  AUDITOR,
  STAFF_ROLE,
]);

const MUST_NOT = Object.freeze({
  [ORGANIZATION_ADMIN]: [
    "activeclinic.consultation.record",
    "activeclinic.pharmacy.dispense",
    "activeclinic.diagnostics.result",
    "activeclinic.payment.collect",
    "activeclinic.payment.refund",
  ],
  [FACILITY_ADMIN]: [
    "activeclinic.consultation.record",
    "activeclinic.pharmacy.dispense",
    "activeclinic.diagnostics.result",
    "activeclinic.payment.refund",
  ],
  [CLINIC_MANAGER]: [
    "activeclinic.patient.manage_identifiers",
    "activeclinic.patient.merge",
    "activeclinic.payment.refund",
  ],
  [RECEPTIONIST]: [
    "activeclinic.consultation.record",
    "activeclinic.pharmacy.dispense",
    "activeclinic.payment.refund",
    "activeclinic.patient.manage_identifiers",
    "activeclinic.patient.quick_register",
    "activeclinic.patient.merge",
  ],
  [MEDICAL_RECORDS_OFFICER]: [
    "activeclinic.consultation.record",
    "activeclinic.pharmacy.dispense",
    "activeclinic.payment.collect",
    "activeclinic.staff.assign_access",
    "activeclinic.patient.merge",
  ],
  [NURSE]: [
    "activeclinic.consultation.sign",
    "activeclinic.pharmacy.dispense",
    "activeclinic.billing.charge",
  ],
  [CLINICIAN]: [
    "activeclinic.pharmacy.dispense",
    "activeclinic.payment.collect",
    "activeclinic.staff.assign_access",
  ],
  [CASHIER]: [
    "activeclinic.payment.refund",
    "activeclinic.payment.reverse",
    "activeclinic.billing.price.override",
  ],
  [BILLING_OFFICER]: [
    "activeclinic.payment.refund",
    "activeclinic.payment.reverse",
  ],
});

const MUST_HAVE = Object.freeze({
  [ORGANIZATION_ADMIN]: [
    "activeclinic.access",
    "activeclinic.organization.manage",
    "activeclinic.staff.assign_access",
    "activeclinic.staff.manage_credentials",
    "activeclinic.audit.view",
  ],
  [NETWORK_ADMIN]: [
    "activeclinic.organization.manage",
    "activeclinic.staff.manage_credentials",
    "activeclinic.audit.view",
  ],
  [FACILITY_ADMIN]: [
    "activeclinic.access",
    "activeclinic.facility.update",
    "activeclinic.staff.assign_access",
    "activeclinic.appointment.manage_schedule",
  ],
  [RECEPTIONIST]: [
    "activeclinic.patient.create",
    "activeclinic.patient.update",
    "activeclinic.appointment.create",
    "activeclinic.reception.manage_queue",
  ],
  [MEDICAL_RECORDS_OFFICER]: [
    "activeclinic.patient.create",
    "activeclinic.patient.update",
    "activeclinic.patient.manage_identifiers",
    "activeclinic.patient.search",
  ],
  [NURSE]: ["activeclinic.triage.record", "activeclinic.nursing_intake.record"],
  [CLINICIAN]: [
    "activeclinic.consultation.sign",
    "activeclinic.diagnosis.record",
    "activeclinic.clinical_order.create",
  ],
  [PHARMACIST]: ["activeclinic.pharmacy.dispense", "activeclinic.inventory.manage"],
  [LAB_TECHNICIAN]: [
    "activeclinic.lab.view",
    "activeclinic.lab.collect",
    "activeclinic.lab.result",
  ],
  [RADIOLOGY_STAFF]: [
    "activeclinic.radiology.view",
    "activeclinic.radiology.result",
  ],
  [BILLING_OFFICER]: [
    "activeclinic.billing.invoice.create",
    "activeclinic.billing.catalog.manage",
  ],
  [CASHIER]: [
    "activeclinic.payment.collect",
    "activeclinic.cashier.open_session",
  ],
  [FINANCE_SUPERVISOR]: [
    "activeclinic.payment.refund",
    "activeclinic.payment.reverse",
    "activeclinic.billing.price.override",
  ],
  [AUDITOR]: ["activeclinic.audit.view", "activeclinic.billing.reports.view"],
  [STAFF_ROLE]: ["activeclinic.access", "activeclinic.facility.view"],
});

const AUDITOR_FORBIDDEN_WRITES = Object.freeze([
  "activeclinic.patient.create",
  "activeclinic.appointment.create",
  "activeclinic.consultation.record",
  "activeclinic.pharmacy.dispense",
  "activeclinic.diagnostics.result",
  "activeclinic.billing.charge",
  "activeclinic.payment.collect",
  "activeclinic.payment.refund",
  "activeclinic.staff.assign_access",
]);

async function permissionsForRole(roleKey) {
  const r = await pool.query(
    `SELECT p.permission_key
       FROM blessboard.roles r
       JOIN blessboard.role_permissions rp ON rp.role_id = r.id
       JOIN blessboard.permissions p ON p.id = rp.permission_id
      WHERE r.role_key = $1
      ORDER BY p.permission_key`,
    [roleKey]
  );
  return r.rows.map((row) => row.permission_key);
}

describe("ActiveClinic RBAC role matrix (088)", () => {
  it("network_admin description does not claim organization-admin powers", () => {
    const { ROLE_DESCRIPTIONS, NETWORK_ADMIN: NET } = require("../src/activeclinic/services/activeClinicAccessManagementService");
    const text = ROLE_DESCRIPTIONS[NET];
    assert.equal(/same powers/i.test(text), false);
    assert.match(text, /cannot publish/i);
    assert.match(text, /view, edit, and submit/i);
  });
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  function requireDb(t) {
    if (skipReason) {
      if (t && typeof t.skip === "function") t.skip(skipReason);
      return false;
    }
    return true;
  }

  it("catalogue exports match ActiveClinic role keys", (t) => {
    if (!requireDb(t)) return;
    for (const key of REQUIRED_ROLES) {
      assert.ok(ACTIVECLINIC_ROLE_CATALOGUE.includes(key), `missing export ${key}`);
    }
  });

  it("every catalogue role exists as an active ActiveClinic system role", async (t) => {
    if (!requireDb(t)) return;
    const r = await pool.query(
      `SELECT role_key, is_active, is_system, role_category
         FROM blessboard.roles
        WHERE role_key = ANY($1::text[])`,
      [REQUIRED_ROLES]
    );
    assert.equal(r.rows.length, REQUIRED_ROLES.length);
    for (const row of r.rows) {
      assert.equal(row.role_category, "activeclinic");
      assert.equal(row.is_active, true);
      assert.equal(row.is_system, true);
    }
  });

  it("includes required permissions per role", async (t) => {
    if (!requireDb(t)) return;
    for (const [roleKey, keys] of Object.entries(MUST_HAVE)) {
      const perms = await permissionsForRole(roleKey);
      for (const key of keys) {
        assert.ok(perms.includes(key), `${roleKey} missing ${key}`);
      }
    }
  });

  it("excludes prohibited permissions for high-risk roles", async (t) => {
    if (!requireDb(t)) return;
    for (const [roleKey, keys] of Object.entries(MUST_NOT)) {
      const perms = await permissionsForRole(roleKey);
      for (const key of keys) {
        assert.equal(perms.includes(key), false, `${roleKey} must not have ${key}`);
      }
    }
  });

  it("auditor has no transactional write permissions", async (t) => {
    if (!requireDb(t)) return;
    const perms = await permissionsForRole(AUDITOR);
    for (const key of AUDITOR_FORBIDDEN_WRITES) {
      assert.equal(perms.includes(key), false, `auditor must not have ${key}`);
    }
  });

  it("no ActiveClinic role receives patient.merge", async (t) => {
    if (!requireDb(t)) return;
    const r = await pool.query(
      `SELECT r.role_key
         FROM blessboard.roles r
         JOIN blessboard.role_permissions rp ON rp.role_id = r.id
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE r.role_category = 'activeclinic'
          AND p.permission_key = 'activeclinic.patient.merge'`
    );
    assert.deepEqual(r.rows, []);
  });

  it("network_admin is a compatibility role without website publish elevation", async (t) => {
    if (!requireDb(t)) return;
    const org = await permissionsForRole(ORGANIZATION_ADMIN);
    const net = await permissionsForRole(NETWORK_ADMIN);
    assert.ok(org.includes("website.publish"));
    assert.ok(org.includes("website.restore"));
    assert.ok(org.includes("website.rollback"));
    assert.equal(net.includes("website.publish"), false);
    assert.equal(net.includes("website.restore"), false);
    assert.equal(net.includes("website.rollback"), false);
    assert.ok(net.includes("website.view"));
    assert.ok(net.includes("website.edit"));
    assert.ok(net.includes("website.submit"));
    const orgWithoutPublish = org.filter(
      (key) => !["website.publish", "website.restore", "website.rollback"].includes(key)
    );
    const netWithoutPublish = net.filter(
      (key) => !["website.publish", "website.restore", "website.rollback"].includes(key)
    );
    assert.deepEqual(netWithoutPublish, orgWithoutPublish);
  });

  it("lab and radiology use modality-scoped permissions (no shared operational diagnostics.*)", async (t) => {
    if (!requireDb(t)) return;
    const lab = await permissionsForRole(LAB_TECHNICIAN);
    const rad = await permissionsForRole(RADIOLOGY_STAFF);
    assert.ok(lab.includes("activeclinic.lab.view"));
    assert.ok(lab.includes("activeclinic.lab.collect"));
    assert.ok(lab.includes("activeclinic.lab.result"));
    assert.equal(lab.includes("activeclinic.radiology.view"), false);
    assert.equal(lab.includes("activeclinic.diagnostics.view"), false);
    assert.ok(rad.includes("activeclinic.radiology.view"));
    assert.ok(rad.includes("activeclinic.radiology.result"));
    assert.equal(rad.includes("activeclinic.lab.view"), false);
    assert.equal(rad.includes("activeclinic.lab.collect"), false);
    assert.equal(rad.includes("activeclinic.diagnostics.collect"), false);
  });

  it("clinic manager is read-oriented (no clinical/finance writes)", async (t) => {
    if (!requireDb(t)) return;
    const perms = await permissionsForRole(CLINIC_MANAGER);
    for (const key of [
      "activeclinic.consultation.record",
      "activeclinic.pharmacy.dispense",
      "activeclinic.diagnostics.result",
      "activeclinic.payment.collect",
      "activeclinic.payment.refund",
      "activeclinic.staff.assign_access",
    ]) {
      assert.equal(perms.includes(key), false, `manager must not have ${key}`);
    }
    assert.ok(perms.includes("activeclinic.audit.view"));
    assert.ok(perms.includes("activeclinic.encounter.view"));
  });
});
