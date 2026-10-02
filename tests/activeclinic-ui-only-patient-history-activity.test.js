"use strict";

/**
 * ActiveClinic UI_ONLY batch — ACN-P02 clinical history + ACN-P04 patient activity.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

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
  RECEPTIONIST,
  CLINICIAN,
  NETWORK_ADMIN,
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  startEncounter,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

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
let phoneSeq = 920000000;

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
  const orgWide =
    opts.roleKey === NETWORK_ADMIN || opts.scopeType === "organisation";
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType: orgWide ? "organisation" : "facility",
    facilityId: orgWide ? null : facilityIds[0],
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

describe("ActiveClinic UI_ONLY ACN-P02 clinical history + ACN-P04 activity", () => {
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

  it("views and 390px CSS exist for clinical history and activity", () => {
    const historyView = path.join(
      __dirname,
      "../views/activeclinic/app/patient-clinical-history-content.ejs"
    );
    const activityView = path.join(
      __dirname,
      "../views/activeclinic/app/patient-activity-content.ejs"
    );
    const cssPath = path.join(__dirname, "../public/activeclinic/ac-app.css");
    assert.ok(fs.existsSync(historyView));
    assert.ok(fs.existsSync(activityView));
    const historySrc = fs.readFileSync(historyView, "utf8");
    const activitySrc = fs.readFileSync(activityView, "utf8");
    const css = fs.readFileSync(cssPath, "utf8");
    assert.match(historySrc, /data-ac-page-section="patient-clinical-history"/);
    assert.match(historySrc, /data-ac-stitch="ACN-P02"/);
    assert.match(activitySrc, /data-ac-page-section="patient-activity"/);
    assert.match(activitySrc, /data-ac-stitch="ACN-P04"/);
    assert.match(css, /ac-patient-clinical-history/);
    assert.match(css, /ac-patient-activity/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*ac-patient-clinical-history/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*ac-patient-activity/);
  });

  it("clinician sees real encounter history; empty and unauthorized states work", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedAcTenant(stamp, "uio2");
    const receptionist = await seedStaff(tenant, {
      roleKey: RECEPTIONIST,
      firstName: "Rec",
      lastName: "Reg",
    });
    const clinician = await seedStaff(tenant, {
      roleKey: CLINICIAN,
      firstName: "Doc",
      lastName: "History",
    });
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor: {
        staffMemberId: receptionist.staff.id,
        organizationId: tenant.orgId,
        platformIdentityId: receptionist.identity.id,
      },
      demographics: {
        firstName: "History",
        lastName: "Patient",
        dateOfBirth: "1990-03-03",
        sexAtRegistration: "female",
        phone: nextPhone(),
      },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));
    const number = patient.patient.patientNumber;

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const { cookie: clinCookie } = await sessionCookie(
      clinician.identity.id,
      tenant.orgId
    );
    const { cookie: recCookie } = await sessionCookie(
      receptionist.identity.id,
      tenant.orgId
    );

    const empty = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}/clinical-history`)
      .set("Cookie", clinCookie);
    assert.equal(empty.status, 200, empty.text.slice(0, 500));
    assert.match(empty.text, /data-ac-page-section="patient-clinical-history"/);
    assert.match(empty.text, /data-ac-empty="patient-clinical-history-empty"/);
    assert.match(empty.text, /History Patient/);
    assert.match(empty.text, new RegExp(number));
    assert.doesNotMatch(empty.text, /consultation note body|SOAP|diagnosis text/i);

    const started = await startEncounter(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      actor: {
        staffMemberId: clinician.staff.id,
        platformIdentityId: clinician.identity.id,
      },
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    const filled = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}/clinical-history`)
      .set("Cookie", clinCookie);
    assert.equal(filled.status, 200, filled.text.slice(0, 500));
    assert.match(filled.text, /data-ac-history-encounter=/);
    assert.match(
      filled.text,
      new RegExp(started.encounter.encounterNumber || started.encounter.id)
    );
    assert.match(filled.text, /data-ac-history-mobile="1"/);
    assert.doesNotMatch(filled.text, /note body|SOAP assessment/i);

    const profile = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}`)
      .set("Cookie", clinCookie);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /data-ac-clinical-history-link="1"/);

    const denied = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}/clinical-history`)
      .set("Cookie", recCookie);
    assert.equal(denied.status, 403);
    assert.match(denied.text, /Access Restricted|permission/i);
    assert.doesNotMatch(denied.text, /History Patient/);
    assert.doesNotMatch(denied.text, new RegExp(number));
  });

  it("network admin sees patient activity from real audits; facility admin denied", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedAcTenant(stamp, "uio4");
    const admin = await seedStaff(tenant, {
      roleKey: NETWORK_ADMIN,
      firstName: "Net",
      lastName: "Admin",
      scopeType: "organisation",
    });
    const facilityAdmin = await seedStaff(tenant, {
      roleKey: FACILITY_ADMIN,
      firstName: "Fac",
      lastName: "Admin",
    });
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor: {
        staffMemberId: admin.staff.id,
        organizationId: tenant.orgId,
        platformIdentityId: admin.identity.id,
      },
      demographics: {
        firstName: "Audit",
        lastName: "Subject",
        dateOfBirth: "1985-07-07",
        sexAtRegistration: "male",
        phone: nextPhone(),
      },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));
    const number = patient.patient.patientNumber;

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const { cookie: adminCookie } = await sessionCookie(
      admin.identity.id,
      tenant.orgId
    );
    const { cookie: facCookie } = await sessionCookie(
      facilityAdmin.identity.id,
      tenant.orgId
    );

    const activity = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}/activity`)
      .set("Cookie", adminCookie);
    assert.equal(activity.status, 200, activity.text.slice(0, 500));
    assert.match(activity.text, /data-ac-page-section="patient-activity"/);
    assert.match(activity.text, /data-ac-stitch="ACN-P04"/);
    assert.match(activity.text, /Audit Subject/);
    assert.match(activity.text, /activeclinic\.patient\.create/);
    assert.match(activity.text, /data-ac-activity-mobile="1"/);
    assert.doesNotMatch(activity.text, /WORM|blockchain|SHA-256 chain/i);

    const profile = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}`)
      .set("Cookie", adminCookie);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /data-ac-patient-activity-link="1"/);

    const denied = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}/activity`)
      .set("Cookie", facCookie);
    assert.equal(denied.status, 403);
    assert.match(denied.text, /Access Restricted|permission/i);
    assert.doesNotMatch(denied.text, /Audit Subject/);
    assert.doesNotMatch(denied.text, new RegExp(number));
  });

  it("rejects unauthenticated and cross-tenant history/activity access", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenantA = await seedAcTenant(stamp, "uioxa");
    const tenantB = await seedAcTenant(`${stamp}b`, "uioxb");
    const staffA = await seedStaff(tenantA, {
      roleKey: CLINICIAN,
      firstName: "A",
      lastName: "Clin",
    });
    const adminA = await seedStaff(tenantA, {
      roleKey: NETWORK_ADMIN,
      firstName: "A",
      lastName: "Admin",
      scopeType: "organisation",
    });
    const staffB = await seedStaff(tenantB, {
      roleKey: CLINICIAN,
      firstName: "B",
      lastName: "Clin",
    });
    const adminB = await seedStaff(tenantB, {
      roleKey: NETWORK_ADMIN,
      firstName: "B",
      lastName: "Admin",
      scopeType: "organisation",
    });
    const patientA = await registerActiveClinicPatient(pool, {
      organizationId: tenantA.orgId,
      healthcareOrganizationId: tenantA.hcoId,
      facilityId: tenantA.facilityId,
      actor: { staffMemberId: adminA.staff.id, platformIdentityId: adminA.identity.id },
      demographics: {
        firstName: "Tenant",
        lastName: "Alpha",
        dateOfBirth: "1991-01-01",
        phone: nextPhone(),
      },
      registrationMethod: "walk_in",
    });
    assert.equal(patientA.ok, true, JSON.stringify(patientA));
    const number = patientA.patient.patientNumber;

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });

    for (const leaf of ["clinical-history", "activity"]) {
      const anon = await request(app).get(
        `/app/patients/${encodeURIComponent(number)}/${leaf}`
      );
      assert.ok(
        [302, 303, 401, 403].includes(anon.status),
        `${leaf} anon=${anon.status}`
      );
    }

    const { cookie: clinB } = await sessionCookie(staffB.identity.id, tenantB.orgId);
    const { cookie: adminCookieB } = await sessionCookie(
      adminB.identity.id,
      tenantB.orgId
    );

    const crossHist = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}/clinical-history`)
      .set("Cookie", clinB);
    assert.equal(crossHist.status, 404);
    assert.doesNotMatch(crossHist.text, /Tenant Alpha/);
    assert.doesNotMatch(crossHist.text, new RegExp(number));

    const crossAct = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}/activity`)
      .set("Cookie", adminCookieB);
    assert.equal(crossAct.status, 404);
    assert.doesNotMatch(crossAct.text, /Tenant Alpha/);
    assert.doesNotMatch(crossAct.text, new RegExp(number));

    // Same-tenant clinician control path remains authorized for history.
    const { cookie: clinA } = await sessionCookie(staffA.identity.id, tenantA.orgId);
    const ok = await request(app)
      .get(`/app/patients/${encodeURIComponent(number)}/clinical-history`)
      .set("Cookie", clinA);
    assert.equal(ok.status, 200);
    assert.match(ok.text, /Tenant Alpha/);
  });
});
