"use strict";

/**
 * V2.03 Batch 3 — ACN17 vitals + ACN19 prescription leaf UI.
 * Reuses existing clinical routes/services; does not alter B2-06 encounter shell.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
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
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  CLINICIAN,
  RECEPTIONIST,
  NURSE,
  CASHIER,
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
const ROOT = path.join(__dirname, "..");
const VIEWS = path.join(ROOT, "views", "activeclinic", "app");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 980100000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `B3 ${label}`,
    productKey: "activeclinic",
    productTenantKey: stamp,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: `${label} Legal`,
    publicName: `${label} Clinic`,
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`,
    displayName: "HQ",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
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
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    firstName: "Staff",
    lastName: label,
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  for (const roleKey of roleKeys) {
    const role = await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId: facility.facility.id,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return {
    organizationId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
    staffId: staff.staffMember.id,
    identityId: identity.identity.id,
    actor: {
      staffMemberId: staff.staffMember.id,
      platformIdentityId: identity.identity.id,
    },
  };
}

async function sessionCookie(identityId, orgId) {
  const session = await createPlatformIdentitySession(pool, {
    platformIdentityId: identityId,
    organizationId: orgId,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(session.ok, true);
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function withCsrf(cookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
    csrf,
  };
}

async function selectFacility(app, cookie, facilityId) {
  const { cookie: selectCookie, csrf } = withCsrf(cookie);
  const res = await request(app)
    .post("/app/select-facility")
    .set("Cookie", selectCookie)
    .type("form")
    .send({ [CSRF_FIELD]: csrf, facility_id: facilityId });
  assert.equal(res.status, 303);
}

describe("V2.03 Batch 3 ACN17/ACN19 clinical leaves", () => {
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

  it("leaf views carry Batch 3 Stitch markers and responsive hooks", () => {
    const vitals = fs.readFileSync(path.join(VIEWS, "vital-signs-entry-content.ejs"), "utf8");
    assert.match(vitals, /data-ac-batch3="ACN17"/);
    assert.match(vitals, /e4dc47dcc41a411184e987308aedc943/);
    assert.match(vitals, /c8552b6186d4428283b31d7b875005d6/);
    assert.match(vitals, /ac-clinical-leaf/);
    assert.match(vitals, /data-ac-vitals-mobile/);
    assert.match(vitals, /data-ac-vitals-desktop/);

    const rx = fs.readFileSync(path.join(VIEWS, "create-prescription-content.ejs"), "utf8");
    assert.match(rx, /data-ac-batch3="ACN19"/);
    assert.match(rx, /47c5eb28d5e1482e9dd0c2f2cbee7b59/);
    assert.match(rx, /5e5048f347414e53af6e8a86aa83fba7/);
    assert.match(rx, /ac-clinical-leaf/);
    assert.match(rx, /data-ac-rx-form/);
    assert.match(rx, /No drug-interaction checking/);

    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-app.css"), "utf8");
    assert.match(css, /\.ac-clinical-leaf/);
    assert.match(css, /@media \(max-width:\s*390px\)[\s\S]*\.ac-clinical-leaf__banner/);
    assert.doesNotMatch(
      fs.readFileSync(path.join(VIEWS, "consultation-workspace-content.ejs"), "utf8"),
      /data-ac-batch3="ACN17"/
    );
  });

  it("ACN17/ACN19 routes render for clinical roles and deny cashier", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const clinical = await provisionClinic("clinical", [RECEPTIONIST, NURSE, CLINICIAN]);

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinical.organizationId,
      healthcareOrganizationId: clinical.hcoId,
      facilityId: clinical.facilityId,
      actor: clinical.actor,
      demographics: { firstName: "Leaf", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const started = await startEncounter(pool, {
      organizationId: clinical.organizationId,
      healthcareOrganizationId: clinical.hcoId,
      facilityId: clinical.facilityId,
      patientId: patient.patient.id,
      actor: clinical.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));
    const encounterId = started.encounter.id;

    // Cashier in the same org/facility — should be denied leaf clinical routes.
    const denyPhone = nextPhone();
    const denyIdentity = await createPlatformIdentity(pool, {
      primaryPhone: denyPhone,
      phoneNormalized: denyPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: denyIdentity.identity.id,
      password: PASSWORD,
    });
    const denyStaff = await createStaffMember(pool, {
      organizationId: clinical.organizationId,
      healthcareOrganizationId: clinical.hcoId,
      firstName: "Cash",
      lastName: "Desk",
      employmentType: "permanent",
      phone: denyPhone,
      status: "active",
      platformIdentityId: denyIdentity.identity.id,
      jobTitle: "Cashier",
    });
    await assignStaffToFacility(pool, {
      organizationId: clinical.organizationId,
      staffMemberId: denyStaff.staffMember.id,
      facilityId: clinical.facilityId,
      isPrimary: true,
    });
    const denyRole = await assignStaffRole(pool, {
      organizationId: clinical.organizationId,
      staffMemberId: denyStaff.staffMember.id,
      roleKey: CASHIER,
      scopeType: "facility",
      facilityId: clinical.facilityId,
    });
    assert.equal(denyRole.ok, true, JSON.stringify(denyRole));

    const app = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      getPool: () => pool,
      isProduction: false,
    });

    const clinicalCookie = await sessionCookie(clinical.identityId, clinical.organizationId);
    await selectFacility(app, clinicalCookie, clinical.facilityId);

    const vitalsRes = await request(app)
      .get(`/app/clinical/encounter/${encounterId}/vitals`)
      .set("Cookie", clinicalCookie);
    assert.equal(vitalsRes.status, 200);
    assert.match(vitalsRes.text, /data-ac-batch3="ACN17"/);
    assert.match(vitalsRes.text, /Record current observation/i);

    const rxRes = await request(app)
      .get(`/app/clinical/encounter/${encounterId}/order/prescription`)
      .set("Cookie", clinicalCookie);
    assert.equal(rxRes.status, 200);
    assert.match(rxRes.text, /data-ac-batch3="ACN19"/);
    assert.match(rxRes.text, /Prescription editor/i);
    assert.match(rxRes.text, /drug_name/);

    const deniedCookie = await sessionCookie(
      denyIdentity.identity.id,
      clinical.organizationId
    );
    await selectFacility(app, deniedCookie, clinical.facilityId);
    const deniedVitals = await request(app)
      .get(`/app/clinical/encounter/${encounterId}/vitals`)
      .set("Cookie", deniedCookie);
    assert.equal(deniedVitals.status, 403);

    const deniedRx = await request(app)
      .get(`/app/clinical/encounter/${encounterId}/order/prescription`)
      .set("Cookie", deniedCookie);
    assert.equal(deniedRx.status, 403);

    const encounterRes = await request(app)
      .get(`/app/clinical/encounter/${encounterId}`)
      .set("Cookie", clinicalCookie);
    assert.equal(encounterRes.status, 200);
    assert.match(encounterRes.text, /data-ac-stitch="AC-B2-06"/);
  });

  it("ACN17 POST records vitals; ACN19 POST creates prescription order", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const clinic = await provisionClinic("post", [RECEPTIONIST, NURSE, CLINICIAN]);
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Post", lastName: "Leaf" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));
    const started = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: patient.patient.id,
      actor: clinic.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));
    const encounterId = started.encounter.id;

    const app = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      getPool: () => pool,
      isProduction: false,
    });

    const cookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    await selectFacility(app, cookie, clinic.facilityId);
    const { cookie: csrfCookie, csrf } = withCsrf(cookie);
    const vitalsPost = await request(app)
      .post(`/app/clinical/encounter/${encounterId}/vitals`)
      .set("Cookie", csrfCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        observation_type: "heart_rate",
        value_numeric: "72",
        unit: "bpm",
      });
    assert.equal(vitalsPost.status, 303);
    assert.match(vitalsPost.headers.location || "", /vitals\?recorded=1/);

    const { cookie: rxCookie, csrf: rxCsrf } = withCsrf(cookie);
    const rxPost = await request(app)
      .post(`/app/clinical/encounter/${encounterId}/order/prescription`)
      .set("Cookie", rxCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: rxCsrf,
        drug_name: "Amoxicillin",
        dose: "500mg",
        frequency: "three times daily",
        duration: "5 days",
        route: "Oral (PO)",
        quantity: "15 capsules",
        refills: "0",
        instructions: "Take after meals",
      });
    assert.equal(rxPost.status, 303);
    assert.match(rxPost.headers.location || "", /order_created=1/);
  });
});
