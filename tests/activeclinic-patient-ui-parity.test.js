"use strict";

/**
 * ActiveClinic V6 — patient registration / search / profile UI (AC-V6-C02).
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
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
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
let phoneSeq = 840000000;

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
    legalName: "Legal Hospital",
    publicName: "Public Hospital",
    organizationType: "faith_based_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${keyPrefix}`.slice(0, 64),
    displayName: "Main Hospital",
    facilityType: "hospital",
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

async function seedStaff(tenant, opts) {
  const phone = opts.phone || nextPhone();
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
    firstName: opts.firstName || "Staff",
    lastName: opts.lastName || "User",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  const facilityIds = opts.facilityIds || [tenant.facilityId];
  for (const facilityId of facilityIds) {
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId,
      isPrimary: facilityId === facilityIds[0],
    });
  }
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType:
      opts.scopeType ||
      (opts.roleKey === NETWORK_ADMIN ? "organisation" : "facility"),
    facilityId:
      opts.roleKey === NETWORK_ADMIN
        ? null
        : facilityIds[0],
  });
  return { identity: identity.identity, staff: staff.staffMember };
}

async function sessionCookie(identityId, organizationId) {
  const session = await createPlatformIdentitySession(pool, {
    platformIdentityId: identityId,
    organizationId,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return {
    cookie: `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`,
    session,
  };
}

function withCsrf(cookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
    csrf,
  };
}

describe("ActiveClinic patient UI parity (AC-V6-C02)", () => {
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
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("lists and registers patients with minimized search results", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedAcTenant(stamp, "c02a");
    const admin = await seedStaff(tenant, {
      firstName: "Net",
      lastName: "Admin",
      roleKey: NETWORK_ADMIN,
      facilityIds: [tenant.facilityId],
    });
    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const { cookie } = await sessionCookie(admin.identity.id, tenant.orgId);

    const list = await request(app).get("/app/patients").set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-page-section="patient-list"/);
    assert.match(list.text, /data-ac-stitch-desktop=/);
    assert.match(list.text, /Register patient/);
    assert.doesNotMatch(list.text, /diagnosis|prescription|laboratory/i);

    const post = withCsrf(cookie);
    const created = await request(app)
      .post("/app/patients")
      .set("Cookie", post.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: post.csrf,
        step: "confirm",
        first_name: "Ada",
        last_name: "Lovelace",
        date_of_birth: "1990-01-02",
        phone: nextPhone(),
        facility_id: tenant.facilityId,
        registration_method: "walk_in",
      });
    assert.equal(created.status, 200, created.text.slice(0, 500));
    assert.match(created.text, /data-ac-page-section="patient-success"/);
    assert.match(created.text, /data-ac-patient-number="1"/);
    assert.match(created.text, /AC-\d{4}-\d{6}/);
    assert.match(created.text, /No clinical encounter was created/);

    const number = (created.text.match(/AC-\d{4}-\d{6}/) || [])[0];
    assert.ok(number);

    const profile = await request(app)
      .get(`/app/patients/${number}`)
      .set("Cookie", cookie);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /data-ac-page-section="patient-profile"/);
    assert.match(profile.text, /data-ac-clinical-absent="1"/);
    assert.doesNotMatch(profile.text, /Encounter notes|Prescriptions|Lab results/i);

    const search = await request(app)
      .get("/app/patients?q=lov")
      .set("Cookie", cookie);
    assert.equal(search.status, 200);
    assert.match(search.text, /Ada Lovelace|Lovelace/);
    assert.doesNotMatch(search.text, /\+2609\d{8}/);
  });

  it("shows duplicate warning and requires override", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}d`;
    const tenant = await seedAcTenant(stamp, "c02d");
    const admin = await seedStaff(tenant, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [tenant.facilityId],
    });
    const actor = {
      staffMemberId: admin.staff.id,
      organizationId: tenant.orgId,
    };
    const first = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: {
        firstName: "Dup",
        lastName: "Warn",
        dateOfBirth: "1988-03-04",
      },
      registrationMethod: "walk_in",
    });
    assert.equal(first.ok, true);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const { cookie } = await sessionCookie(admin.identity.id, tenant.orgId);
    const warnCsrf = withCsrf(cookie);
    const warned = await request(app)
      .post("/app/patients")
      .set("Cookie", warnCsrf.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: warnCsrf.csrf,
        step: "confirm",
        first_name: "Dup",
        last_name: "Warn",
        date_of_birth: "1988-03-04",
        facility_id: tenant.facilityId,
        registration_method: "walk_in",
      });
    assert.equal(warned.status, 200);
    assert.match(warned.text, /data-ac-duplicate-warning="1"/);
    assert.match(warned.text, /Possible duplicate/);
    assert.doesNotMatch(warned.text, /data-ac-page-section="patient-success"/);

    const overrideCsrf = withCsrf(cookie);
    const override = await request(app)
      .post("/app/patients")
      .set("Cookie", overrideCsrf.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: overrideCsrf.csrf,
        step: "confirm",
        first_name: "Dup",
        last_name: "Warn",
        date_of_birth: "1988-03-04",
        facility_id: tenant.facilityId,
        registration_method: "walk_in",
        duplicate_override: "1",
        duplicate_override_reason: "confirmed_distinct",
      });
    assert.equal(override.status, 200);
    assert.match(override.text, /data-ac-page-section="patient-success"/);
  });

  it("enforces facility scope, CSRF, and denies ordinary staff", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}s`;
    const tenant = await seedAcTenant(stamp, "c02s");
    const facilityB = await createFacility(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityKey: "site-b",
      displayName: "Site B",
      facilityType: "clinic",
      status: "active",
      isPrimary: false,
      countryCode: "ZM",
      timezone: "Africa/Lusaka",
      phone: nextPhone(),
    });
    assert.equal(facilityB.ok, true);

    const network = await seedStaff(tenant, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [tenant.facilityId, facilityB.facility.id],
    });
    const facAdmin = await seedStaff(tenant, {
      firstName: "Fac",
      lastName: "Only",
      roleKey: FACILITY_ADMIN,
      facilityIds: [tenant.facilityId],
      scopeType: "facility",
    });
    const plain = await seedStaff(tenant, {
      firstName: "Plain",
      lastName: "Staff",
      roleKey: STAFF_ROLE,
      facilityIds: [tenant.facilityId],
      scopeType: "organisation",
    });

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    const denied = await sessionCookie(plain.identity.id, tenant.orgId);
    const staffList = await request(app)
      .get("/app/patients")
      .set("Cookie", denied.cookie);
    assert.equal(staffList.status, 403);

    const net = await sessionCookie(network.identity.id, tenant.orgId);
    const atB = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: facilityB.facility.id,
      actor: { staffMemberId: network.staff.id, organizationId: tenant.orgId },
      demographics: { firstName: "Site", lastName: "Bee" },
      registrationMethod: "walk_in",
    });
    assert.equal(atB.ok, true);

    const fac = await sessionCookie(facAdmin.identity.id, tenant.orgId);
    const hidden = await request(app)
      .get(`/app/patients/${atB.patient.patientNumber}`)
      .set("Cookie", fac.cookie);
    assert.equal(hidden.status, 404);

    const noCsrf = await request(app)
      .post("/app/patients")
      .set("Cookie", net.cookie)
      .type("form")
      .send({
        step: "confirm",
        first_name: "No",
        last_name: "Csrf",
        facility_id: tenant.facilityId,
        registration_method: "walk_in",
      });
    assert.equal(noCsrf.status, 403);
  });

  it("edits demographics and keeps patient number immutable in UI flow", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}e`;
    const tenant = await seedAcTenant(stamp, "c02e");
    const admin = await seedStaff(tenant, {
      roleKey: NETWORK_ADMIN,
      facilityIds: [tenant.facilityId],
    });
    const created = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor: { staffMemberId: admin.staff.id, organizationId: tenant.orgId },
      demographics: { firstName: "Edit", lastName: "Me" },
      registrationMethod: "walk_in",
    });
    assert.equal(created.ok, true);
    const number = created.patient.patientNumber;

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const { cookie } = await sessionCookie(admin.identity.id, tenant.orgId);
    const editPage = await request(app)
      .get(`/app/patients/${number}/edit`)
      .set("Cookie", cookie);
    assert.equal(editPage.status, 200);
    assert.match(editPage.text, /data-ac-page-section="patient-edit"/);

    const save = withCsrf(cookie);
    const saved = await request(app)
      .post(`/app/patients/${number}`)
      .set("Cookie", save.cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: save.csrf,
        first_name: "Edited",
        last_name: "Me",
        phone: nextPhone(),
      });
    assert.ok([302, 303].includes(saved.status), `status=${saved.status}`);
    assert.match(saved.headers.location || "", new RegExp(number));

    const profile = await request(app)
      .get(`/app/patients/${number}`)
      .set("Cookie", cookie);
    assert.match(profile.text, /Edited Me/);
    assert.match(profile.text, new RegExp(number));
  });
});
