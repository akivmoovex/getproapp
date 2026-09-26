"use strict";

/**
 * V2.03 ACN10–ACN13 patient directory, consent, check-in, live queue.
 * Aggressive privacy / cross-clinic isolation coverage.
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
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  FACILITY_ADMIN,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  registerActiveClinicPatient,
  searchActiveClinicPatients,
  resolvePatientForActor,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  findPotentialPatientDuplicates,
} = require("../src/activeclinic/services/activeClinicPatientDuplicateService");
const {
  grantPatientConsent,
  withdrawPatientConsent,
  listPatientConsents,
} = require("../src/activeclinic/services/activeClinicPatientConsentService");
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

let pool;
let skipReason = null;
let phoneSeq = 790000000;
let app;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

async function provisionClinic(label) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `Pat ${label}`,
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
    firstName: "Rec",
    lastName: "Admin",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: "Reception",
  });
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  for (const roleKey of [FACILITY_ADMIN, RECEPTIONIST]) {
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

async function sessionCookie(clinic) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: clinic.identityId,
    organizationId: clinic.organizationId,
  });
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 ACN10–13 patient & reception", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      app = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("ships migration, views, and Stitch markers for ACN10–13", () => {
    const migration = fs.readFileSync(
      path.join(
        ROOT,
        "db/migrations/activeclinic/038_batch1a_patient_consent_clinic_fields.sql"
      ),
      "utf8"
    );
    assert.match(migration, /patient_consents/);
    assert.match(migration, /next_of_kin_full_name/);
    assert.match(migration, /clinic_fields_json/);
    assert.match(migration, /patient_consent_events/);

    const list = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/patients-list-content.ejs"),
      "utf8"
    );
    assert.match(list, /data-ac-stitch="ACN10"/);

    const profile = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/patient-profile-content.ejs"),
      "utf8"
    );
    assert.match(profile, /data-ac-stitch="ACN11"/);
    assert.match(profile, /data-ac-consent-ledger/);

    const checkIn = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/reception-check-in-content.ejs"),
      "utf8"
    );
    assert.match(checkIn, /data-ac-stitch="ACN12"/);
    assert.match(checkIn, /Confirm arrived/);

    const queue = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/reception-queue-content.ejs"),
      "utf8"
    );
    assert.match(queue, /data-ac-stitch="ACN13"/);
    assert.match(queue, /Waiting/);
    assert.match(queue, /Practitioner/);
  });

  it("registers full identity fields and keeps duplicate detection clinic-scoped", async () => {
    requireDb();
    const a = await provisionClinic("dupA");
    const b = await provisionClinic("dupB");
    const sharedPhone = nextPhone();

    const createdA = await registerActiveClinicPatient(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      actor: a.actor,
      demographics: {
        firstName: "Same",
        lastName: "Person",
        dateOfBirth: "1990-01-15",
        sexAtRegistration: "female",
      },
      contacts: { phone: sharedPhone },
      address: { city: "Lusaka", countryCode: "ZM" },
      nextOfKin: {
        fullName: "Kin One",
        relationship: "spouse",
        phone: nextPhone(),
      },
      clinicFields: { insurance: "NHIMA", referral_source: "walk_in" },
      registrationMethod: "walk_in",
    });
    assert.equal(createdA.ok, true, JSON.stringify(createdA));
    assert.equal(createdA.patient.nextOfKinFullName, "Kin One");
    assert.equal(createdA.patient.clinicFields.insurance, "NHIMA");

    const createdB = await registerActiveClinicPatient(pool, {
      organizationId: b.organizationId,
      healthcareOrganizationId: b.hcoId,
      facilityId: b.facilityId,
      actor: b.actor,
      demographics: {
        firstName: "Same",
        lastName: "Person",
        dateOfBirth: "1990-01-15",
        sexAtRegistration: "female",
      },
      contacts: { phone: sharedPhone },
      registrationMethod: "walk_in",
    });
    assert.equal(createdB.ok, true, JSON.stringify(createdB));

    const dupsInA = await findPotentialPatientDuplicates(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      phoneNormalized: createdA.patient.phoneNormalized,
      firstName: "Same",
      lastName: "Person",
      dateOfBirth: "1990-01-15",
    });
    assert.equal(dupsInA.ok, true);
    assert.ok(dupsInA.matches.length >= 1);
    assert.ok(
      dupsInA.matches.every((m) => m.patientId === createdA.patient.id),
      "duplicate matches must stay inside the calling clinic"
    );
    assert.ok(
      !dupsInA.matches.some((m) => m.patientId === createdB.patient.id),
      "must never disclose another clinic patient id"
    );

    // Numbers can collide across HCOs; isolation is org/HCO scoped by patient id.
    const crossSearch = await searchActiveClinicPatients(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      actor: a.actor,
      facilityId: a.facilityId,
      patientNumber: createdB.patient.patientNumber,
    });
    assert.equal(crossSearch.ok, true);
    assert.ok(
      !(crossSearch.results || []).some((r) => r.id === createdB.patient.id),
      "search must never return another clinic's patient id"
    );
    assert.ok(
      (crossSearch.results || []).every((r) => r.id === createdA.patient.id)
    );

    const crossResolveById = await resolvePatientForActor(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      patientId: createdB.patient.id,
      facilityId: a.facilityId,
      actor: a.actor,
    });
    assert.equal(crossResolveById.ok, false);

    const sameNumberInA = await resolvePatientForActor(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      patientNumber: createdB.patient.patientNumber,
      facilityId: a.facilityId,
      actor: a.actor,
    });
    if (sameNumberInA.ok) {
      assert.equal(sameNumberInA.patient.id, createdA.patient.id);
      assert.notEqual(sameNumberInA.patient.id, createdB.patient.id);
    }
  });

  it("persists consent with history and never leaks across clinics", async () => {
    requireDb();
    const a = await provisionClinic("consA");
    const b = await provisionClinic("consB");
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      actor: a.actor,
      demographics: { firstName: "Consent", lastName: "Case" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);

    const granted = await grantPatientConsent(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      patientId: patient.patient.id,
      actor: a.actor,
      body: {},
      consentType: "treatment",
      captureMethod: "written",
      consentVersion: "2026.1",
    });
    assert.equal(granted.ok, true, JSON.stringify(granted));
    assert.equal(granted.consent.status, "granted");
    assert.ok(granted.consent.grantedAt);

    const cross = await listPatientConsents(pool, {
      organizationId: b.organizationId,
      healthcareOrganizationId: b.hcoId,
      patientId: patient.patient.id,
      actor: b.actor,
      body: {},
    });
    assert.equal(cross.ok, false);

    const withdrawn = await withdrawPatientConsent(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      consentId: granted.consent.id,
      actor: a.actor,
      body: {},
      withdrawalReason: "Patient withdrew in person",
    });
    assert.equal(withdrawn.ok, true, JSON.stringify(withdrawn));
    assert.equal(withdrawn.consent.status, "withdrawn");
    assert.ok(withdrawn.consent.withdrawnAt);

    const listed = await listPatientConsents(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      patientId: patient.patient.id,
      actor: a.actor,
      body: {},
    });
    assert.equal(listed.ok, true);
    assert.equal(listed.consents[0].status, "withdrawn");
  });

  it("HTTP patient and reception screens render Stitch markers without clinical notes", async () => {
    requireDb();
    const clinic = await provisionClinic("http");
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Http", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);
    const cookie = await sessionCookie(clinic);

    const list = await request(app).get("/app/patients").set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-stitch="ACN10"/);
    assert.match(list.text, /d6fa60ee647a44949449f163990a3e1f/);

    const profile = await request(app)
      .get(`/app/patients/${encodeURIComponent(patient.patient.patientNumber)}`)
      .set("Cookie", cookie);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /data-ac-stitch="ACN11"/);
    assert.match(profile.text, /data-ac-consent-ledger/);
    assert.doesNotMatch(profile.text, /\bSOAP\b|data-ac-clinical-note|encounter_note/i);

    const csrf = issueCsrfToken(MINIMAL_AC);
    const postCookie = `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`;
    const grant = await request(app)
      .post(`/app/patients/${encodeURIComponent(patient.patient.patientNumber)}/consents`)
      .set("Cookie", postCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        consent_type: "data_processing",
        capture_method: "verbal",
        consent_version: "1.0",
      });
    assert.equal(grant.status, 303);

    const refreshed = await request(app)
      .get(`/app/patients/${encodeURIComponent(patient.patient.patientNumber)}`)
      .set("Cookie", cookie);
    assert.match(refreshed.text, /Data processing|Granted|granted/i);

    const checkIn = await request(app)
      .get("/app/reception/check-in")
      .set("Cookie", cookie);
    assert.equal(checkIn.status, 200);
    assert.match(checkIn.text, /data-ac-stitch="ACN12"/);
    assert.match(checkIn.text, /ed27c2dfb6474a139b126c5bd57e0869/);
    assert.match(checkIn.text, /not a clinical note|never shows restricted clinical notes/i);
    assert.doesNotMatch(checkIn.text, /\bSOAP\b|data-ac-clinical-note|encounter_note/i);

    const queue = await request(app).get("/app/reception").set("Cookie", cookie);
    assert.equal(queue.status, 200);
    assert.match(queue.text, /data-ac-stitch="ACN13"/);
    assert.match(queue.text, /4bdf5a39d81043e1bd9488caa0833048/);
    assert.match(queue.text, /Practitioner|Destination|Waiting/);
    assert.doesNotMatch(queue.text, /\bSOAP\b|data-ac-clinical-note|encounter_note/i);
  });
});
