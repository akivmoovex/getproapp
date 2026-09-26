"use strict";

/**
 * V2.02 ActiveClinic RBAC alignment — patient.create catalogue families + scope.
 * Production: DO NOT TOUCH.
 */

const { describe, it, before, after } = require("node:test");
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
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  authorizeStaffPermission,
  ORGANIZATION_ADMIN,
  FACILITY_ADMIN,
  CLINIC_MANAGER,
  RECEPTIONIST,
  MEDICAL_RECORDS_OFFICER,
  NURSE,
  BILLING_OFFICER,
  FINANCE_SUPERVISOR,
  WEBSITE_EDITOR,
  LAB_TECHNICIAN,
  RADIOLOGY_STAFF,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  canGrantRole,
  RESULT: ACCESS_RESULT,
} = require("../src/activeclinic/services/activeClinicAccessManagementService");
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
const {
  registerActiveClinicPatient,
  PERM,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  PATIENT_CREATE_ALLOWED_ROLE_KEYS,
  PATIENT_CREATE_PERMISSION_KEY,
  auditActiveClinicPatientCreateGrants,
  assertPatientCreatePolicy,
  roleMayHoldPatientCreate,
} = require("../src/platform/rbac");

const PASSWORD = "DemoStaff-ActiveClinic-2026A";
const MINIMAL_AC = {
  NODE_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  SESSION_SECRET: "test-session-secret-ac-rbac-align-32chars!",
};

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 27088000000;

function nextPhone() {
  phoneSeq += 1;
  return `+${phoneSeq}`;
}

