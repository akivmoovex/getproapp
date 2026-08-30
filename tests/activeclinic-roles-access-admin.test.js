"use strict";

/**
 * ActiveClinic Prompt 7 — Roles & Access admin UI governance.
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
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
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
  removeStaffFromFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
  CLINICIAN,
  CASHIER,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  assignFoundationalStaffRole,
  revokeFoundationalStaffRole,
  assertNotLastOrgAdminRemoval,
  RESULT,
} = require("../src/activeclinic/services/activeClinicAccessManagementService");
const {
  suspendStaffAccess,
} = require("../src/activeclinic/services/activeClinicStaffAccountAdministrationService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

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

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const orgId = org.records.organization.id;
  const hco = await createHealthcareOrganization(pool, {
    organizationId: orgId,
    legalName: "Legal Hospital",
    publicName: "Access Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-main`,
    displayName: "Main Hospital",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  const facility2 = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${keyPrefix}-east`,
    displayName: "Clinic East",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility2.ok, true, JSON.stringify(facility2));
  return {
    orgId,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    facility2Id: facility2.facility.id,
  };
}

async function seedStaff(ac, opts = {}) {
  const phone = opts.phone || nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: opts.email || `staff.${phone.slice(-8)}@example.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const facilityIds = opts.facilityIds || [ac.facilityId];
  const staff = await createStaffMember(pool, {
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "Staff",
    lastName: opts.lastName || "Member",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Team member",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  for (let i = 0; i < facilityIds.length; i += 1) {
    await assignStaffToFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: facilityIds[i],
      isPrimary: i === 0,
    });
  }
  if (opts.roleKey) {
    await assignStaffRole(pool, {
      organizationId: ac.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: opts.roleKey,
      scopeType: opts.scopeType || "organisation",
      facilityId: opts.scopeType === "facility" ? facilityIds[0] : null,
      assignmentOrigin: "system",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
  }
  if (Array.isArray(opts.extraRoles)) {
    for (const role of opts.extraRoles) {
      await assignStaffRole(pool, {
        organizationId: ac.orgId,
        staffMemberId: staff.staffMember.id,
        roleKey: role.roleKey,
        scopeType: role.scopeType || "facility",
        facilityId: role.facilityId || facilityIds[0],
        assignmentOrigin: "system",
        deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      });
    }
  }
  return {
    identity: identity.identity,
    staff: staff.staffMember,
  };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return { cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}` };
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
    log: () => {},
  });
}

function authContext(staffSeed, ac, permissions, roleAssignments) {
  return {
    organization: { id: ac.orgId },
    staffMember: staffSeed.staff,
    platformIdentity: staffSeed.identity,
    permissions,
    roleAssignments,
  };
}

describe("ActiveClinic roles & access admin UI (Prompt 7)", () => {
  before(async () => {
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("org admin can open staff access and role catalogue; clinician/cashier denied", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "ra7a");
    const admin = await seedStaff(ac, {
      roleKey: ORGANIZATION_ADMIN,
      firstName: "Org",
      lastName: "Boss",
    });
    const clinician = await seedStaff(ac, {
      roleKey: CLINICIAN,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Cli",
      lastName: "Doc",
    });
    const cashier = await seedStaff(ac, {
      roleKey: CASHIER,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Cash",
      lastName: "ier",
    });
    const app = makeApp();
    const { cookie: adminCookie } = await sessionCookie(admin.identity.id, ac.orgId);

    const overview = await request(app).get("/app/access").set("Cookie", adminCookie);
    assert.equal(overview.status, 200);
    assert.match(overview.text, /data-ac-access-tabs="1"/);
    assert.match(overview.text, /data-ac-staff-access-table="1"|Staff member/);
    assert.match(overview.text, /Org Boss/);

    const catalogue = await request(app)
      .get("/app/access?tab=catalogue")
      .set("Cookie", adminCookie);
    assert.equal(catalogue.status, 200);
    assert.match(catalogue.text, /data-ac-access-catalogue="1"/);
    assert.match(catalogue.text, /Organization administrator/);
    assert.match(catalogue.text, /Clinician \/ Doctor|Receptionist|Auditor/);
    assert.match(catalogue.text, /Compatibility \/ legacy|Network administrator/);
    assert.match(catalogue.text, /Website editor/);
    assert.match(catalogue.text, /Not currently grantable from Staff Users/);
    assert.match(catalogue.text, /View Permissions/);
    assert.doesNotMatch(catalogue.text, /name="permission/);

    const { cookie: clinCookie } = await sessionCookie(clinician.identity.id, ac.orgId);
    const deniedClin = await request(app).get("/app/access").set("Cookie", clinCookie);
    assert.equal(deniedClin.status, 403);
    const postDenied = await request(app)
      .post(`/app/access/staff/${admin.staff.id}/roles`)
      .set("Cookie", clinCookie)
      .type("form")
      .send({ role_key: STAFF_ROLE, scope_type: "facility", facility_id: ac.facilityId });
    assert.equal(postDenied.status, 403);

    const { cookie: cashCookie } = await sessionCookie(cashier.identity.id, ac.orgId);
    const deniedCash = await request(app).get("/app/access").set("Cookie", cashCookie);
    assert.equal(deniedCash.status, 403);
  });

  it("facility admin is scoped and cannot grant org admin", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}f`;
    const ac = await seedAcTenant(stamp, "ra7f");
    await seedStaff(ac, {
      roleKey: ORGANIZATION_ADMIN,
      firstName: "Keep",
      lastName: "Org",
    });
    const facAdmin = await seedStaff(ac, {
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Fac",
      lastName: "Admin",
    });
    const eastOnly = await seedStaff(ac, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [ac.facility2Id],
      firstName: "East",
      lastName: "Only",
    });
    const app = makeApp();
    const { cookie } = await sessionCookie(facAdmin.identity.id, ac.orgId);
    const overview = await request(app).get("/app/access").set("Cookie", cookie);
    assert.equal(overview.status, 200);
    assert.match(overview.text, /Fac Admin/);
    assert.doesNotMatch(overview.text, /East Only/);

    const deniedDetail = await request(app)
      .get(`/app/access/staff/${eastOnly.staff.id}`)
      .set("Cookie", cookie);
    assert.equal(deniedDetail.status, 403);

    const auth = authContext(facAdmin, ac, ["activeclinic.staff.assign_access"], [
      {
        roleKey: FACILITY_ADMIN,
        status: "active",
        scopeType: "facility",
        facilityId: ac.facilityId,
      },
    ]);
    const grant = await assignFoundationalStaffRole(pool, {
      auth,
      staffMemberId: facAdmin.staff.id,
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "organisation",
      facilityId: null,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(grant.ok, false);
    assert.equal(grant.code, RESULT.GRANT_DENIED);
  });

  it("multi-role assign and single-role revoke recalculate access", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}m`;
    const ac = await seedAcTenant(stamp, "ra7m");
    const admin = await seedStaff(ac, {
      roleKey: ORGANIZATION_ADMIN,
      facilityIds: [ac.facilityId, ac.facility2Id],
      firstName: "Multi",
      lastName: "Admin",
    });
    const target = await seedStaff(ac, {
      roleKey: null,
      facilityIds: [ac.facilityId],
      firstName: "Dual",
      lastName: "Role",
    });
    const { cookie } = await sessionCookie(admin.identity.id, ac.orgId);
    const app = makeApp();
    const csrf = issueCsrfToken(MINIMAL_AC);

    const assignedClinician = await request(app)
      .post(`/app/access/staff/${target.staff.id}/roles`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        role_keys: CLINICIAN,
        scope_type: "facility",
        facility_id: ac.facilityId,
      });
    assert.equal(assignedClinician.status, 303);

    const csrfFac = issueCsrfToken(MINIMAL_AC);
    const assignedFac = await request(app)
      .post(`/app/access/staff/${target.staff.id}/roles`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfFac}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfFac,
        role_keys: FACILITY_ADMIN,
        scope_type: "facility",
        facility_id: ac.facilityId,
      });
    assert.equal(assignedFac.status, 303);

    const detail = await request(app)
      .get(`/app/access/staff/${target.staff.id}`)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /Clinician/i);
    assert.match(detail.text, /Facility administrator/i);
    assert.match(detail.text, /data-ac-effective-access="1"/);
    assert.match(detail.text, /Clinical|Administration|Staff/);
    assert.match(detail.text, /data-ac-readonly-permissions="1"/);

    const assignmentIds = [...detail.text.matchAll(/data-ac-assignment="([^"]+)"/g)].map(
      (m) => m[1]
    );
    assert.ok(assignmentIds.length >= 2);

    // Find facility admin assignment id from markers with role key.
    const facMatch = detail.text.match(
      /data-ac-assignment="([^"]+)"[^>]*data-role-key="activeclinic_facility_admin"|data-role-key="activeclinic_facility_admin"[^>]*data-ac-assignment="([^"]+)"/
    );
    let facAssignmentId = facMatch && (facMatch[1] || facMatch[2]);
    if (!facAssignmentId) {
      // fallback: revoke by scanning articles
      const article = detail.text.split('data-role-key="activeclinic_facility_admin"')[0];
      const idMatch = article.match(/data-ac-assignment="([^"]+)"/g);
      facAssignmentId = idMatch
        ? idMatch[idMatch.length - 1].match(/"([^"]+)"/)[1]
        : assignmentIds[1];
    }

    const csrf2 = issueCsrfToken(MINIMAL_AC);
    const revoked = await request(app)
      .post(`/app/access/staff/${target.staff.id}/roles/${facAssignmentId}/revoke`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({ [CSRF_FIELD]: csrf2, reason: "drop_fac_admin" });
    assert.equal(revoked.status, 303);

    const after = await request(app)
      .get(`/app/access/staff/${target.staff.id}`)
      .set("Cookie", cookie);
    assert.match(after.text, /Clinician/);
    assert.match(after.text, /Currently effective/);
    // Facility admin may still appear as revoked badge; ensure clinical remains effective.
    assert.match(after.text, /data-role-key="activeclinic_clinician"[^>]*data-effective="1"|data-effective="1"[^>]*data-role-key="activeclinic_clinician"/);
  });

  it("protects last organization administrator and dependent facility roles", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}l`;
    const ac = await seedAcTenant(stamp, "ra7l");
    const onlyAdmin = await seedStaff(ac, {
      roleKey: ORGANIZATION_ADMIN,
      firstName: "Solo",
      lastName: "Admin",
    });
    const auth = authContext(onlyAdmin, ac, [
      "activeclinic.staff.assign_access",
      "activeclinic.staff.archive",
    ], [
      {
        roleKey: ORGANIZATION_ADMIN,
        status: "active",
        scopeType: "organisation",
      },
    ]);

    const rows = await pool.query(
      `SELECT a.id
         FROM activeclinic.staff_role_assignments a
         JOIN blessboard.roles r ON r.id = a.role_id
        WHERE a.staff_member_id = $1
          AND a.organization_id = $2
          AND r.role_key = $3
          AND a.status = 'active'`,
      [onlyAdmin.staff.id, ac.orgId, ORGANIZATION_ADMIN]
    );
    assert.equal(rows.rows.length, 1);
    const blocked = await revokeFoundationalStaffRole(pool, {
      auth,
      staffMemberId: onlyAdmin.staff.id,
      assignmentId: rows.rows[0].id,
      reason: "should_fail",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, RESULT.LAST_ORG_ADMIN);

    const suspendBlocked = await suspendStaffAccess(pool, {
      organizationId: ac.orgId,
      staffMemberId: onlyAdmin.staff.id,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(suspendBlocked.ok, false);
    assert.equal(suspendBlocked.code, RESULT.LAST_ORG_ADMIN);

    const second = await seedStaff(ac, {
      roleKey: ORGANIZATION_ADMIN,
      firstName: "Second",
      lastName: "Admin",
    });
    const guard = await assertNotLastOrgAdminRemoval(pool, {
      organizationId: ac.orgId,
      staffMemberId: onlyAdmin.staff.id,
    });
    assert.equal(guard.ok, true);

    const allowed = await revokeFoundationalStaffRole(pool, {
      auth,
      staffMemberId: onlyAdmin.staff.id,
      assignmentId: rows.rows[0].id,
      reason: "now_safe",
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(allowed.ok, true, JSON.stringify(allowed));
    assert.ok(second.staff.id);

    const clinician = await seedStaff(ac, {
      roleKey: CLINICIAN,
      scopeType: "facility",
      facilityIds: [ac.facilityId],
      firstName: "Dep",
      lastName: "Clin",
    });
    const removeBlocked = await removeStaffFromFacility(pool, {
      organizationId: ac.orgId,
      staffMemberId: clinician.staff.id,
      facilityId: ac.facilityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(removeBlocked.ok, false);
    assert.equal(removeBlocked.code, "dependent_facility_roles");
  });

  it("rejects cross-tenant access detail and foreign facility grant", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}x`;
    const a = await seedAcTenant(stamp, "ra7x");
    const b = await seedAcTenant(`${stamp}b`, "ra7y");
    const adminA = await seedStaff(a, {
      roleKey: ORGANIZATION_ADMIN,
      firstName: "A",
      lastName: "Admin",
    });
    const staffB = await seedStaff(b, {
      roleKey: STAFF_ROLE,
      scopeType: "facility",
      facilityIds: [b.facilityId],
      firstName: "B",
      lastName: "Staff",
    });
    const app = makeApp();
    const { cookie } = await sessionCookie(adminA.identity.id, a.orgId);
    const denied = await request(app)
      .get(`/app/access/staff/${staffB.staff.id}`)
      .set("Cookie", cookie);
    assert.equal(denied.status, 404);

    const auth = authContext(adminA, a, ["activeclinic.staff.assign_access"], [
      {
        roleKey: ORGANIZATION_ADMIN,
        status: "active",
        scopeType: "organisation",
      },
    ]);
    const foreign = await assignFoundationalStaffRole(pool, {
      auth,
      staffMemberId: adminA.staff.id,
      roleKey: CLINICIAN,
      scopeType: "facility",
      facilityId: b.facilityId,
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    });
    assert.equal(foreign.ok, false);
  });
});
