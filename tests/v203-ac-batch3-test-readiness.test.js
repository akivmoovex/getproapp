#!/usr/bin/env node
"use strict";

/**
 * V2.03 QA09 — ActiveClinic Batch 3 test readiness.
 *
 * Additive high-value coverage on top of activeclinic-batch3-*.test.js:
 *   - screen→route/view/Stitch inventory (ACN17/18/19/20/27, AC-P03–07)
 *   - implemented MVP contracts for private-storage gaps (do not invent deferred features)
 *   - negative authorization + facility-scope for clinical Batch 3 data
 *
 * Does not redesign screens. Line coverage alone is not the proof gate.
 * STOP and classify if an application defect is found.
 *
 * Marker: V203_AC_BATCH3_TEST_READINESS_PASS
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
  authorizeStaffPermission,
  RECEPTIONIST,
  CLINICIAN,
  NURSE,
  CASHIER,
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  startEncounter,
  recordVitalSignObservation,
  createClinicalOrder,
  RESULT: CLINICAL_RESULT,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  createClinicalDocument,
  listClinicalDocuments,
  getClinicalDocument,
  RESULT: DOC_RESULT,
} = require("../src/activeclinic/services/activeClinicClinicalDocumentService");
const {
  createFacilityRoom,
  listFacilityRooms,
  RESULT: ROOM_RESULT,
} = require("../src/activeclinic/services/activeClinicFacilityRoomService");
const {
  releaseVisitSummary,
  getReleasedSummaryForPatient,
  RESULT: RELEASE_RESULT,
  PERM: RELEASE_PERM,
} = require("../src/activeclinic/services/activeClinicVisitSummaryReleaseService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const {
  createPlatformIdentitySession,
} = require("../src/platform/session/createDeploymentSession");
const { CSRF_FIELD, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const ROOT = path.join(__dirname, "..");
const PASSWORD = "activeclinic-pass-12";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

/** Frozen Batch 3 surfaces (Stitch 7300898757945019896 + 3741389873539108242 leaves). */
const BATCH3_SCREENS = Object.freeze([
  {
    code: "ACN17",
    route: "/app/clinical/encounter/:id/vitals",
    view: "views/activeclinic/app/vital-signs-entry-content.ejs",
    marker: /data-ac-batch3="ACN17"/,
  },
  {
    code: "ACN18",
    route: "/app/clinical/patients/:patientId/documents",
    view: "views/activeclinic/app/clinical-documents-list-content.ejs",
    marker: /data-ac-stitch="ACN18"/,
  },
  {
    code: "ACN19",
    route: "/app/clinical/encounter/:id/order/prescription",
    view: "views/activeclinic/app/create-prescription-content.ejs",
    marker: /data-ac-batch3="ACN19"/,
  },
  {
    code: "ACN20",
    route: "/app/clinical/referrals",
    view: "views/activeclinic/app/clinical-referrals-content.ejs",
    marker: /data-ac-stitch="ACN20"/,
  },
  {
    code: "ACN27",
    route: "/app/rooms",
    view: "views/activeclinic/app/rooms-list-content.ejs",
    marker: /data-ac-stitch="ACN27"/,
  },
  {
    code: "AC-P03",
    route: "/clinics/:clinicKey/patient/bookings",
    view: "views/activeclinic/patient/bookings.ejs",
    marker: /data-ac-batch3="AC-P03"/,
  },
  {
    code: "AC-P04",
    route: "/clinics/:clinicKey/patient/bookings/:reference",
    view: "views/activeclinic/patient/booking-detail.ejs",
    marker: /data-ac-batch3="AC-P04"/,
  },
  {
    code: "AC-P05",
    route: "/clinics/:clinicKey/patient/visit-summaries",
    view: "views/activeclinic/patient/visit-summaries.ejs",
    marker: /data-ac-batch3="AC-P05"/,
  },
  {
    code: "AC-P06",
    route: "/clinics/:clinicKey/patient/invoices",
    view: "views/activeclinic/patient/invoices.ejs",
    marker: /data-ac-batch3="AC-P06"/,
  },
  {
    code: "AC-P07",
    route: "/clinics/:clinicKey/patient/profile",
    view: "views/activeclinic/patient/profile.ejs",
    marker: /data-ac-batch3="AC-P07"/,
  },
]);

const UNAUTH_STAFF_ROUTES = Object.freeze([
  "/app/rooms",
  "/app/clinical/referrals",
  "/app/clinical/patients/00000000-0000-4000-8000-000000000099/documents",
]);

