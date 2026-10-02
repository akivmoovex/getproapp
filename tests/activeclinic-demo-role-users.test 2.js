"use strict";

/**
 * ActiveClinic Prompt 5 — demo departmental login-capable role users.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const {
  seedActiveClinicDemoClinics,
  DEMO_CLINIC_KEY,
  JULFLONA_CLINIC_KEY,
  ORGANIZATION_ADMIN,
} = require("../src/activeclinic/services/activeClinicDemoClinicSeedService");
const {
  ACTIVECLINIC_DEMO,
} = require("../src/activeclinic/services/activeClinicDemoClinicSpec");
const {
  resolveEffectivePermissions,
  listStaffRoleAssignments,
  RECEPTIONIST,
  NURSE,
  CLINICIAN,
  PHARMACIST,
  LAB_TECHNICIAN,
  BILLING_OFFICER,
  CASHIER,
  CLINIC_MANAGER,
  FINANCE_SUPERVISOR,
  AUDITOR,
  RADIOLOGY_STAFF,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  evaluateStaffEligibility,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const identityRepo = require("../src/platform/repositories/platformIdentityRepository");
const {
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;

const REQUIRED_KEYS = Object.freeze([
  "receptionist",
  "nurse",
  "clinician",
  "pharmacist",
  "lab",
  "billing",
  "cashier",
]);

const ROLE_CHECKS = Object.freeze({
  [RECEPTIONIST]: {
    allow: ["activeclinic.patient.search", "activeclinic.reception.check_in"],
    deny: [
      "activeclinic.consultation.record",
      "activeclinic.pharmacy.dispense",
      "activeclinic.diagnostics.result",
      "activeclinic.payment.refund",
    ],
  },
  [NURSE]: {
    allow: ["activeclinic.encounter.view", "activeclinic.triage.record"],
    deny: [
      "activeclinic.consultation.sign",
      "activeclinic.pharmacy.dispense",
      "activeclinic.billing.charge",
      "activeclinic.staff.assign_access",
    ],
  },
  [CLINICIAN]: {
    allow: [
      "activeclinic.encounter.manage",
      "activeclinic.consultation.record",
      "activeclinic.consultation.sign",
      "activeclinic.diagnosis.record",
      "activeclinic.clinical_order.create",
    ],
    deny: [
      "activeclinic.pharmacy.dispense",
      "activeclinic.payment.refund",
      "activeclinic.staff.assign_access",
    ],
  },
  [PHARMACIST]: {
    allow: [
      "activeclinic.pharmacy.view",
      "activeclinic.pharmacy.review",
      "activeclinic.pharmacy.dispense",
    ],
    deny: [
      "activeclinic.diagnosis.record",
      "activeclinic.payment.collect",
      "activeclinic.staff.assign_access",
    ],
  },
  [LAB_TECHNICIAN]: {
    allow: [
      "activeclinic.lab.view",
      "activeclinic.lab.collect",
      "activeclinic.lab.result",
      "activeclinic.lab.verify",
    ],
    deny: [
      "activeclinic.consultation.record",
      "activeclinic.pharmacy.dispense",
      "activeclinic.payment.refund",
      "activeclinic.radiology.view",
      "activeclinic.radiology.result",
      "activeclinic.diagnostics.view",
    ],
  },
  [RADIOLOGY_STAFF]: {
    allow: [
      "activeclinic.radiology.view",
      "activeclinic.radiology.result",
      "activeclinic.radiology.verify",
    ],
    deny: [
      "activeclinic.consultation.record",
      "activeclinic.lab.view",
      "activeclinic.lab.collect",
      "activeclinic.lab.result",
      "activeclinic.diagnostics.collect",
    ],
  },
  [BILLING_OFFICER]: {
    allow: ["activeclinic.billing.view", "activeclinic.billing.charge"],
    deny: [
      "activeclinic.consultation.record",
      "activeclinic.pharmacy.dispense",
      "activeclinic.payment.refund",
      "activeclinic.payment.reverse",
    ],
  },
  [CASHIER]: {
    allow: [
      "activeclinic.payment.view",
      "activeclinic.payment.collect",
      "activeclinic.cashier.open_session",
    ],
    deny: [
      "activeclinic.diagnosis.record",
      "activeclinic.pharmacy.dispense",
      "activeclinic.payment.refund",
      "activeclinic.payment.reverse",
    ],
  },
});

async function loadDemoOrg(db) {
  const org = (
    await db.query(
      `SELECT id, organization_key FROM platform.organizations
        WHERE organization_key = $1 LIMIT 1`,
      [DEMO_CLINIC_KEY]
    )
  ).rows[0];
  assert.ok(org);
  const facility = (
    await db.query(
      `SELECT f.id, f.facility_key
         FROM activeclinic.facilities f
         JOIN activeclinic.healthcare_organizations h
           ON h.id = f.healthcare_organization_id
        WHERE h.organization_id = $1 AND f.status = 'active'
        ORDER BY f.is_primary DESC, f.created_at ASC
        LIMIT 1`,
      [org.id]
    )
  ).rows[0];
  assert.ok(facility);
  return { orgId: org.id, facilityId: facility.id, facilityKey: facility.facility_key };
}

async function loadRoleUser(db, orgId, email) {
  const identityRows = await identityRepo.findIdentitiesByNormalizedContact(db, {
    emailNormalized: email,
  });
  assert.equal(identityRows.length, 1, `identity for ${email}`);
  const identity = identityRows[0];
  const staff = (
    await db.query(
      `SELECT * FROM activeclinic.staff_members
        WHERE organization_id = $1 AND platform_identity_id = $2
        LIMIT 1`,
      [orgId, identity.id]
    )
  ).rows[0];
  assert.ok(staff, `staff for ${email}`);
  return { identity, staff };
}

describe("ActiveClinic demo role users (Prompt 5)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      await pool.query(
        `INSERT INTO platform.database_identity
           (id, database_instance_id, environment_code, database_name, host_fingerprint, identity_key)
         VALUES
           (1, $1, 'testing', 'getpro_test', 'localhost', 'blessboard-platform-v5')
         ON CONFLICT (id) DO UPDATE SET
           environment_code = EXCLUDED.environment_code,
           identity_key = EXCLUDED.identity_key,
           updated_at = now()`,
        ["11111111-1111-4111-8111-111111111111"]
      );
    } catch (err) {
      skipReason = err && err.message ? err.message : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) {
      assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
    }
  }

  it("seeds demo role users idempotently with LOGIN_READY chains", async () => {
    requireDb();
    const first = await seedActiveClinicDemoClinics(pool, {
      clinicKeys: [DEMO_CLINIC_KEY],
      requireIdentityKey: "blessboard-platform-v5",
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    const demo = first.clinics.find((c) => c.clinicKey === DEMO_CLINIC_KEY);
    assert.ok(demo);
    assert.ok((demo.roleUsers || []).length >= REQUIRED_KEYS.length);

    const second = await seedActiveClinicDemoClinics(pool, {
      clinicKeys: [DEMO_CLINIC_KEY],
      requireIdentityKey: "blessboard-platform-v5",
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    const demo2 = second.clinics.find((c) => c.clinicKey === DEMO_CLINIC_KEY);
    assert.equal((demo2.roleUsers || []).length, (demo.roleUsers || []).length);

    const { orgId, facilityId } = await loadDemoOrg(pool);

    for (const spec of ACTIVECLINIC_DEMO.roleUsers) {
      const { identity, staff } = await loadRoleUser(pool, orgId, spec.email);
      assert.equal(identity.status, "active");

      const profiles = await identityRepo.listProductProfilesByIdentity(
        pool,
        identity.id
      );
      assert.ok(
        profiles.some(
          (p) =>
            p.product_key === "activeclinic" &&
            p.status === "active" &&
            String(p.product_profile_id) === String(staff.id)
        ),
        `product profile missing for ${spec.email}`
      );

      const fac = await pool.query(
        `SELECT facility_id FROM activeclinic.staff_facility_assignments
          WHERE staff_member_id = $1 AND organization_id = $2 AND status = 'active'`,
        [staff.id, orgId]
      );
      assert.ok(
        fac.rows.some((r) => String(r.facility_id) === String(facilityId)),
        `facility assignment for ${spec.email}`
      );

      const roles = await listStaffRoleAssignments(pool, {
        staffMemberId: staff.id,
        organizationId: orgId,
      });
      const match = (roles.assignments || []).find((a) => a.roleKey === spec.roleKey);
      assert.ok(match, `role ${spec.roleKey} for ${spec.email}`);
      assert.equal(match.scopeType, spec.scopeType);
      if (spec.scopeType === "facility") {
        assert.equal(String(match.facilityId), String(facilityId));
      }

      const elig = await evaluateStaffEligibility(pool, staff, identity);
      assert.equal(elig.ok, true, `${spec.email} ${elig.code}`);

      const perms = await resolveEffectivePermissions(pool, {
        organizationId: orgId,
        staffMemberId: staff.id,
        platformIdentityId: identity.id,
        facilityId: spec.scopeType === "facility" ? facilityId : null,
      });
      assert.equal(perms.ok, true);
      assert.ok(perms.permissions.includes("activeclinic.access"));

      const checks = ROLE_CHECKS[spec.roleKey];
      if (checks) {
        for (const key of checks.allow) {
          assert.ok(perms.permissions.includes(key), `${spec.email} missing ${key}`);
        }
        for (const key of checks.deny) {
          assert.equal(
            perms.permissions.includes(key),
            false,
            `${spec.email} should not have ${key}`
          );
        }
      }
    }

    // Converted public clinicians
    const chanda = (
      await pool.query(
        `SELECT platform_identity_id FROM activeclinic.staff_members
          WHERE organization_id = $1 AND public_profile_key = 'dr-demo-chanda'`,
        [orgId]
      )
    ).rows[0];
    assert.ok(chanda.platform_identity_id);
    const mwila = (
      await pool.query(
        `SELECT platform_identity_id FROM activeclinic.staff_members
          WHERE organization_id = $1 AND public_profile_key = 'nurse-demo-mwila'`,
        [orgId]
      )
    ).rows[0];
    assert.ok(mwila.platform_identity_id);

    // Directory-only doctor remains without identity
    const phiri = (
      await pool.query(
        `SELECT platform_identity_id FROM activeclinic.staff_members
          WHERE organization_id = $1 AND public_profile_key = 'dr-demo-phiri'`,
        [orgId]
      )
    ).rows[0];
    assert.equal(phiri.platform_identity_id, null);

    // Admin unchanged as organization_admin
    const adminIdentity = (
      await identityRepo.findIdentitiesByNormalizedContact(pool, {
        emailNormalized: "demo.admin@activeclinic.example",
      })
    )[0];
    const adminStaff = (
      await pool.query(
        `SELECT * FROM activeclinic.staff_members
          WHERE organization_id = $1 AND platform_identity_id = $2`,
        [orgId, adminIdentity.id]
      )
    ).rows[0];
    const adminRoles = await listStaffRoleAssignments(pool, {
      staffMemberId: adminStaff.id,
      organizationId: orgId,
    });
    assert.ok(
      (adminRoles.assignments || []).some((a) => a.roleKey === ORGANIZATION_ADMIN)
    );
    assert.equal(
      (adminRoles.assignments || []).some(
        (a) => a.roleKey === "activeclinic_facility_admin"
      ),
      false
    );

    // No Julflona cross-assignment for demo role emails
    const jul = (
      await pool.query(
        `SELECT id FROM platform.organizations WHERE organization_key = $1`,
        [JULFLONA_CLINIC_KEY]
      )
    ).rows[0];
    if (jul) {
      for (const spec of ACTIVECLINIC_DEMO.roleUsers) {
        const identity = (
          await identityRepo.findIdentitiesByNormalizedContact(pool, {
            emailNormalized: spec.email,
          })
        )[0];
        const cross = await pool.query(
          `SELECT id FROM activeclinic.staff_members
            WHERE organization_id = $1 AND platform_identity_id = $2`,
          [jul.id, identity.id]
        );
        assert.equal(cross.rows.length, 0);
      }
    }

    // Duplicate identity count stays 1 per email after reseed
    for (const spec of ACTIVECLINIC_DEMO.roleUsers) {
      const ids = await identityRepo.findIdentitiesByNormalizedContact(pool, {
        emailNormalized: spec.email,
      });
      assert.equal(ids.length, 1);
      const staffCount = await pool.query(
        `SELECT COUNT(*)::int AS n FROM activeclinic.staff_members
          WHERE organization_id = $1 AND platform_identity_id = $2`,
        [orgId, ids[0].id]
      );
      assert.equal(staffCount.rows[0].n, 1);
    }

    // Optional roles present in seed catalogue
    assert.ok(ACTIVECLINIC_DEMO.roleUsers.some((u) => u.roleKey === CLINIC_MANAGER));
    assert.ok(ACTIVECLINIC_DEMO.roleUsers.some((u) => u.roleKey === FINANCE_SUPERVISOR));
    assert.ok(ACTIVECLINIC_DEMO.roleUsers.some((u) => u.roleKey === AUDITOR));
    assert.ok(ACTIVECLINIC_DEMO.roleUsers.some((u) => u.roleKey === RADIOLOGY_STAFF));
  });
});
