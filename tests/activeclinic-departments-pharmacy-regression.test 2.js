"use strict";

/**
 * ActiveClinic V6 — departments config + pharmacy empty-state / RBAC regression.
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
  CLINIC_MANAGER,
  RECEPTIONIST,
  PHARMACIST,
  NETWORK_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
  createDepartment,
  updateDepartment,
  listDepartments,
  RESULT: DEPT_RESULT,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  buildActiveClinicNavigation,
} = require("../src/activeclinic/services/activeClinicNavigation");
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

const PASSWORD = "activeclinic-dept-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 970000000;

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

async function seedTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Clinic",
    publicName: "Public Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${keyPrefix}`.slice(0, 64),
    displayName: "Main Clinic",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(tenant, roleKey, label) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
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
    firstName: label || "Staff",
    lastName: "User",
    employmentType: "permanent",
    status: "active",
    phone,
    personalEmail: `${label || "staff"}_${Date.now()}@example.com`,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true);
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
  });
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: roleKey === NETWORK_ADMIN ? "organisation" : "facility",
    facilityId: roleKey === NETWORK_ADMIN ? null : tenant.facilityId,
  });
  return {
    identityId: identity.identity.id,
    staffId: staff.staffMember.id,
    phone,
  };
}

async function makeSessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic departments + pharmacy regression", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
      console.error("[departments-pharmacy-regression] setup skip:", skipReason);
    }
  });

  after(async () => {
    if (pool) await pool.end().catch(() => {});
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("1. clinic manager can open department settings", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "dept_mgr");
    const staff = await seedStaff(tenant, CLINIC_MANAGER, "mgr");
    await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
    });
    const cookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);
    const res = await request(app)
      .get("/app/settings/clinic-setup/departments")
      .set("Cookie", cookie)
      .expect(200);
    assert.match(res.text, /Clinic departments|Departments/i);
    assert.match(res.text, /Pharmacy/i);
  });

  it("2. clinic manager can configure an allowed department", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "dept_add");
    const staff = await seedStaff(tenant, CLINIC_MANAGER, "mgradd");
    const created = await createDepartment(pool, {
      staffId: staff.staffId,
      organizationId: tenant.orgId,
      facilityId: tenant.facilityId,
      departmentType: "pharmacy",
      displayName: "Emergency Pharmacy",
      departmentKey: "emergency_pharmacy",
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.department.departmentType, "pharmacy");
  });

  it("3. unauthorized staff cannot manage departments", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "dept_deny");
    const staff = await seedStaff(tenant, RECEPTIONIST, "recv");
    const listed = await listDepartments(pool, {
      staffId: staff.staffId,
      organizationId: tenant.orgId,
    });
    assert.equal(listed.ok, false);
    assert.equal(listed.result, DEPT_RESULT.ACCESS_DENIED);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
    });
    const cookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);
    await request(app)
      .get("/app/settings/clinic-setup/departments")
      .set("Cookie", cookie)
      .expect(403);
  });

  it("4. cross-organization department modification is rejected", async () => {
    requireDb();
    const stamp = Date.now();
    const a = await seedTenant(stamp, "dept_a");
    const b = await seedTenant(stamp + 1, "dept_b");
    const mgrA = await seedStaff(a, CLINIC_MANAGER, "mA");
    const mgrB = await seedStaff(b, CLINIC_MANAGER, "mB");
    const created = await createDepartment(pool, {
      staffId: mgrA.staffId,
      organizationId: a.orgId,
      facilityId: a.facilityId,
      departmentType: "pharmacy",
      displayName: "Pharmacy A",
      departmentKey: "pharmacy",
    });
    assert.equal(created.ok, true);
    const cross = await updateDepartment(pool, {
      staffId: mgrB.staffId,
      organizationId: b.orgId,
      departmentId: created.department.id,
      status: "inactive",
    });
    assert.equal(cross.ok, false);
    assert.equal(cross.result, DEPT_RESULT.NOT_FOUND);
  });

  it("5+6. pharmacy returns 200 when configured (empty inventory)", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "pharm_ok");
    const staff = await seedStaff(tenant, PHARMACIST, "pharm");
    await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
    });
    const cookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);
    const res = await request(app)
      .get("/app/pharmacy")
      .set("Cookie", cookie)
      .expect(200);
    assert.match(res.text, /Pharmacy/i);
    assert.doesNotMatch(res.text, /Something went wrong/i);
  });

  it("7. pharmacy direct route still enforces permission when sidebar hidden", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "pharm_noperm");
    const staff = await seedStaff(tenant, RECEPTIONIST, "recv2");
    await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
    });
    const cookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);
    await request(app).get("/app/pharmacy").set("Cookie", cookie).expect(403);
  });

  it("8+9+10. disable pharmacy hides nav, keeps data, re-enable restores", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "pharm_toggle");
    const staff = await seedStaff(tenant, NETWORK_ADMIN, "net");
    await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    });
    // seed a catalogue row as historical data
    await pool.query(
      `INSERT INTO activeclinic.medication_catalogue_items (
         organization_id, healthcare_organization_id, generic_name, strength, dosage_form, unit_of_measure, status
       ) VALUES ($1,$2,'Paracetamol','500mg','tablet','tablet','active')`,
      [tenant.orgId, tenant.hcoId]
    );

    const pharm = await pool.query(
      `SELECT id FROM activeclinic.departments
        WHERE facility_id=$1 AND department_type='pharmacy' LIMIT 1`,
      [tenant.facilityId]
    );
    const deptId = pharm.rows[0].id;

    const deactivated = await updateDepartment(pool, {
      staffId: staff.staffId,
      organizationId: tenant.orgId,
      departmentId: deptId,
      status: "inactive",
    });
    assert.equal(deactivated.ok, true);

    const navOff = buildActiveClinicNavigation(
      ["activeclinic.access", "activeclinic.pharmacy.view"],
      "home",
      { activeDepartmentTypes: new Set(["reception", "opd"]) }
    );
    assert.equal(
      navOff.items.some((i) => i.key === "pharmacy"),
      false
    );

    const medCount = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.medication_catalogue_items WHERE organization_id=$1`,
      [tenant.orgId]
    );
    assert.equal(medCount.rows[0].n, 1);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
    });
    const cookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);
    const blocked = await request(app)
      .get("/app/pharmacy")
      .set("Cookie", cookie)
      .expect(403);
    assert.match(blocked.text, /department|not available/i);

    const reactivated = await updateDepartment(pool, {
      staffId: staff.staffId,
      organizationId: tenant.orgId,
      departmentId: deptId,
      status: "active",
    });
    assert.equal(reactivated.ok, true);

    const medCount2 = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.medication_catalogue_items WHERE organization_id=$1`,
      [tenant.orgId]
    );
    assert.equal(medCount2.rows[0].n, 1);

    await request(app).get("/app/pharmacy").set("Cookie", cookie).expect(200);
  });

  it("11. department seeds are idempotent", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "dept_seed");
    const a = await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    });
    const b = await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    });
    assert.equal(a.created, 8);
    assert.equal(b.created, 0);
    assert.equal(b.unchanged, 8);
    const count = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.departments WHERE facility_id=$1`,
      [tenant.facilityId]
    );
    assert.equal(count.rows[0].n, 8);
  });

  it("13. pharmacy permissions remain enforced (pharmacist vs receptionist)", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "pharm_rbac");
    await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    });
    const pharm = await seedStaff(tenant, PHARMACIST, "ph");
    const recv = await seedStaff(tenant, RECEPTIONIST, "rc");
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
    });
    const pharmCookie = await makeSessionCookie(pharm.identityId, tenant.orgId, tenant.facilityId);
    const recvCookie = await makeSessionCookie(recv.identityId, tenant.orgId, tenant.facilityId);
    await request(app).get("/app/pharmacy").set("Cookie", pharmCookie).expect(200);
    await request(app).get("/app/pharmacy").set("Cookie", recvCookie).expect(403);
  });

  it("14. facility-scoped staff cannot manage another facility department", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "dept_fac");
    const otherFac = await createFacility(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityKey: `other-${stamp}`.slice(0, 64),
      displayName: "Other Clinic",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
    });
    assert.equal(otherFac.ok, true);
    await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: otherFac.facility.id,
    });
    // facility admin scoped only to main facility
    const phone = nextPhone();
    const identity = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PASSWORD,
    });
    const staff = await createStaffMember(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      firstName: "Fac",
      lastName: "Admin",
      employmentType: "permanent",
      status: "active",
      phone,
      personalEmail: `fac_${stamp}@example.com`,
    });
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: tenant.facilityId,
    });
    await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: "activeclinic_facility_admin",
      scopeType: "facility",
      facilityId: tenant.facilityId,
    });

    const otherDept = await pool.query(
      `SELECT id FROM activeclinic.departments WHERE facility_id=$1 AND department_type='pharmacy'`,
      [otherFac.facility.id]
    );
    const result = await updateDepartment(pool, {
      staffId: staff.staffMember.id,
      organizationId: tenant.orgId,
      departmentId: otherDept.rows[0].id,
      status: "inactive",
    });
    // Facility-scoped admin without assignment/scope on other facility should be denied
    assert.equal(result.ok, false);
    assert.equal(result.result, DEPT_RESULT.ACCESS_DENIED);
  });

  it("15. lab/radiology department split remains distinct", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedTenant(stamp, "diag_split");
    await ensureDefaultDepartments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
    });
    const labDept = await pool.query(
      `SELECT id FROM activeclinic.departments WHERE facility_id=$1 AND department_type='laboratory'`,
      [tenant.facilityId]
    );
    const staff = await seedStaff(tenant, NETWORK_ADMIN, "diag");
    await updateDepartment(pool, {
      staffId: staff.staffId,
      organizationId: tenant.orgId,
      departmentId: labDept.rows[0].id,
      status: "inactive",
    });
    const nav = buildActiveClinicNavigation(
      [
        "activeclinic.access",
        "activeclinic.lab.view",
        "activeclinic.radiology.view",
      ],
      "home",
      { activeDepartmentTypes: new Set(["radiology", "pharmacy", "reception"]) }
    );
    // diagnostics nav requires laboratory OR radiology department
    assert.equal(nav.items.some((i) => i.key === "diagnostics"), true);
    const navNoDiag = buildActiveClinicNavigation(
      ["activeclinic.access", "activeclinic.lab.view", "activeclinic.radiology.view"],
      "home",
      { activeDepartmentTypes: new Set(["pharmacy", "reception"]) }
    );
    assert.equal(navNoDiag.items.some((i) => i.key === "diagnostics"), false);
  });
});