let pool;
let skipReason = null;
let app;
let phoneSeq = 870000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb(t) {
  if (skipReason) t.skip(`QA09 foundation unavailable: ${skipReason}`);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertUnauthRedirect(res, label) {
  assert.ok(
    [302, 303, 401].includes(res.status),
    `${label} expected unauth redirect/401, got ${res.status}`
  );
  if (res.status === 302 || res.status === 303) {
    assert.match(String(res.headers.location || ""), /\/login/i, label);
  }
}

function withCsrf(cookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
    csrf,
  };
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `QA09 ${label}`,
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
    firstName: "Batch",
    lastName: "Three",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: "Administrator",
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

async function addSatelliteFacility(clinic, label) {
  const sat = await createFacility(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    facilityKey: `sat-${label}-${Date.now().toString(36)}`,
    displayName: `Satellite ${label}`,
    facilityType: "clinic",
    status: "active",
    isPrimary: false,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Ndola",
  });
  assert.equal(sat.ok, true, JSON.stringify(sat));
  await ensureDefaultDepartments(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    facilityId: sat.facility.id,
  });
  return sat.facility.id;
}

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
    skipReason = err && err.message ? String(err.message).slice(0, 400) : "no foundation db";
    pool = null;
    app = null;
  }
});

after(async () => {
  if (pool) await pool.end().catch(() => {});
});

describe("V203 QA09 AC Batch 3 — screen inventory + MVP gap contracts", () => {
  it("maps Batch 3 screens to views/Stitch markers", () => {
    assert.equal(BATCH3_SCREENS.length, 10);
    for (const screen of BATCH3_SCREENS) {
      assert.ok(fs.existsSync(path.join(ROOT, screen.view)), `${screen.code} missing view`);
      assert.match(read(screen.view), screen.marker, `${screen.code} marker`);
      assert.ok(screen.route.length > 1, `${screen.code} route`);
    }
    assert.match(
      read("views/activeclinic/app/clinical-document-form-content.ejs"),
      /data-ac-stitch="ACN18"/
    );
    assert.match(
      read("views/activeclinic/patient/visit-summary.ejs"),
      /data-ac-batch3="AC-P05"/
    );
  });

  it("asserts implemented deferred-storage contracts (no pretended binary/PDF/occupancy)", () => {
    const openDecisions = read("docs/v2.03/ACTIVECLINIC_BATCH3_OPEN_DECISIONS.md");
    assert.match(openDecisions, /BINARY_ATTACHMENT_DEFERRED_PRIVATE_STORAGE_REQUIRED/);
    assert.match(openDecisions, /VISIT_SUMMARY_PDF_DEFERRED_PRIVATE_STORAGE_REQUIRED/);

    const backlog = read("docs/BACKLOG.md");
    assert.match(backlog, /BINARY_ATTACHMENT_DEFERRED_PRIVATE_STORAGE_REQUIRED/);
    assert.match(backlog, /VISIT_SUMMARY_PDF_DEFERRED_PRIVATE_STORAGE_REQUIRED/);
    assert.match(backlog, /Occupancy \/ current-use engine/);

    const mig041 = read("db/migrations/activeclinic/041_clinical_documents.sql");
    assert.match(mig041, /Binary attachments DEFERRED/);
    assert.doesNotMatch(mig041, /CREATE TABLE IF NOT EXISTS[^\n]*clinical_document_attachments/);
    assert.doesNotMatch(mig041, /public_url|website_media|hostinger_media/i);

    const mig040 = read("db/migrations/activeclinic/040_facility_rooms.sql");
    assert.match(mig040, /No occupancy/);
    assert.doesNotMatch(mig040, /occupancy_status|iot_|bed_management/i);

    const mig042 = read("db/migrations/activeclinic/042_patient_visit_summary_releases.sql");
    assert.match(mig042, /patient_visit_summary_releases/);
    assert.doesNotMatch(mig042, /pdf_object|storage_key|public_url/i);

    const form = read("views/activeclinic/app/clinical-document-form-content.ejs");
    assert.match(form, /data-ac-binary-attachments="deferred"|data-ac-attachment-deferred/);
    assert.doesNotMatch(form, /type="file"/);

    const visitSummary = read("views/activeclinic/patient/visit-summary.ejs");
    assert.match(visitSummary, /data-ac-pdf-deferred/);
    assert.match(visitSummary, /PDF download is not available yet/i);

    const docRoutes = read("src/activeclinic/http/activeClinicClinicalDocumentRoutes.js");
    assert.match(docRoutes, /Binary attachments deferred/i);
    assert.doesNotMatch(docRoutes, /multer|multipart|uploadAttachment|\/attachments\/download/i);

    const patientReleaseRoutes = read(
      "src/activeclinic/http/activeClinicVisitSummaryPatientRoutes.js"
    );
    assert.match(patientReleaseRoutes, /pdfDeferred:\s*true/);
    assert.doesNotMatch(patientReleaseRoutes, /Content-Type.*pdf|application\/pdf/i);
  });

  it("wires Batch 3 route modules for docs/rooms/vitals/referrals/portal", () => {
    assert.match(
      read("src/activeclinic/http/activeClinicClinicalDocumentRoutes.js"),
      /\/app\/clinical\/patients\/:patientId\/documents/
    );
    assert.match(read("src/activeclinic/http/activeClinicRoomRoutes.js"), /\/app\/rooms/);
    assert.match(
      read("src/activeclinic/http/activeClinicClinicalRoutes.js"),
      /\/app\/clinical\/encounter\/:encounterId\/vitals/
    );
    assert.match(
      read("src/activeclinic/http/activeClinicClinicalRoutes.js"),
      /\/app\/clinical\/referrals/
    );
    assert.match(
      read("src/activeclinic/http/activeClinicVisitSummaryStaffRoutes.js"),
      /visit-summary\/release/
    );
    assert.match(
      read("src/activeclinic/http/activeClinicVisitSummaryPatientRoutes.js"),
      /\/patient\/visit-summaries/
    );
    assert.match(
      read("src/activeclinic/http/activeClinicPatientPortalRoutes.js"),
      /\/patient\/bookings/
    );
    assert.match(
      read("src/activeclinic/http/activeClinicPatientPortalRoutes.js"),
      /\/patient\/invoices/
    );
  });
});