async function seedTenant(key) {
  const stamp = Date.now().toString(36);
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${key}_${stamp}`,
    displayName: `Align ${key}`,
    productKey: "activeclinic",
    productTenantKey: `${key}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const orgId = org.records.organization.id;
  const hco = await createHealthcareOrganization(pool, {
    organizationId: orgId,
    legalName: `Legal ${key}`,
    publicName: `Public ${key}`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facilityA = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${key}-a`,
    displayName: "Facility A",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityA.ok, true);
  const facilityB = await createFacility(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `${key}-b`,
    displayName: "Facility B",
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facilityB.ok, true);
  await ensureDefaultDepartments(pool, {
    organizationId: orgId,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facilityA.facility.id,
  });
  return {
    orgId,
    hcoId: hco.healthcareOrganization.id,
    facilityAId: facilityA.facility.id,
    facilityBId: facilityB.facility.id,
  };
}

async function seedUser(tenant, roleKey, opts) {
  const options = opts || {};
  const scopeType = options.scopeType || "facility";
  const facilityId =
    options.facilityId ||
    (scopeType === "facility" ? tenant.facilityAId : null);
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${roleKey}.${phone.slice(-8)}@example.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: "Align",
    lastName: roleKey,
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: roleKey,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  if (facilityId) {
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId,
      isPrimary: true,
    });
  }
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType,
    facilityId: scopeType === "facility" ? facilityId : null,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
    facilityId,
  };
}

async function makeSessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    platformIdentityId: identityId,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    organizationId: orgId,
    metadata: facilityId ? { facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function makeApp() {
  return createActiveClinicFoundationApp({
    getPool: () => pool,
    env: MINIMAL_AC,
  });
}

function csrfPair() {
  const token = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${token}`,
    field: { [CSRF_FIELD]: token },
  };
}

describe("V2.02 ActiveClinic RBAC alignment", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
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
      pool = null;
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("catalogue patient.create matches approved families only", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const audit = await auditActiveClinicPatientCreateGrants(pool);
    assert.equal(audit.ok, true, JSON.stringify(audit));
    assert.deepEqual(
      [...audit.roleKeys].sort(),
      [...PATIENT_CREATE_ALLOWED_ROLE_KEYS].sort()
    );
    assert.equal(roleMayHoldPatientCreate(ORGANIZATION_ADMIN), true);
    assert.equal(roleMayHoldPatientCreate(FACILITY_ADMIN), false);
    assert.equal(
      assertPatientCreatePolicy([PATIENT_CREATE_PERMISSION_KEY], BILLING_OFFICER).ok,
      false
    );
  });

  it("receptionist, medical records, clinic manager, org admin can create", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("allow");
    const cases = [
      { role: RECEPTIONIST, scopeType: "facility" },
      { role: MEDICAL_RECORDS_OFFICER, scopeType: "facility" },
      { role: CLINIC_MANAGER, scopeType: "facility" },
      { role: ORGANIZATION_ADMIN, scopeType: "organisation" },
    ];
    for (const c of cases) {
      const user = await seedUser(tenant, c.role, { scopeType: c.scopeType });
      const authz = await authorizeStaffPermission(pool, {
        organizationId: tenant.orgId,
        staffMemberId: user.staffMemberId,
        permissionKey: PERM.CREATE,
        facilityId: tenant.facilityAId,
      });
      assert.equal(authz.allowed, true, `${c.role} should create`);

      const created = await registerActiveClinicPatient(pool, {
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        facilityId: tenant.facilityAId,
        demographics: {
          firstName: "Allow",
          lastName: c.role.slice(-12),
          sexAtRegistration: "female",
          dateOfBirth: "1990-01-01",
        },
        contacts: {},
        address: {},
        actor: {
          staffMemberId: user.staffMemberId,
          platformIdentityId: user.identityId,
          organizationId: tenant.orgId,
        },
      });
      assert.equal(created.ok, true, `${c.role}: ${JSON.stringify(created)}`);
    }
  });

  it("denies create for billing, finance, website, lab, radiology, facility admin, staff", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("deny");
    const deniedRoles = [
      { role: BILLING_OFFICER, scopeType: "facility" },
      { role: FINANCE_SUPERVISOR, scopeType: "facility" },
      { role: WEBSITE_EDITOR, scopeType: "organisation" },
      { role: LAB_TECHNICIAN, scopeType: "facility" },
      { role: RADIOLOGY_STAFF, scopeType: "facility" },
      { role: FACILITY_ADMIN, scopeType: "facility" },
      { role: STAFF_ROLE, scopeType: "facility" },
      { role: NURSE, scopeType: "facility" },
    ];
    for (const c of deniedRoles) {
      const user = await seedUser(tenant, c.role, { scopeType: c.scopeType });
      const authz = await authorizeStaffPermission(pool, {
        organizationId: tenant.orgId,
        staffMemberId: user.staffMemberId,
        permissionKey: PERM.CREATE,
        facilityId: tenant.facilityAId,
      });
      assert.equal(authz.allowed, false, `${c.role} must not create`);
    }
  });

  it("nurse retains patient.view without patient.create", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("nurseview");
    const nurse = await seedUser(tenant, NURSE);
    const view = await authorizeStaffPermission(pool, {
      organizationId: tenant.orgId,
      staffMemberId: nurse.staffMemberId,
      permissionKey: PERM.VIEW,
      facilityId: tenant.facilityAId,
    });
    const create = await authorizeStaffPermission(pool, {
      organizationId: tenant.orgId,
      staffMemberId: nurse.staffMemberId,
      permissionKey: PERM.CREATE,
      facilityId: tenant.facilityAId,
    });
    assert.equal(view.allowed, true);
    assert.equal(create.allowed, false);
  });

  it("facility-scoped receptionist cannot create at another facility", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("scope");
    const receptionist = await seedUser(tenant, RECEPTIONIST, {
      scopeType: "facility",
      facilityId: tenant.facilityAId,
    });
    const created = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityBId,
      demographics: {
        firstName: "Cross",
        lastName: "Facility",
        sexAtRegistration: "male",
        dateOfBirth: "1988-05-05",
      },
      contacts: {},
      address: {},
      actor: {
        staffMemberId: receptionist.staffMemberId,
        platformIdentityId: receptionist.identityId,
        organizationId: tenant.orgId,
      },
    });
    assert.equal(created.ok, false);
  });

  it("cross-clinic (other org) registration is denied", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const a = await seedTenant("orgA");
    const b = await seedTenant("orgB");
    const receptionist = await seedUser(a, RECEPTIONIST);
    const created = await registerActiveClinicPatient(pool, {
      organizationId: b.orgId,
      healthcareOrganizationId: b.hcoId,
      facilityId: b.facilityAId,
      demographics: {
        firstName: "Cross",
        lastName: "Clinic",
        sexAtRegistration: "female",
        dateOfBirth: "1992-02-02",
      },
      contacts: {},
      address: {},
      actor: {
        staffMemberId: receptionist.staffMemberId,
        platformIdentityId: receptionist.identityId,
        organizationId: a.orgId,
      },
    });
    assert.equal(created.ok, false);
  });

  it("direct /app/patients/new API denies billing-only; allows receptionist", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("api");
    const receptionist = await seedUser(tenant, RECEPTIONIST);
    const billing = await seedUser(tenant, BILLING_OFFICER);
    const app = makeApp();
    const csrf = csrfPair();

    const okCookie = await makeSessionCookie(
      receptionist.identityId,
      tenant.orgId,
      tenant.facilityAId
    );
    const ok = await request(app)
      .get("/app/patients/new")
      .set("Cookie", [okCookie, csrf.cookie]);
    assert.equal(ok.status, 200);

    const denyCookie = await makeSessionCookie(
      billing.identityId,
      tenant.orgId,
      tenant.facilityAId
    );
    const denied = await request(app)
      .get("/app/patients/new")
      .set("Cookie", [denyCookie, csrf.cookie]);
    assert.equal(denied.status, 403);
  });

  it("self-elevation to organization admin is denied", async (t) => {
    if (skipReason) return t.skip(skipReason);
    const tenant = await seedTenant("self");
    const facilityAdmin = await seedUser(tenant, FACILITY_ADMIN);
    const auth = {
      organization: { id: tenant.orgId },
      staffMember: { id: facilityAdmin.staffMemberId },
      permissions: ["activeclinic.staff.assign_access"],
      roleAssignments: [
        {
          roleKey: FACILITY_ADMIN,
          scopeType: "facility",
          facilityId: tenant.facilityAId,
        },
      ],
    };
    // Facility admin typically cannot grant org admin; assert self org-admin blocked when assign_access present.
    const orgAdminActor = await seedUser(tenant, ORGANIZATION_ADMIN, {
      scopeType: "organisation",
    });
    const selfGrant = await canGrantRole(pool, {
      auth: {
        organization: { id: tenant.orgId },
        staffMember: { id: orgAdminActor.staffMemberId },
        permissions: [
          "activeclinic.staff.assign_access",
          "activeclinic.organization.manage",
        ],
        roleAssignments: [
          {
            roleKey: ORGANIZATION_ADMIN,
            scopeType: "organisation",
            facilityId: null,
          },
        ],
      },
      roleKey: ORGANIZATION_ADMIN,
      scopeType: "organisation",
      targetStaffMemberId: orgAdminActor.staffMemberId,
    });
    assert.equal(selfGrant.ok, false);
    assert.equal(selfGrant.code, ACCESS_RESULT.SELF_ESCALATION);

    const grantOthers = await canGrantRole(pool, {
      auth: {
        organization: { id: tenant.orgId },
        staffMember: { id: orgAdminActor.staffMemberId },
        permissions: [
          "activeclinic.staff.assign_access",
          "activeclinic.organization.manage",
        ],
        roleAssignments: [
          {
            roleKey: ORGANIZATION_ADMIN,
            scopeType: "organisation",
            facilityId: null,
          },
        ],
      },
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: tenant.facilityAId,
      targetStaffMemberId: facilityAdmin.staffMemberId,
    });
    assert.equal(grantOthers.ok, true);
  });
});
