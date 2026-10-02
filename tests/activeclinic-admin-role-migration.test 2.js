"use strict";

/**
 * ActiveClinic Prompt 3 — tenant admin facility_admin → organization_admin migration.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  resetFoundationDatabase,
  createFoundationPool,
} = require("./helpers/foundationDb");
const { migrate } = require("../db/scripts/lib/migrator");
const { provisionPlatformTenant } = require("../src/platform/services/provisionPlatformTenant");
const {
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
  listFacilitiesForStaff,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  resolveEffectivePermissions,
  listStaffRoleAssignments,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
  NETWORK_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  migrateActiveClinicTenantAdmins,
  resolveTargetAdmin,
  snapshotAdminAccess,
  REQUIRED_ADMIN_PERMS,
  FORBIDDEN_ADMIN_PERMS,
} = require("../src/activeclinic/services/activeClinicAdminRoleMigrationService");
const {
  evaluateStaffEligibility,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const staffRepo = require("../src/activeclinic/repositories/staffMemberRepository");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 870000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedAdminTenant(stamp, orgKey, email) {
  const org = await provisionOrg({
    organizationKey: orgKey,
    displayName: `Admin Migrate ${orgKey}`,
    productKey: "activeclinic",
    productTenantKey: orgKey,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const orgId = org.records.organization.id;
  const hco = await createHealthcareOrganization(pool, {
    organizationId: orgId,
    legalName: `Legal ${orgKey}`,
    publicName: `HCO ${orgKey}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${orgKey}-main`,
    displayName: "Main",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));

  const identity = await createPlatformIdentity(pool, {
    primaryEmail: email,
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));

  const staff = await createStaffMember(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Clinic",
    lastName: "Admin",
    displayName: `Admin ${orgKey}`,
    employmentType: "permanent",
    status: "active",
    phone: nextPhone(),
    platformIdentityId: identity.identity.id,
    jobTitle: "Administrator",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));

  const facilityAssign = await assignStaffToFacility(pool, {
    organizationId: orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  assert.ok(
    facilityAssign.ok || facilityAssign.code === "facility_assignment_exists",
    JSON.stringify(facilityAssign)
  );

  const role = await assignStaffRole(pool, {
    organizationId: orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: FACILITY_ADMIN,
    scopeType: "facility",
    facilityId: facility.facility.id,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(role.ok, true, JSON.stringify(role));

  return {
    orgKey,
    orgId,
    email,
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    target: {
      key: orgKey,
      emailNormalized: email.toLowerCase(),
      organizationKey: orgKey,
    },
  };
}

describe("ActiveClinic admin role migration (Prompt 3)", () => {
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

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) {
      assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
    }
  }

  it("migrates facility_admin admins to organization_admin with LOGIN_READY", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const demo = await seedAdminTenant(
      stamp,
      `activeclinic-demo-${stamp}`,
      `demo.admin.${stamp}@activeclinic.example`
    );
    const jul = await seedAdminTenant(
      stamp,
      `julflona-clinic-${stamp}`,
      `julflona.${stamp}@gmail.com`
    );

    for (const tenant of [demo, jul]) {
      const before = await resolveTargetAdmin(pool, tenant.target);
      assert.equal(before.ok, true, JSON.stringify(before));
      const beforeSnap = await snapshotAdminAccess(pool, before);
      assert.ok(beforeSnap.roleKeys.includes(FACILITY_ADMIN));
      assert.ok(!beforeSnap.roleKeys.includes(ORGANIZATION_ADMIN));
      assert.equal(beforeSnap.loginReady, true);
    }

    const migrated = await migrateActiveClinicTenantAdmins(pool, {
      targets: [demo.target, jul.target],
      dryRun: false,
    });
    assert.equal(migrated.ok, true, JSON.stringify(migrated));

    for (const tenant of [demo, jul]) {
      const after = await resolveTargetAdmin(pool, tenant.target);
      assert.equal(after.ok, true, JSON.stringify(after));
      const snap = await snapshotAdminAccess(pool, after);
      assert.deepEqual(snap.roleKeys, [ORGANIZATION_ADMIN]);
      assert.equal(snap.loginReady, true);
      assert.equal(snap.loginCode, "LOGIN_READY");
      assert.equal(snap.isOrgWideAdmin, true);
      assert.deepEqual(snap.missingRequired, []);
      assert.deepEqual(snap.forbiddenPresent, []);
      for (const key of REQUIRED_ADMIN_PERMS) {
        assert.ok(snap.permissions.includes(key), `missing ${key}`);
      }
      for (const key of FORBIDDEN_ADMIN_PERMS) {
        assert.ok(!snap.permissions.includes(key), `forbidden present ${key}`);
      }

      const facilities = await listFacilitiesForStaff(pool, {
        staffMemberId: tenant.staffMemberId,
        organizationId: tenant.orgId,
      });
      assert.ok(
        (facilities.assignments || []).some(
          (a) => a.facilityId === tenant.facilityId && a.status === "active"
        ),
        "facility assignment retained"
      );
    }
  });

  it("is idempotent and preserves org-wide facility eligibility", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}i`;
    const tenant = await seedAdminTenant(
      stamp,
      `ac-mig-idem-${stamp}`,
      `idem.${stamp}@activeclinic.example`
    );

    const first = await migrateActiveClinicTenantAdmins(pool, {
      targets: [tenant.target],
    });
    assert.equal(first.ok, true, JSON.stringify(first));

    const second = await migrateActiveClinicTenantAdmins(pool, {
      targets: [tenant.target],
    });
    assert.equal(second.ok, true, JSON.stringify(second));
    assert.equal(second.results[0].actions.organizationAdminAlreadyPresent, true);
    assert.deepEqual(second.results[0].actions.facilityAdminRevoked, []);

    const roles = await listStaffRoleAssignments(pool, {
      staffMemberId: tenant.staffMemberId,
      organizationId: tenant.orgId,
    });
    assert.equal(
      (roles.assignments || []).filter((a) => a.roleKey === ORGANIZATION_ADMIN)
        .length,
      1
    );

    // Org-wide admin resolves permissions without facilityId (Prompt 2 behaviour).
    const perms = await resolveEffectivePermissions(pool, {
      organizationId: tenant.orgId,
      staffMemberId: tenant.staffMemberId,
      platformIdentityId: tenant.identityId,
      facilityId: null,
    });
    assert.equal(perms.ok, true);
    assert.ok(perms.permissions.includes("activeclinic.access"));
    assert.ok(perms.permissions.includes("activeclinic.organization.manage"));
  });

  it("keeps tenant isolation between Clinic A and Clinic B admins", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}x`;
    const a = await seedAdminTenant(
      stamp,
      `clinic-a-${stamp}`,
      `admin.a.${stamp}@example.test`
    );
    const b = await seedAdminTenant(
      stamp,
      `clinic-b-${stamp}`,
      `admin.b.${stamp}@example.test`
    );

    const migrated = await migrateActiveClinicTenantAdmins(pool, {
      targets: [a.target, b.target],
    });
    assert.equal(migrated.ok, true, JSON.stringify(migrated));

    const permsA = await resolveEffectivePermissions(pool, {
      organizationId: a.orgId,
      staffMemberId: a.staffMemberId,
      platformIdentityId: a.identityId,
      facilityId: null,
    });
    assert.equal(permsA.ok, true);

    const cross = await resolveEffectivePermissions(pool, {
      organizationId: b.orgId,
      staffMemberId: a.staffMemberId,
      platformIdentityId: a.identityId,
      facilityId: null,
    });
    assert.equal(cross.ok, false);

    const staffA = await staffRepo.findByIdAndOrganization(pool, {
      id: a.staffMemberId,
      organizationId: a.orgId,
    });
    const identityA = (
      await pool.query(`SELECT * FROM platform.identities WHERE id = $1`, [
        a.identityId,
      ])
    ).rows[0];
    const eligA = await evaluateStaffEligibility(pool, staffA, identityA);
    assert.equal(eligA.ok, true);
    assert.equal(eligA.organization.key, a.orgKey);

    const rolesA = await listStaffRoleAssignments(pool, {
      staffMemberId: a.staffMemberId,
      organizationId: a.orgId,
    });
    assert.ok(
      (rolesA.assignments || []).every(
        (r) => String(r.organizationId) === String(a.orgId)
      )
    );
    const rolesB = await listStaffRoleAssignments(pool, {
      staffMemberId: b.staffMemberId,
      organizationId: b.orgId,
    });
    assert.ok(
      (rolesB.assignments || []).every(
        (r) => String(r.organizationId) === String(b.orgId)
      )
    );
  });

  it("organization_admin alone keeps LOGIN_READY after facility_admin removal", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}r`;
    const tenant = await seedAdminTenant(
      stamp,
      `ac-login-${stamp}`,
      `login.${stamp}@activeclinic.example`
    );

    const migrated = await migrateActiveClinicTenantAdmins(pool, {
      targets: [tenant.target],
    });
    assert.equal(migrated.ok, true, JSON.stringify(migrated));

    const roles = await listStaffRoleAssignments(pool, {
      staffMemberId: tenant.staffMemberId,
      organizationId: tenant.orgId,
    });
    assert.ok(!(roles.assignments || []).some((r) => r.roleKey === FACILITY_ADMIN));
    assert.ok((roles.assignments || []).some((r) => r.roleKey === ORGANIZATION_ADMIN));
    // Compat: network_admin remains a separate role and must not be required.
    assert.ok(!(roles.assignments || []).some((r) => r.roleKey === NETWORK_ADMIN));

    const staff = await staffRepo.findByIdAndOrganization(pool, {
      id: tenant.staffMemberId,
      organizationId: tenant.orgId,
    });
    const identity = (
      await pool.query(`SELECT * FROM platform.identities WHERE id = $1`, [
        tenant.identityId,
      ])
    ).rows[0];
    const elig = await evaluateStaffEligibility(pool, staff, identity);
    assert.equal(elig.ok, true);
    assert.ok(elig.permissions.includes("activeclinic.access"));
  });

  it("aborts when email is not enrolled in the expected organization", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}m`;
    const a = await seedAdminTenant(
      stamp,
      `mismatch-a-${stamp}`,
      `mismatch.${stamp}@example.test`
    );
    await seedAdminTenant(
      stamp,
      `mismatch-b-${stamp}`,
      `other.${stamp}@example.test`
    );

    const bad = await resolveTargetAdmin(pool, {
      key: "bad",
      emailNormalized: a.email,
      organizationKey: `mismatch-b-${stamp}`,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.detail, "staff_not_in_expected_organization");
  });
});
