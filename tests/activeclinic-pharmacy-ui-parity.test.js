"use strict";

/**
 * ActiveClinic P05 — pharmacy Stitch UI parity.
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
  PHARMACIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
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

const PASSWORD = "activeclinic-pharm-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 980000000;

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
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(tenant) {
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
    firstName: "Pharm",
    lastName: "Staff",
    employmentType: "permanent",
    status: "active",
    phone,
    personalEmail: `pharmstaff_${Date.now()}@example.com`,
    staffRole: "pharmacist",
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
    roleKey: PHARMACIST,
    scopeType: "facility",
    facilityId: tenant.facilityId,
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

describe("ActiveClinic P05 Pharmacy UI Parity", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) {
      await pool.end().catch(() => {});
    }
  });

  function requireDb() {
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("should require pharmacy.view permission to access pharmacy dashboard", async () => {
    requireDb();
    const stamp = Date.now();
    const tenant = await seedAcTenant(stamp, "pharm_auth");
    
    const phone = nextPhone();
    const identity = await createPlatformIdentity(pool, {
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, { identityId: identity.identity.id, password: PASSWORD });
    
    const staff = await createStaffMember(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      firstName: "No",
      lastName: "Perm",
      employmentType: "permanent",
      status: "active",
      phone,
      personalEmail: `noperm_${stamp}@example.com`,
      staffRole: "receptionist",
      platformIdentityId: identity.identity.id,
    });
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: tenant.facilityId,
    });

    const env = { ...MINIMAL_AC, DATABASE_URL: databaseUrl };
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env });
    const sessionCookie = await makeSessionCookie(identity.identity.id, tenant.orgId, tenant.facilityId);

    await request(app)
      .get("/app/pharmacy")
      .set("Cookie", sessionCookie)
      .expect(403);
  });

  it("should load pharmacy dashboard with permission", async () => {
    const stamp = Date.now();
    const tenant = await seedAcTenant(stamp, "pharm_dash");
    const staff = await seedStaff(tenant);

    const env = { ...MINIMAL_AC, DATABASE_URL: databaseUrl };
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env });
    const sessionCookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);

    const res = await request(app)
      .get("/app/pharmacy")
      .set("Cookie", sessionCookie)
      .expect(200);

    assert.match(res.text, /Pharmacy/i);
    assert.match(res.text, /data-ac-stitch-desktop/i);
  });

  it("should reject add medicine without CSRF token", async () => {
    const stamp = Date.now();
    const tenant = await seedAcTenant(stamp, "pharm_csrf");
    const staff = await seedStaff(tenant);

    const env = { ...MINIMAL_AC, DATABASE_URL: databaseUrl };
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env });
    const sessionCookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);

    await request(app)
      .post("/app/pharmacy/catalogue/new")
      .set("Cookie", sessionCookie)
      .type("form")
      .send({
        genericName: "Paracetamol",
        strength: "500mg",
        dosageForm: "tablet",
        unitOfMeasure: "tablet",
      })
      .expect(403);
  });

  it("should add medicine to catalogue with valid CSRF", async () => {
    const stamp = Date.now();
    const tenant = await seedAcTenant(stamp, "pharm_add");
    const staff = await seedStaff(tenant);

    const env = { ...MINIMAL_AC, DATABASE_URL: databaseUrl };
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env });
    const sessionCookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);

    const csrfToken = issueCsrfToken(env);
    const csrfCookieValue = `${csrfToken}`;

    const res = await request(app)
      .post("/app/pharmacy/catalogue/new")
      .set("Cookie", `${sessionCookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookieValue}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        genericName: "Paracetamol",
        strength: "500mg",
        dosageForm: "tablet",
        unitOfMeasure: "tablet",
        standardCost: "0.5",
      })
      .expect(303);

    assert.match(res.headers.location, /\/app\/pharmacy\/catalogue\//);
  });

  it("should receive stock with valid CSRF", async () => {
    const stamp = Date.now();
    const tenant = await seedAcTenant(stamp, "pharm_recv");
    const staff = await seedStaff(tenant);

    const env = { ...MINIMAL_AC, DATABASE_URL: databaseUrl };
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env });
    const sessionCookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);

    const csrfToken = issueCsrfToken(env);
    const csrfCookieValue = `${csrfToken}`;

    const addRes = await request(app)
      .post("/app/pharmacy/catalogue/new")
      .set("Cookie", `${sessionCookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookieValue}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken,
        genericName: "Ibuprofen",
        strength: "400mg",
        dosageForm: "tablet",
        unitOfMeasure: "tablet",
      })
      .expect(303);

    const medicationId = addRes.headers.location.split("/").pop();

    const csrfToken2 = issueCsrfToken(env);
    const res = await request(app)
      .post("/app/pharmacy/inventory/receive")
      .set("Cookie", `${sessionCookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfToken2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrfToken2,
        medicationCatalogueItemId: medicationId,
        batchNumber: "BATCH001",
        quantity: "100",
        expiryDate: "2027-12-31",
        supplierName: "MedSupply",
      })
      .expect(303);

    assert.match(res.headers.location, /\/app\/pharmacy\/inventory/);
  });

  it("should list inventory items", async () => {
    const stamp = Date.now();
    const tenant = await seedAcTenant(stamp, "pharm_inv");
    const staff = await seedStaff(tenant);

    const env = { ...MINIMAL_AC, DATABASE_URL: databaseUrl };
    const app = createActiveClinicFoundationApp({ getPool: () => pool, env });
    const sessionCookie = await makeSessionCookie(staff.identityId, tenant.orgId, tenant.facilityId);

    const res = await request(app)
      .get("/app/pharmacy/inventory")
      .set("Cookie", sessionCookie)
      .expect(200);

    assert.match(res.text, /Inventory/i);
    assert.match(res.text, /data-ac-stitch-desktop/i);
  });
});
