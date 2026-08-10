"use strict";

/**
 * ActiveClinic QA role users seed — focused coverage.
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
} = require("../src/activeclinic/services/activeClinicDemoClinicSeedService");
const {
  seedActiveClinicQaRoleUsers,
  assessPassword,
  assessQaPhone,
  ensureQaIdentityPhone,
  countQaArtifacts,
  REQUESTED_QA_PASSWORD,
  RECOMMENDED_QA_PASSWORD,
  QA_ROLE_USERS,
  PRESERVED_DEMO_EMAILS,
  RESULT,
} = require("../src/activeclinic/services/activeClinicQaRoleUsersSeedService");
const {
  resolveEffectivePermissions,
  listStaffRoleAssignments,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  evaluateStaffEligibility,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const { buildActiveClinicNavigation } = require("../src/activeclinic/services/activeClinicNavigation");
const {
  resolveIdentityForLogin,
} = require("../src/activeclinic/services/authenticateActiveClinicIdentity");
const {
  verifyPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");
const identityRepo = require("../src/platform/repositories/platformIdentityRepository");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;

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
      `SELECT f.id, f.facility_key, f.display_name
         FROM activeclinic.facilities f
        WHERE f.organization_id = $1 AND f.status = 'active'
        ORDER BY CASE WHEN f.facility_key = 'lusaka' THEN 0 ELSE 1 END,
                 f.created_at ASC
        LIMIT 1`,
      [org.id]
    )
  ).rows[0];
  assert.ok(facility);
  return { orgId: org.id, facilityId: facility.id, facilityKey: facility.facility_key };
}

async function loadQaStaff(db, orgId, email) {
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

describe("ActiveClinic QA role users", () => {
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

  it("accepts deterministic QA phones and Zambia login normalization", () => {
    for (const user of QA_ROLE_USERS) {
      const assessed = assessQaPhone(user.phone);
      assert.equal(assessed.ok, true, user.phone);
      assert.equal(assessed.normalized, user.phone);
    }
    const national = normalizeRegistrationPhone("0970000001");
    assert.equal(national.ok, true);
    assert.equal(national.normalized, "+260970000001");
    const staffOnly = assessQaPhone("0970000001");
    // Login accepts national; staff helper requires E.164 — assessQaPhone
    // normalizes via login first then staff-validates the E.164 result.
    assert.equal(staffOnly.ok, true);
    assert.equal(staffOnly.normalized, "+260970000001");
  });

  it("rejects requested 8-char QA password by existing policy", () => {
    const rejected = assessPassword(REQUESTED_QA_PASSWORD);
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, RESULT.PASSWORD_REJECTED);
    assert.equal(rejected.passwordMinLength, 10);
    const accepted = assessPassword(RECOMMENDED_QA_PASSWORD);
    assert.equal(accepted.ok, true);
  });

  it("refuses seed without confirm/dryRun", async () => {
    requireDb();
    const r = await seedActiveClinicQaRoleUsers(pool, {});
    assert.equal(r.ok, false);
    assert.equal(r.code, RESULT.REFUSED);
  });

  it("creates 15 QA users idempotently with LOGIN_READY and correct RBAC", async () => {
    requireDb();

    const demoSeed = await seedActiveClinicDemoClinics(pool, {
      clinicKeys: [DEMO_CLINIC_KEY, JULFLONA_CLINIC_KEY],
      requireIdentityKey: "blessboard-platform-v5",
    });
    assert.equal(demoSeed.ok, true, JSON.stringify(demoSeed));

    const { orgId, facilityId } = await loadDemoOrg(pool);
    const preservedBefore = (
      await pool.query(
        `SELECT email_normalized, display_name, status, platform_identity_id,
                phone_normalized
           FROM activeclinic.staff_members
          WHERE organization_id = $1
            AND email_normalized = ANY($2::text[])
          ORDER BY email_normalized`,
        [orgId, PRESERVED_DEMO_EMAILS]
      )
    ).rows;

    const aborted = await seedActiveClinicQaRoleUsers(pool, {
      confirm: true,
      password: REQUESTED_QA_PASSWORD,
      requireIdentityKey: "blessboard-platform-v5",
    });
    assert.equal(aborted.ok, false);
    assert.equal(aborted.code, RESULT.PASSWORD_REJECTED);
    assert.equal(aborted.usersCreated, 0);
    const midCounts = await countQaArtifacts(pool, orgId);
    assert.equal(midCounts.identities, 0);

    const first = await seedActiveClinicQaRoleUsers(pool, {
      confirm: true,
      password: RECOMMENDED_QA_PASSWORD,
      requireIdentityKey: "blessboard-platform-v5",
    });
    assert.equal(first.ok, true, JSON.stringify(first));
    assert.equal(first.users.length, 15);
    assert.equal(first.loginReadyCount, 15);
    assert.equal(first.emailPhoneMatchCount, 15);
    assert.equal(first.phoneResolveOkCount, 15);
    assert.equal(first.julflonaQaEmailStaffCount, 0);
    assert.equal(first.julflonaQaPhoneIdentityCount, 0);
    assert.equal(first.afterCounts.identities, 15);
    assert.equal(first.afterCounts.staff, 15);
    assert.equal(first.afterCounts.activeRoleAssignments, 15);
    assert.equal(first.afterCounts.distinctQaPhones, 15);

    const second = await seedActiveClinicQaRoleUsers(pool, {
      confirm: true,
      password: RECOMMENDED_QA_PASSWORD,
      requireIdentityKey: "blessboard-platform-v5",
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.afterCounts.identities, 15);
    assert.equal(second.afterCounts.staff, 15);
    assert.equal(second.afterCounts.activeRoleAssignments, 15);
    assert.equal(second.afterCounts.distinctQaPhones, 15);
    assert.equal(second.loginReadyCount, 15);
    assert.equal(second.phoneAlreadyCorrect, 15);
    assert.equal(second.phoneUpdated, 0);

    const preservedAfter = (
      await pool.query(
        `SELECT email_normalized, display_name, status, platform_identity_id,
                phone_normalized
           FROM activeclinic.staff_members
          WHERE organization_id = $1
            AND email_normalized = ANY($2::text[])
          ORDER BY email_normalized`,
        [orgId, PRESERVED_DEMO_EMAILS]
      )
    ).rows;
    assert.deepEqual(
      preservedAfter.map((r) => ({
        e: r.email_normalized,
        d: r.display_name,
        s: r.status,
        i: r.platform_identity_id,
        p: r.phone_normalized,
      })),
      preservedBefore.map((r) => ({
        e: r.email_normalized,
        d: r.display_name,
        s: r.status,
        i: r.platform_identity_id,
        p: r.phone_normalized,
      }))
    );

    const julflona = await pool.query(
      `SELECT count(*)::int AS n
         FROM activeclinic.staff_members s
         JOIN platform.organizations o ON o.id = s.organization_id
        WHERE o.organization_key = $1
          AND (
            s.email_normalized = ANY($2::text[])
            OR s.phone_normalized = ANY($3::text[])
          )`,
      [
        JULFLONA_CLINIC_KEY,
        QA_ROLE_USERS.map((u) => u.email),
        QA_ROLE_USERS.map((u) => u.phone),
      ]
    );
    assert.equal(julflona.rows[0].n, 0);

    const phoneSet = new Set();
    for (const user of QA_ROLE_USERS) {
      const { identity, staff } = await loadQaStaff(pool, orgId, user.email);
      assert.equal(staff.display_name, user.displayName);
      assert.equal(staff.job_title, user.jobTitle);
      assert.equal(identity.status, "active");
      assert.equal(identity.phone_normalized, user.phone);
      assert.equal(staff.phone_normalized, user.phone);
      phoneSet.add(identity.phone_normalized);

      const byPhone = await identityRepo.findIdentitiesByNormalizedContact(pool, {
        phoneNormalized: user.phone,
      });
      assert.equal(byPhone.length, 1);
      assert.equal(String(byPhone[0].id), String(identity.id));

      const resolved = await resolveIdentityForLogin(pool, {
        identifier: user.phone,
      });
      assert.equal(resolved.ok, true, user.phone);
      assert.equal(resolved.kind, "phone");
      assert.equal(String(resolved.identityRow.id), String(identity.id));

      const nationalForm = user.phone.replace("+260", "0");
      const resolvedNational = await resolveIdentityForLogin(pool, {
        identifier: nationalForm,
      });
      assert.equal(resolvedNational.ok, true, nationalForm);
      assert.equal(String(resolvedNational.identityRow.id), String(identity.id));

      const pw = await verifyPlatformIdentityPassword(pool, {
        identityId: identity.id,
        password: RECOMMENDED_QA_PASSWORD,
      });
      assert.equal(pw.ok, true, `password for ${user.email}`);

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
        )
      );

      const fac = await pool.query(
        `SELECT facility_id FROM activeclinic.staff_facility_assignments
          WHERE staff_member_id = $1 AND organization_id = $2 AND status = 'active'`,
        [staff.id, orgId]
      );
      assert.ok(
        fac.rows.some((r) => String(r.facility_id) === String(facilityId))
      );

      const roles = await listStaffRoleAssignments(pool, {
        staffMemberId: staff.id,
        organizationId: orgId,
      });
      const active = (roles.assignments || []).filter(
        (a) => a.status === "active" && !a.revokedAt
      );
      assert.equal(active.length, 1, `${user.email} role count`);
      assert.equal(active[0].roleKey, user.roleKey);
      assert.equal(active[0].scopeType, user.scopeType);
      if (user.scopeType === "facility") {
        assert.equal(String(active[0].facilityId), String(facilityId));
      }

      const elig = await evaluateStaffEligibility(pool, staff, identity);
      assert.equal(elig.ok, true, `${user.email} ${elig.code}`);

      const perms = await resolveEffectivePermissions(pool, {
        organizationId: orgId,
        staffMemberId: staff.id,
        platformIdentityId: identity.id,
        facilityId,
      });
      assert.equal(perms.ok, true);
      const set = new Set(perms.permissions || []);
      const allow = first.verifications.find((v) => v.email === user.email);
      assert.ok(allow.positiveOk, `${user.email} positive ${allow.positivePermission}`);
      assert.ok(allow.negativeOk, `${user.email} negative ${allow.negativePermission}`);
      assert.ok(allow.emailPhoneMatch);
      assert.ok(allow.phoneResolveOk);
      assert.ok(allow.staffPhoneMatches);
      assert.ok(set.has(allow.positivePermission));
      assert.equal(set.has(allow.negativePermission), false);

      if (user.roleKey === "activeclinic_lab_technician") {
        assert.equal(set.has("activeclinic.lab.view"), true);
        assert.equal(set.has("activeclinic.radiology.view"), false);
        assert.equal(set.has("activeclinic.radiology.result"), false);
      }
      if (user.roleKey === "activeclinic_radiology_staff") {
        assert.equal(set.has("activeclinic.radiology.view"), true);
        assert.equal(set.has("activeclinic.lab.view"), false);
        assert.equal(set.has("activeclinic.lab.result"), false);
      }
      if (user.roleKey === "activeclinic_cashier") {
        assert.equal(set.has("activeclinic.payment.collect"), true);
        assert.equal(set.has("activeclinic.payment.refund"), false);
        assert.equal(set.has("activeclinic.payment.reverse"), false);
      }
      if (user.roleKey === "activeclinic_billing_officer") {
        assert.equal(set.has("activeclinic.billing.charge"), true);
        assert.equal(set.has("activeclinic.payment.refund"), false);
        assert.equal(set.has("activeclinic.payment.reverse"), false);
      }
      if (user.roleKey === "activeclinic_finance_supervisor") {
        assert.equal(set.has("activeclinic.payment.refund"), true);
        assert.equal(set.has("activeclinic.payment.reverse"), true);
      }
      if (user.roleKey === "activeclinic_organization_admin") {
        assert.equal(set.has("activeclinic.staff.assign_access"), true);
      }
      if (
        user.roleKey === "activeclinic_clinician" ||
        user.roleKey === "activeclinic_cashier"
      ) {
        assert.equal(set.has("activeclinic.staff.assign_access"), false);
      }

      const nav = buildActiveClinicNavigation(perms.permissions || []);
      const keys = (nav.items || []).map((i) => i.key);
      if (user.roleKey === "activeclinic_receptionist") {
        assert.ok(keys.includes("patients") || keys.includes("appointments") || keys.includes("reception"));
      }
      if (user.roleKey === "activeclinic_clinician") {
        assert.ok(keys.includes("clinical") || keys.includes("patients"));
      }
      if (user.roleKey === "activeclinic_pharmacist") {
        assert.ok(keys.includes("pharmacy"));
      }
      if (
        user.roleKey === "activeclinic_lab_technician" ||
        user.roleKey === "activeclinic_radiology_staff"
      ) {
        assert.ok(keys.includes("diagnostics"));
      }
      if (user.roleKey === "activeclinic_billing_officer") {
        assert.ok(keys.includes("billing"));
      }
      if (user.roleKey === "activeclinic_cashier") {
        assert.ok(keys.includes("cashier"));
      }
      if (user.roleKey === "activeclinic_staff") {
        assert.ok(keys.length <= 4);
      }
    }
    assert.equal(phoneSet.size, 15);

    const wrongPhone = await resolveIdentityForLogin(pool, {
      identifier: "+260970009999",
    });
    assert.equal(wrongPhone.ok, false);

    const foreign = await createPlatformIdentity(pool, {
      primaryEmail: "qa-phone-conflict@example.com",
      emailNormalized: "qa-phone-conflict@example.com",
      emailVerifiedAt: new Date().toISOString(),
      status: "active",
    });
    assert.equal(foreign.ok, true);
    const conflict = await ensureQaIdentityPhone(
      pool,
      foreign.identity.id,
      QA_ROLE_USERS[0].phone,
      QA_ROLE_USERS[0].phone
    );
    assert.equal(conflict.ok, false);
    assert.equal(conflict.code, RESULT.PHONE_CONFLICT);

    const facilityAdmin = first.verifications.find(
      (v) => v.roleKey === "activeclinic_facility_admin"
    );
    assert.ok(facilityAdmin.assignAccess === true || facilityAdmin.positiveOk);
  });

  it("production environment refuses QA seed", async () => {
    requireDb();
    await pool.query(
      `UPDATE platform.database_identity
          SET environment_code = 'production', updated_at = now()
        WHERE id = 1`
    );
    try {
      const r = await seedActiveClinicQaRoleUsers(pool, {
        confirm: true,
        password: RECOMMENDED_QA_PASSWORD,
        requireIdentityKey: "blessboard-platform-v5",
      });
      assert.equal(r.ok, false);
      assert.equal(r.code, RESULT.REFUSED);
    } finally {
      await pool.query(
        `UPDATE platform.database_identity
            SET environment_code = 'testing', updated_at = now()
          WHERE id = 1`
      );
    }
  });
});
