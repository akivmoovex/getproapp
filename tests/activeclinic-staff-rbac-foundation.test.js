"use strict";

/**
 * ActiveClinic V6 — staff profile + RBAC principal foundation (AC-V6-06).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

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
  requireActiveStaffMember,
  suspendStaffMember,
  archiveStaffMember,
  linkStaffMemberToIdentity,
  RESULT: STAFF_RESULT,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
  listFacilitiesForStaff,
  getActiveStaffFacilityAssignment,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  resolveEffectivePermissions,
  authorizeStaffPermission,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
  RESULT: AUTHZ_RESULT,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  CODE_ORG_STAGING,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;

async function provisionOrg(input) {
  const result = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    ...input,
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal",
    publicName: "Public",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: "+260970000001",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  return {
    orgId: org.records.organization.id,
    orgKey: org.records.organization.key,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

describe("ActiveClinic staff profile and RBAC foundation", () => {
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

  it("creates staff for ActiveClinic orgs and denies BlessBoard-only", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "stf");
    const invited = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Ivy",
      lastName: "Invite",
      employmentType: "contract",
      status: "invited",
      phone: "+260971000010",
    });
    assert.equal(invited.ok, true, JSON.stringify(invited));
    assert.equal(invited.staffMember.platformIdentityId, null);

    const bb = await provisionOrg({
      organizationKey: `bb_stf_${stamp}`,
      displayName: "BB Only Staff",
      productKey: "blessboard",
      productTenantKey: `bb-stf-${stamp}`,
      deploymentCode: CODE_ORG_STAGING,
    });
    const denied = await createStaffMember(pool, {
      organizationId: bb.records.organization.id,
      healthcareOrganizationId: ac.hcoId,
      firstName: "No",
      lastName: "Access",
      employmentType: "permanent",
      phone: "+260971000011",
    });
    assert.equal(denied.ok, false);
    assert.ok(
      [STAFF_RESULT.PRODUCT_NOT_ENABLED, STAFF_RESULT.HCO_NOT_FOUND].includes(
        denied.code
      )
    );
  });

  it("links identity across orgs and rejects duplicate within one HCO", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}a`;
    const a = await seedAcTenant(stamp, "ida");
    const b = await seedAcTenant(`${stamp}b`, "idb");
    const identity = await createPlatformIdentity(pool, {
      primaryEmail: `multi_${stamp}@example.test`,
    });
    assert.equal(identity.ok, true);

    const staffA = await createStaffMember(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      firstName: "Multi",
      lastName: "A",
      employmentType: "permanent",
      status: "active",
      phone: "+260971000020",
      platformIdentityId: identity.identity.id,
    });
    assert.equal(staffA.ok, true, JSON.stringify(staffA));

    const staffB = await createStaffMember(pool, {
      organizationId: b.orgId,
      healthcareOrganizationId: b.hcoId,
      firstName: "Multi",
      lastName: "B",
      employmentType: "permanent",
      status: "active",
      phone: "+260971000021",
      platformIdentityId: identity.identity.id,
    });
    assert.equal(staffB.ok, true, JSON.stringify(staffB));

    const dup = await createStaffMember(pool, {
      organizationId: a.orgId,
      healthcareOrganizationId: a.hcoId,
      firstName: "Dup",
      lastName: "A",
      employmentType: "permanent",
      phone: "+260971000022",
      platformIdentityId: identity.identity.id,
    });
    assert.equal(dup.code, STAFF_RESULT.DUPLICATE_IDENTITY);
  });

  it("suspends staff and denies active resolution despite roles", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}c`;
    const ac = await seedAcTenant(stamp, "sus");
    const identity = await createPlatformIdentity(pool, {});
    const staff = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Sue",
      lastName: "Pend",
      employmentType: "permanent",
      status: "active",
      phone: "+260971000030",
      platformIdentityId: identity.identity.id,
    });
    assert.equal(staff.ok, true);
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });
    await suspendStaffMember(pool, {
      id: staff.staffMember.id,
      organizationId: ac.orgId,
    });
    const active = await requireActiveStaffMember(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
    });
    assert.equal(active.code, STAFF_RESULT.NOT_ACTIVE);
    const perms = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
    });
    assert.equal(perms.ok, false);
    assert.equal(perms.code, AUTHZ_RESULT.STAFF_NOT_ACTIVE);
  });

  it("assigns facilities and enforces ownership / primary rules", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}d`;
    const ac = await seedAcTenant(stamp, "fac");
    const other = await seedAcTenant(`${stamp}o`, "faco");
    const staff = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Fac",
      lastName: "Staff",
      employmentType: "permanent",
      status: "active",
      phone: "+260971000040",
    });
    const assigned = await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: ac.facilityId,
      isPrimary: true,
    });
    assert.equal(assigned.ok, true, JSON.stringify(assigned));

    const cross = await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: other.facilityId,
    });
    assert.equal(cross.ok, false);

    const second = await createFacility(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityKey: "clinic-2",
      displayName: "Clinic 2",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: "+260970000002",
    });
    const multi = await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: second.facility.id,
      isPrimary: false,
    });
    assert.equal(multi.ok, true);
    const listed = await listFacilitiesForStaff(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
    });
    assert.equal(listed.assignments.filter((a) => a.status === "active").length, 2);
  });

  it("resolves network admin, facility admin, and staff permissions by scope", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}e`;
    const ac = await seedAcTenant(stamp, "rbac");
    const f2 = await createFacility(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityKey: "other-site",
      displayName: "Other",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: "+260970000003",
    });

    const net = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Net",
      lastName: "Admin",
      employmentType: "permanent",
      status: "active",
      phone: "+260971000050",
    });
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: net.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });
    const netPerms = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: net.staffMember.id,
    });
    assert.equal(netPerms.ok, true);
    assert.ok(netPerms.permissions.includes("activeclinic.staff.assign_access"));
    assert.ok(netPerms.permissions.includes("activeclinic.facility.archive"));

    const facAdmin = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Fac",
      lastName: "Admin",
      employmentType: "permanent",
      status: "active",
      phone: "+260971000051",
    });
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: facAdmin.staffMember.id,
      facilityId: ac.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: facAdmin.staffMember.id,
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityId: ac.facilityId,
    });
    const facPerms = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: facAdmin.staffMember.id,
      facilityId: ac.facilityId,
    });
    assert.equal(facPerms.ok, true);
    assert.ok(facPerms.permissions.includes("activeclinic.facility.update"));
    assert.equal(facPerms.permissions.includes("activeclinic.staff.assign_access"), false);
    assert.equal(facPerms.permissions.includes("activeclinic.facility.archive"), false);

    const otherFac = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: facAdmin.staffMember.id,
      facilityId: f2.facility.id,
    });
    assert.equal(otherFac.ok, false);
    assert.equal(otherFac.code, AUTHZ_RESULT.FACILITY_ASSIGNMENT_REQUIRED);

    const basic = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Basic",
      lastName: "Staff",
      employmentType: "permanent",
      status: "active",
      phone: "+260971000052",
    });
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: basic.staffMember.id,
      facilityId: ac.facilityId,
    });
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: basic.staffMember.id,
      roleKey: STAFF_ROLE,
      scopeType: "organisation",
    });
    const basicAuth = await authorizeStaffPermission(pool, {
      organizationId: ac.orgId,
      staffMemberId: basic.staffMember.id,
      permissionKey: "activeclinic.access",
    });
    assert.equal(basicAuth.allowed, true);
    const manageAuth = await authorizeStaffPermission(pool, {
      organizationId: ac.orgId,
      staffMemberId: basic.staffMember.id,
      permissionKey: "activeclinic.organization.manage",
    });
    assert.equal(manageAuth.allowed, false);
  });

  it("denies expired role assignments", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}f`;
    const ac = await seedAcTenant(stamp, "exp");
    const staff = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Exp",
      lastName: "Ired",
      employmentType: "temporary",
      status: "active",
      phone: "+260971000060",
    });
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: STAFF_ROLE,
      scopeType: "organisation",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const perms = await resolveEffectivePermissions(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
    });
    assert.equal(perms.ok, true);
    assert.equal(perms.permissions.length, 0);
  });

  it("rejects invalid employment type and status", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}g`;
    const ac = await seedAcTenant(stamp, "inv");
    const badType = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Bad",
      lastName: "Type",
      employmentType: "intern",
      phone: "+260971000070",
    });
    assert.equal(badType.code, STAFF_RESULT.INVALID_EMPLOYMENT_TYPE);
    const badStatus = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Bad",
      lastName: "Status",
      employmentType: "permanent",
      status: "deleted",
      phone: "+260971000071",
    });
    assert.equal(badStatus.code, STAFF_RESULT.INVALID_STATUS);
  });

  it("infra staff probes are tenant-scoped and production-disabled", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}h`;
    const ac = await seedAcTenant(stamp, "prb");
    const staff = await createStaffMember(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      firstName: "Probe",
      lastName: "Staff",
      employmentType: "permanent",
      status: "active",
      phone: "+260971000080",
    });
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: STAFF_ROLE,
      scopeType: "organisation",
    });

    const app = createActiveClinicFoundationApp({
      env: MINIMAL_AC,
      getPool: () => pool,
    });
    const list = await request(app)
      .get(`/__ac/staff?organizationKey=${ac.orgKey}`)
      .set("Host", "activeclinic.org");
    assert.equal(list.status, 200);
    assert.ok(list.body.staff.length >= 1);

    const one = await request(app)
      .get(`/__ac/staff/${staff.staffMember.id}?organizationKey=${ac.orgKey}`)
      .set("Host", "activeclinic.org");
    assert.equal(one.status, 200);

    const perms = await request(app)
      .get(
        `/__ac/staff/${staff.staffMember.id}/permissions?organizationKey=${ac.orgKey}`
      )
      .set("Host", "activeclinic.org");
    assert.equal(perms.status, 200);
    assert.ok(Array.isArray(perms.body.permissions));

    const prodApp = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, NODE_ENV: "production" },
      getPool: () => pool,
    });
    const blocked = await request(prodApp)
      .get(`/__ac/staff?organizationKey=${ac.orgKey}`)
      .set("Host", "activeclinic.org");
    assert.equal(blocked.status, 404);

    void archiveStaffMember;
    void getActiveStaffFacilityAssignment;
    void linkStaffMemberToIdentity;
  });
});
