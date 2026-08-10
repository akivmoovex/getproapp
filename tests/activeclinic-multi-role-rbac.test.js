"use strict";

/**
 * ActiveClinic Prompt 4 — multi-role RBAC: permission union + facility scope.
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
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const accessRepo = require("../src/activeclinic/repositories/staffAccessRepository");
const staffRepo = require("../src/activeclinic/repositories/staffMemberRepository");
const {
  assignStaffRole,
  resolveEffectivePermissions,
  authorizeStaffPermission,
  listStaffRoleAssignments,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
  CLINICIAN,
  RESULT: AUTHZ_RESULT,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  evaluateStaffEligibility,
} = require("../src/activeclinic/services/activeClinicLoginEligibility");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 880000000;

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

async function seedTwoFacilityTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `Multi ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const orgId = org.records.organization.id;
  const hco = await createHealthcareOrganization(pool, {
    organizationId: orgId,
    legalName: `Legal ${keyPrefix}`,
    publicName: `Public ${keyPrefix}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facilityA = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-a`,
    displayName: "Facility A",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityA.ok, true, JSON.stringify(facilityA));
  const facilityB = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-b`,
    displayName: "Facility B",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityB.ok, true, JSON.stringify(facilityB));
  return {
    orgId,
    orgKey: org.records.organization.key,
    hcoId: hco.healthcareOrganization.id,
    facilityAId: facilityA.facility.id,
    facilityBId: facilityB.facility.id,
  };
}

async function createLinkedStaff(ac, opts = {}) {
  const phone = opts.phone || nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: opts.email || `staff.${phone.slice(-8)}@example.test`,
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  const staff = await createStaffMember(pool, {
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "Multi",
    lastName: opts.lastName || "Role",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Staff",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  return {
    staffMemberId: staff.staffMember.id,
    identityId: identity.identity.id,
    identity: identity.identity,
  };
}

async function assignFacility(ac, staffMemberId, facilityId, isPrimary = false) {
  const result = await assignStaffToFacility(pool, {
    organizationId: ac.orgId,
    staffMemberId,
    facilityId,
    isPrimary,
  });
  assert.ok(
    result.ok || result.code === "facility_assignment_exists",
    JSON.stringify(result)
  );
}

async function assignRole(ac, staffMemberId, roleKey, scope) {
  const result = await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId,
    roleKey,
    scopeType: scope.scopeType,
    facilityId: scope.facilityId || null,
    expiresAt: scope.expiresAt || null,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.assignment;
}

describe("ActiveClinic multi-role RBAC (Prompt 4)", () => {
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

  it("Test 1: two facility roles at same facility union permissions", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedTwoFacilityTenant(stamp, "mr1");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    await assignRole(ac, user.staffMemberId, FACILITY_ADMIN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });

    const perms = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityAId,
    });
    assert.equal(perms.ok, true, JSON.stringify(perms));
    assert.ok(perms.permissions.includes("activeclinic.facility.update"));
    assert.ok(perms.permissions.includes("activeclinic.staff.assign_access"));
    assert.ok(perms.permissions.includes("activeclinic.encounter.manage"));
    assert.ok(perms.permissions.includes("activeclinic.consultation.record"));
    assert.ok(perms.permissions.includes("activeclinic.consultation.sign"));
    assert.ok(perms.permissions.includes("activeclinic.diagnosis.record"));
    assert.ok(perms.permissions.includes("activeclinic.clinical_order.create"));
    assert.equal(perms.permissions.includes("activeclinic.pharmacy.dispense"), false);
    assert.equal(perms.permissions.includes("activeclinic.payment.refund"), false);
    assert.equal(perms.permissions.includes("activeclinic.diagnostics.verify"), false);

    const nav = buildActiveClinicNavigation(perms.permissions);
    const keys = nav.items.map((i) => i.key);
    assert.ok(keys.includes("clinical"));
    assert.ok(keys.includes("staff"));
    assert.ok(keys.includes("access"));
    // Facility admin includes pharmacy.view (read) — not pharmacy.dispense.
    assert.ok(keys.includes("pharmacy"));
    assert.ok(!keys.includes("cashier"));
    assert.equal(perms.permissions.includes("activeclinic.pharmacy.dispense"), false);
  });

  it("Test 2: removing one role drops only that role's permissions", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t2`;
    const ac = await seedTwoFacilityTenant(stamp, "mr2");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    const facAdmin = await assignRole(ac, user.staffMemberId, FACILITY_ADMIN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });

    const revoked = await accessRepo.revokeRoleAssignment(pool, {
      id: facAdmin.id,
      organizationId: ac.orgId,
      revocationReason: "prompt4_test_revoke_facility_admin",
    });
    assert.ok(revoked);

    const perms = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityAId,
    });
    assert.equal(perms.ok, true);
    assert.ok(perms.permissions.includes("activeclinic.consultation.record"));
    assert.equal(perms.permissions.includes("activeclinic.facility.update"), false);
    assert.equal(perms.permissions.includes("activeclinic.staff.assign_access"), false);

    const eligStaff = await staffRepo.findByIdAndOrganization(pool, {
      id: user.staffMemberId,
      organizationId: ac.orgId,
    });
    const identity = (
      await pool.query(`SELECT * FROM platform.identities WHERE id = $1`, [
        user.identityId,
      ])
    ).rows[0];
    const elig = await evaluateStaffEligibility(pool, eligStaff, identity);
    assert.equal(elig.ok, true);
    assert.ok(elig.permissions.includes("activeclinic.access"));
  });

  it("Test 3: revoked role ignored while second role remains", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t3`;
    const ac = await seedTwoFacilityTenant(stamp, "mr3");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    const facAdmin = await assignRole(ac, user.staffMemberId, FACILITY_ADMIN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    await accessRepo.revokeRoleAssignment(pool, {
      id: facAdmin.id,
      organizationId: ac.orgId,
      revocationReason: "prompt4_test_revoked_ignored",
    });

    const listed = await listStaffRoleAssignments(pool, {
      staffMemberId: user.staffMemberId,
      organizationId: ac.orgId,
    });
    assert.deepEqual(
      (listed.assignments || []).map((a) => a.roleKey).sort(),
      [CLINICIAN]
    );
  });

  it("Test 4: expired role ignored while second role remains", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t4`;
    const ac = await seedTwoFacilityTenant(stamp, "mr4");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    await assignRole(ac, user.staffMemberId, FACILITY_ADMIN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const perms = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityAId,
    });
    assert.equal(perms.ok, true);
    assert.ok(perms.permissions.includes("activeclinic.consultation.record"));
    assert.equal(perms.permissions.includes("activeclinic.facility.update"), false);
  });

  it("Test 5: two roles at Facility A do not grant Facility B access", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t5`;
    const ac = await seedTwoFacilityTenant(stamp, "mr5");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    await assignRole(ac, user.staffMemberId, FACILITY_ADMIN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });

    const atB = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityBId,
    });
    assert.equal(atB.ok, false);
    assert.equal(atB.code, AUTHZ_RESULT.FACILITY_ASSIGNMENT_REQUIRED);

    // Even with facility membership at B but no roles there, clinical/admin
    // permissions from A must not appear.
    await assignFacility(ac, user.staffMemberId, ac.facilityBId, false);
    const atBMember = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityBId,
    });
    assert.equal(atBMember.ok, true);
    assert.equal(atBMember.permissions.includes("activeclinic.consultation.record"), false);
    assert.equal(atBMember.permissions.includes("activeclinic.facility.update"), false);
    assert.equal(atBMember.permissions.includes("activeclinic.organization.manage"), false);
  });

  it("Test 6: clinician at A + facility admin at B stay independently scoped", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t6`;
    const ac = await seedTwoFacilityTenant(stamp, "mr6");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    await assignFacility(ac, user.staffMemberId, ac.facilityBId, false);
    await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    await assignRole(ac, user.staffMemberId, FACILITY_ADMIN, {
      scopeType: "facility",
      facilityId: ac.facilityBId,
    });

    const atA = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityAId,
    });
    assert.equal(atA.ok, true);
    assert.ok(atA.permissions.includes("activeclinic.consultation.record"));
    assert.equal(atA.permissions.includes("activeclinic.facility.update"), false);

    const atB = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityBId,
    });
    assert.equal(atB.ok, true);
    assert.ok(atB.permissions.includes("activeclinic.facility.update"));
    assert.equal(atB.permissions.includes("activeclinic.consultation.record"), false);
    assert.equal(atB.permissions.includes("activeclinic.consultation.sign"), false);
  });

  it("Test 7: org admin + clinician A → A admin+clinical, B admin only", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t7`;
    const ac = await seedTwoFacilityTenant(stamp, "mr7");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    await assignRole(ac, user.staffMemberId, ORGANIZATION_ADMIN, {
      scopeType: "organisation",
    });
    await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });

    const atA = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityAId,
    });
    assert.equal(atA.ok, true);
    assert.ok(atA.permissions.includes("activeclinic.organization.manage"));
    assert.ok(atA.permissions.includes("activeclinic.consultation.record"));
    assert.ok(atA.permissions.includes("activeclinic.clinical_order.create"));

    const atB = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: ac.facilityBId,
    });
    assert.equal(atB.ok, true);
    assert.ok(atB.permissions.includes("activeclinic.organization.manage"));
    assert.ok(atB.permissions.includes("activeclinic.facility.create"));
    assert.equal(atB.permissions.includes("activeclinic.consultation.record"), false);
    assert.equal(atB.permissions.includes("activeclinic.consultation.sign"), false);
    assert.equal(atB.permissions.includes("activeclinic.diagnosis.record"), false);
    assert.equal(atB.permissions.includes("activeclinic.clinical_order.create"), false);
  });

  it("Test 8: cross-organization role assignment rejected", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t8`;
    const a = await seedTwoFacilityTenant(stamp, "mra");
    const b = await seedTwoFacilityTenant(`${stamp}b`, "mrb");
    const user = await createLinkedStaff(a);
    await assignFacility(a, user.staffMemberId, a.facilityAId, true);

    const cross = await assignStaffRole(pool, {
      organizationId: b.orgId,
      staffMemberId: user.staffMemberId,
      roleKey: CLINICIAN,
      scopeType: "facility",
      facilityId: b.facilityAId,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.code, AUTHZ_RESULT.STAFF_NOT_FOUND);

    const leak = await resolveEffectivePermissions(pool, {
      organizationId: b.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      facilityId: b.facilityAId,
    });
    assert.equal(leak.ok, false);
  });

  it("Test 9: cross-organization facility assignment rejected", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t9`;
    const a = await seedTwoFacilityTenant(stamp, "mfa");
    const b = await seedTwoFacilityTenant(`${stamp}b`, "mfb");
    const user = await createLinkedStaff(a);

    const cross = await assignStaffToFacility(pool, {
      organizationId: a.orgId,
      staffMemberId: user.staffMemberId,
      facilityId: b.facilityAId,
      isPrimary: true,
    });
    assert.equal(cross.ok, false);
    assert.ok(
      ["facility_not_found", "ownership_mismatch"].includes(cross.code),
      JSON.stringify(cross)
    );
  });

  it("Test 10: remaining valid role keeps LOGIN_READY", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t10`;
    const ac = await seedTwoFacilityTenant(stamp, "mr10");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    const clinician = await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    const facAdmin = await assignRole(ac, user.staffMemberId, FACILITY_ADMIN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    await accessRepo.revokeRoleAssignment(pool, {
      id: facAdmin.id,
      organizationId: ac.orgId,
      revocationReason: "prompt4_keep_login",
    });
    assert.ok(clinician.id);

    const staff = await staffRepo.findByIdAndOrganization(pool, {
      id: user.staffMemberId,
      organizationId: ac.orgId,
    });
    const identity = (
      await pool.query(`SELECT * FROM platform.identities WHERE id = $1`, [
        user.identityId,
      ])
    ).rows[0];
    const elig = await evaluateStaffEligibility(pool, staff, identity);
    assert.equal(elig.ok, true);
    assert.equal(elig.code, "ok");
  });

  it("Test 11: no remaining valid access role → login blocked", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t11`;
    const ac = await seedTwoFacilityTenant(stamp, "mr11");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    const only = await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    await accessRepo.revokeRoleAssignment(pool, {
      id: only.id,
      organizationId: ac.orgId,
      revocationReason: "prompt4_block_login",
    });

    const staff = await staffRepo.findByIdAndOrganization(pool, {
      id: user.staffMemberId,
      organizationId: ac.orgId,
    });
    const identity = (
      await pool.query(`SELECT * FROM platform.identities WHERE id = $1`, [
        user.identityId,
      ])
    ).rows[0];
    const elig = await evaluateStaffEligibility(pool, staff, identity);
    assert.equal(elig.ok, false);
    assert.equal(elig.code, "no_active_role");
  });

  it("Test 12: duplicate identical assignment prevented", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}t12`;
    const ac = await seedTwoFacilityTenant(stamp, "mr12");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    const first = await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    assert.ok(first.id);

    const dup = await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      roleKey: CLINICIAN,
      scopeType: "facility",
      facilityId: ac.facilityAId,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(dup.ok, false);
    assert.equal(dup.code, AUTHZ_RESULT.DUPLICATE);

    const listed = await listStaffRoleAssignments(pool, {
      staffMemberId: user.staffMemberId,
      organizationId: ac.orgId,
    });
    assert.equal(
      (listed.assignments || []).filter((a) => a.roleKey === CLINICIAN).length,
      1
    );
  });

  it("authorizeStaffPermission re-checks live (no stale revoked cache)", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}live`;
    const ac = await seedTwoFacilityTenant(stamp, "mrl");
    const user = await createLinkedStaff(ac);
    await assignFacility(ac, user.staffMemberId, ac.facilityAId, true);
    await assignRole(ac, user.staffMemberId, CLINICIAN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });
    const facAdmin = await assignRole(ac, user.staffMemberId, FACILITY_ADMIN, {
      scopeType: "facility",
      facilityId: ac.facilityAId,
    });

    const before = await authorizeStaffPermission(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      permissionKey: "activeclinic.facility.update",
      facilityId: ac.facilityAId,
    });
    assert.equal(before.allowed, true);

    await accessRepo.revokeRoleAssignment(pool, {
      id: facAdmin.id,
      organizationId: ac.orgId,
      revocationReason: "prompt4_live_auth",
    });

    const after = await authorizeStaffPermission(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      permissionKey: "activeclinic.facility.update",
      facilityId: ac.facilityAId,
    });
    assert.equal(after.allowed, false);

    const clinical = await authorizeStaffPermission(pool, {
      organizationId: ac.orgId,
      staffMemberId: user.staffMemberId,
      platformIdentityId: user.identityId,
      permissionKey: "activeclinic.consultation.record",
      facilityId: ac.facilityAId,
    });
    assert.equal(clinical.allowed, true);
  });
});