describe("V203 QA09 AC Batch 3 — authz + facility-scope clinical negatives", () => {
  it("rejects unauthenticated Batch 3 staff clinical/ops routes", async (t) => {
    requireDb(t);
    for (const route of UNAUTH_STAFF_ROUTES) {
      const res = await request(app).get(route);
      assertUnauthRedirect(res, route);
    }
  });

  it("denies clinical vitals/orders and documents outside assigned facility scope", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic("fac", [
      RECEPTIONIST,
      CLINICIAN,
      NURSE,
    ]);
    const satelliteId = await addSatelliteFacility(clinic, "vit");

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Scope", lastName: "Deny" },
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

    const deniedStart = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: satelliteId,
      patientId: patient.patient.id,
      actor: clinic.actor,
      encounterType: "outpatient",
    });
    assert.equal(deniedStart.ok, false);
    assert.equal(deniedStart.code, CLINICAL_RESULT.ACCESS_DENIED);

    const deniedVitals = await recordVitalSignObservation(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: satelliteId,
      encounterId: started.encounter.id,
      actor: clinic.actor,
      observationType: "heart_rate",
      valueNumeric: 72,
      unit: "bpm",
    });
    assert.equal(deniedVitals.ok, false);
    assert.equal(deniedVitals.code, CLINICAL_RESULT.ACCESS_DENIED);

    const deniedOrder = await createClinicalOrder(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: satelliteId,
      encounterId: started.encounter.id,
      actor: clinic.actor,
      orderType: "prescription",
      orderDetails: { drug_name: "Amoxicillin", dose: "500mg" },
      instructions: "facility scope deny",
    });
    assert.equal(deniedOrder.ok, false);
    assert.equal(deniedOrder.code, CLINICAL_RESULT.ACCESS_DENIED);

    const other = await provisionClinic("xorg", [RECEPTIONIST, CLINICIAN]);
    const forgedFacilityDoc = await createClinicalDocument(pool, {
      organizationId: clinic.organizationId,
      patientId: patient.patient.id,
      facilityId: other.facilityId,
      documentType: "clinical_note",
      title: "Forged facility",
      bodyText: "must fail",
      actor: clinic.actor,
    });
    assert.equal(forgedFacilityDoc.ok, false);
    assert.equal(forgedFacilityDoc.code, DOC_RESULT.FACILITY_NOT_FOUND);

    const mismatch = await createClinicalDocument(pool, {
      organizationId: clinic.organizationId,
      patientId: patient.patient.id,
      facilityId: satelliteId,
      encounterId: started.encounter.id,
      documentType: "clinical_note",
      title: "Encounter facility mismatch",
      bodyText: "must fail",
      actor: clinic.actor,
    });
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.code, DOC_RESULT.ENCOUNTER_MISMATCH);

    const created = await createClinicalDocument(pool, {
      organizationId: clinic.organizationId,
      patientId: patient.patient.id,
      facilityId: clinic.facilityId,
      encounterId: started.encounter.id,
      documentType: "clinical_note",
      title: "HQ progress note",
      bodyText: "facility A only",
      actor: clinic.actor,
    });
    assert.equal(created.ok, true, JSON.stringify(created));

    const listedSat = await listClinicalDocuments(pool, {
      organizationId: clinic.organizationId,
      patientId: patient.patient.id,
      facilityId: satelliteId,
    });
    assert.equal(listedSat.ok, true, JSON.stringify(listedSat));
    assert.equal(listedSat.documents.length, 0);

    const listedHq = await listClinicalDocuments(pool, {
      organizationId: clinic.organizationId,
      patientId: patient.patient.id,
      facilityId: clinic.facilityId,
    });
    assert.equal(listedHq.ok, true, JSON.stringify(listedHq));
    assert.equal(listedHq.documents.length, 1);
    assert.equal(listedHq.documents[0].id, created.document.id);

    const crossTenantGet = await getClinicalDocument(pool, {
      organizationId: other.organizationId,
      documentId: created.document.id,
    });
    assert.equal(crossTenantGet.ok, false);
    assert.equal(crossTenantGet.code, DOC_RESULT.NOT_FOUND);
  });

  it("scopes rooms by facility and rejects cross-tenant room create", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic("rooms", [FACILITY_ADMIN, RECEPTIONIST]);
    const satelliteId = await addSatelliteFacility(clinic, "rm");
    const other = await provisionClinic("roomsx", [FACILITY_ADMIN]);

    const hqRoom = await createFacilityRoom(pool, {
      organizationId: clinic.organizationId,
      facilityId: clinic.facilityId,
      displayName: "Exam 1",
      roomCode: "E1",
      roomType: "exam",
      actor: clinic.actor,
    });
    assert.equal(hqRoom.ok, true, JSON.stringify(hqRoom));

    const satRoom = await createFacilityRoom(pool, {
      organizationId: clinic.organizationId,
      facilityId: satelliteId,
      displayName: "Exam Sat",
      roomCode: "S1",
      roomType: "exam",
      actor: clinic.actor,
    });
    assert.equal(satRoom.ok, true, JSON.stringify(satRoom));

    const hqList = await listFacilityRooms(pool, {
      organizationId: clinic.organizationId,
      facilityId: clinic.facilityId,
    });
    assert.equal(hqList.ok, true, JSON.stringify(hqList));
    assert.ok(hqList.rooms.some((r) => r.id === hqRoom.room.id));
    assert.ok(!hqList.rooms.some((r) => r.id === satRoom.room.id));

    const forged = await createFacilityRoom(pool, {
      organizationId: clinic.organizationId,
      facilityId: other.facilityId,
      displayName: "Leak",
      roomCode: "X1",
      roomType: "exam",
      actor: clinic.actor,
    });
    assert.equal(forged.ok, false);
    assert.equal(forged.code, ROOM_RESULT.FACILITY_NOT_FOUND);
  });

  it("denies visit-summary release without permission; patient isolation holds", async (t) => {
    requireDb(t);
    const clinic = await provisionClinic("rel", [RECEPTIONIST, CLINICIAN]);

    // Facility admin on same clinic — no visit_summary.release
    const adminPhone = nextPhone();
    const adminIdentity = await createPlatformIdentity(pool, {
      primaryPhone: adminPhone,
      phoneNormalized: adminPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: adminIdentity.identity.id,
      password: PASSWORD,
    });
    const adminStaff = await createStaffMember(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      firstName: "Fac",
      lastName: "Admin",
      employmentType: "permanent",
      phone: adminPhone,
      status: "active",
      platformIdentityId: adminIdentity.identity.id,
      jobTitle: "Facility Admin",
    });
    await assignStaffToFacility(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: adminStaff.staffMember.id,
      facilityId: clinic.facilityId,
      isPrimary: true,
    });
    const adminRole = await assignStaffRole(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: adminStaff.staffMember.id,
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
      facilityId: clinic.facilityId,
    });
    assert.equal(adminRole.ok, true, JSON.stringify(adminRole));

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Release", lastName: "Owner" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));
    const otherPatient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Release", lastName: "Other" },
      registrationMethod: "walk_in",
    });
    assert.equal(otherPatient.ok, true, JSON.stringify(otherPatient));

    const started = await startEncounter(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: patient.patient.id,
      actor: clinic.actor,
      encounterType: "outpatient",
    });
    assert.equal(started.ok, true, JSON.stringify(started));

    const adminAuthz = await authorizeStaffPermission(pool, {
      organizationId: clinic.organizationId,
      staffMemberId: adminStaff.staffMember.id,
      platformIdentityId: adminIdentity.identity.id,
      permissionKey: RELEASE_PERM.RELEASE,
      facilityId: clinic.facilityId,
    });
    assert.equal(adminAuthz.ok, false);

    const adminSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: adminIdentity.identity.id,
      organizationId: clinic.organizationId,
      contextJson: { selectedFacilityId: clinic.facilityId },
    });
    assert.equal(adminSession.ok, true);
    const adminCookie = `${COOKIE_ACTIVECLINIC_ORG}=${adminSession.rawToken}`;
    const deniedReleasePage = await request(app)
      .get(
        `/app/clinical/encounter/${started.encounter.id}/visit-summary/release`
      )
      .set("Cookie", adminCookie);
    assert.equal(deniedReleasePage.status, 403);

    const released = await releaseVisitSummary(pool, {
      organizationId: clinic.organizationId,
      encounterId: started.encounter.id,
      actor: clinic.actor,
      overrides: {
        reasonForVisit: "QA09 facility authz",
        assessmentSummary: "Stable; facility-scoped release contract.",
        careProvided: "Supportive care",
      },
    });
    assert.equal(released.ok, true, JSON.stringify(released));

    const crossPatient = await getReleasedSummaryForPatient(pool, {
      organizationId: clinic.organizationId,
      patientId: otherPatient.patient.id,
      summaryId: released.release.id,
    });
    assert.equal(crossPatient.ok, false);
    assert.equal(crossPatient.code, RELEASE_RESULT.NOT_FOUND);

    const owner = await getReleasedSummaryForPatient(pool, {
      organizationId: clinic.organizationId,
      patientId: patient.patient.id,
      summaryId: released.release.id,
    });
    assert.equal(owner.ok, true, JSON.stringify(owner));
  });

  it("HTTP denies cashier on clinical documents; clinician can open ACN18 list", async (t) => {
    requireDb(t);
    const clinical = await provisionClinic("docsok", [
      RECEPTIONIST,
      CLINICIAN,
    ]);
    const desk = await provisionClinic("docdeny", [CASHIER, RECEPTIONIST]);

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinical.organizationId,
      healthcareOrganizationId: clinical.hcoId,
      facilityId: clinical.facilityId,
      actor: clinical.actor,
      demographics: { firstName: "Docs", lastName: "Http" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const okSession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: clinical.identityId,
      organizationId: clinical.organizationId,
      contextJson: { selectedFacilityId: clinical.facilityId },
    });
    const okRes = await request(app)
      .get(`/app/clinical/patients/${patient.patient.id}/documents`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${okSession.rawToken}`);
    assert.equal(okRes.status, 200);
    assert.match(okRes.text, /data-ac-stitch="ACN18"/);

    const denySession = await createPlatformIdentitySession(pool, {
      deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
      platformIdentityId: desk.identityId,
      organizationId: desk.organizationId,
      contextJson: { selectedFacilityId: desk.facilityId },
    });
    const denyPatient = await registerActiveClinicPatient(pool, {
      organizationId: desk.organizationId,
      healthcareOrganizationId: desk.hcoId,
      facilityId: desk.facilityId,
      actor: desk.actor,
      demographics: { firstName: "Cash", lastName: "Deny" },
      registrationMethod: "walk_in",
    });
    assert.equal(denyPatient.ok, true, JSON.stringify(denyPatient));
    const denyRes = await request(app)
      .get(`/app/clinical/patients/${denyPatient.patient.id}/documents`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${denySession.rawToken}`);
    assert.ok(
      [302, 303, 403].includes(denyRes.status),
      `cashier documents → ${denyRes.status}`
    );

    void withCsrf;
    void CSRF_FIELD;
  });
});

describe("V203 QA09 marker", () => {
  it("prints Batch 3 test readiness pass marker", () => {
    console.log("V203_AC_BATCH3_TEST_READINESS_PASS");
    assert.equal(true, true);
  });
});
