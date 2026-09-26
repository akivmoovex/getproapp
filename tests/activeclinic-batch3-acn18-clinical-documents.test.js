"use strict";

/**
 * V2.03 ACN18 — Clinical Documents MVP.
 * Draft/final lifecycle, isolation, RBAC, Stitch markers.
 * Binary attachments deferred (no private clinical storage).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
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
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  startEncounter,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  createClinicalDocument,
  updateClinicalDocumentDraft,
  finalizeClinicalDocument,
  getClinicalDocument,
  listClinicalDocuments,
  RESULT,
  PERM,
} = require("../src/activeclinic/services/activeClinicClinicalDocumentService");
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
let skipReason = null;
let phoneSeq = 881000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
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

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `ACN18 ${label}`,
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
    firstName: "Doc",
    lastName: label,
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: "Staff",
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
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
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

describe("ActiveClinic V2.03 ACN18 Clinical Documents", () => {
  before(async () => {
    try {
      const databaseUrl = await resetFoundationDatabase();
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

  it("migration 041 defines clinical_documents without public storage URLs", () => {
    const sql = fs.readFileSync(
      path.join(ROOT, "db/migrations/activeclinic/041_clinical_documents.sql"),
      "utf8"
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS activeclinic\.clinical_documents/);
    assert.match(sql, /status IN \('draft', 'final'\)/);
    assert.match(sql, /activeclinic\.clinical_document\.view/);
    assert.match(sql, /activeclinic\.clinical_document\.create/);
    assert.match(sql, /activeclinic\.clinical_document\.finalize/);
    assert.match(sql, /Binary attachments DEFERRED/);
    assert.doesNotMatch(sql, /CREATE TABLE IF NOT EXISTS[^\n]*clinical_document_attachments/);
    assert.doesNotMatch(sql, /public_url|website_media|hostinger_media/i);
  });

  it("views carry ACN18 Stitch markers and deferred attachment note", () => {
    const list = fs.readFileSync(
      path.join(VIEWS, "clinical-documents-list-content.ejs"),
      "utf8"
    );
    assert.match(list, /data-ac-stitch="ACN18"/);
    assert.match(list, /9b5d55cc2e8445f5bf97ef98f00cf8d3/);
    assert.match(list, /ee65f85e2f484eb9b147dc06c97949ad/);
    assert.match(list, /data-ac-docs-desktop/);
    assert.match(list, /data-ac-docs-mobile/);
    assert.match(list, /data-ac-storage-gap/);

    const form = fs.readFileSync(
      path.join(VIEWS, "clinical-document-form-content.ejs"),
      "utf8"
    );
    assert.match(form, /data-ac-binary-attachments="deferred"/);
    assert.match(form, /data-ac-attachment-deferred/);
    assert.doesNotMatch(form, /type="file"/);

    const detail = fs.readFileSync(
      path.join(VIEWS, "clinical-document-detail-content.ejs"),
      "utf8"
    );
    assert.match(detail, /data-ac-doc-history/);
    assert.match(detail, /data-ac-doc-readonly/);
  });

  it("creates draft, edits, finalizes; final rejects ordinary edit", async () => {
    requireDb();
    const clinic = await provisionClinic("crud", [RECEPTIONIST, CLINICIAN]);
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: clinic.actor,
      demographics: { firstName: "Ada", lastName: "Docs" },
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

    const created = await createClinicalDocument(pool, {
      organizationId: clinic.organizationId,
      patientId: patient.patient.id,
      facilityId: clinic.facilityId,
      encounterId: started.encounter.id,
      documentType: "clinical_note",
      title: "Progress note",
      bodyText: "Initial draft",
      documentDate: "2026-09-26",
      actor: clinic.actor,
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.document.status, "draft");

    const updated = await updateClinicalDocumentDraft(pool, {
      organizationId: clinic.organizationId,
      documentId: created.document.id,
      patientId: patient.patient.id,
      encounterId: started.encounter.id,
      documentType: "clinical_note",
      title: "Progress note revised",
      bodyText: "Updated draft",
      actor: clinic.actor,
    });
    assert.equal(updated.ok, true, JSON.stringify(updated));
    assert.equal(updated.document.title, "Progress note revised");

    const finalized = await finalizeClinicalDocument(pool, {
      organizationId: clinic.organizationId,
      documentId: created.document.id,
      patientId: patient.patient.id,
      actor: clinic.actor,
    });
    assert.equal(finalized.ok, true, JSON.stringify(finalized));
    assert.equal(finalized.document.status, "final");

    const blocked = await updateClinicalDocumentDraft(pool, {
      organizationId: clinic.organizationId,
      documentId: created.document.id,
      patientId: patient.patient.id,
      documentType: "clinical_note",
      title: "Should fail",
      bodyText: "nope",
      actor: clinic.actor,
    });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.code, RESULT.FINAL_IMMUTABLE);

    const got = await getClinicalDocument(pool, {
      organizationId: clinic.organizationId,
      documentId: created.document.id,
      patientId: patient.patient.id,
    });
    assert.equal(got.ok, true);
    assert.ok(got.events.some((e) => e.eventType === "created"));
    assert.ok(got.events.some((e) => e.eventType === "updated"));
    assert.ok(got.events.some((e) => e.eventType === "finalized"));
  });

  it("rejects forged patient/encounter and cross-patient access", async () => {
    requireDb();
    const a = await provisionClinic("isoA", [RECEPTIONIST, CLINICIAN]);
    const b = await provisionClinic("isoB", [RECEPTIONIST, CLINICIAN]);

    const patientA = await registerActiveClinicPatient(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      actor: a.actor,
      demographics: { firstName: "Pat", lastName: "A" },
      registrationMethod: "walk_in",
    });
    const patientB = await registerActiveClinicPatient(pool, {
      organizationId: b.organizationId,
      healthcareOrganizationId: b.hcoId,
      facilityId: b.facilityId,
      actor: b.actor,
      demographics: { firstName: "Pat", lastName: "B" },
      registrationMethod: "walk_in",
    });
    assert.equal(patientA.ok, true);
    assert.equal(patientB.ok, true);

    const encA = await startEncounter(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      patientId: patientA.patient.id,
      actor: a.actor,
      encounterType: "outpatient",
    });
    assert.equal(encA.ok, true);

    const forgedPatient = await createClinicalDocument(pool, {
      organizationId: a.organizationId,
      patientId: patientB.patient.id,
      facilityId: a.facilityId,
      documentType: "clinical_note",
      title: "Forged",
      actor: a.actor,
    });
    assert.equal(forgedPatient.ok, false);
    assert.equal(forgedPatient.code, RESULT.PATIENT_NOT_FOUND);

    const forgedEncounter = await createClinicalDocument(pool, {
      organizationId: a.organizationId,
      patientId: patientA.patient.id,
      facilityId: a.facilityId,
      encounterId: "00000000-0000-4000-8000-000000000099",
      documentType: "clinical_note",
      title: "Bad encounter",
      actor: a.actor,
    });
    assert.equal(forgedEncounter.ok, false);
    assert.ok(
      forgedEncounter.code === RESULT.ENCOUNTER_NOT_FOUND ||
        forgedEncounter.code === RESULT.ENCOUNTER_MISMATCH
    );

    const docA = await createClinicalDocument(pool, {
      organizationId: a.organizationId,
      patientId: patientA.patient.id,
      facilityId: a.facilityId,
      encounterId: encA.encounter.id,
      documentType: "referral_letter",
      title: "Referral A",
      actor: a.actor,
    });
    assert.equal(docA.ok, true);

    const crossTenant = await getClinicalDocument(pool, {
      organizationId: b.organizationId,
      documentId: docA.document.id,
    });
    assert.equal(crossTenant.ok, false);
    assert.equal(crossTenant.code, RESULT.NOT_FOUND);

    const crossPatient = await getClinicalDocument(pool, {
      organizationId: a.organizationId,
      documentId: docA.document.id,
      patientId: patientB.patient.id,
    });
    assert.equal(crossPatient.ok, false);

    const listOther = await listClinicalDocuments(pool, {
      organizationId: b.organizationId,
      patientId: patientA.patient.id,
    });
    assert.equal(listOther.ok, false);
  });

  it("HTTP list/create/detail with Stitch markers; receptionist cannot manage", async () => {
    requireDb();
    const clinical = await provisionClinic("http", [RECEPTIONIST, CLINICIAN]);
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinical.organizationId,
      healthcareOrganizationId: clinical.hcoId,
      facilityId: clinical.facilityId,
      actor: clinical.actor,
      demographics: { firstName: "Http", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      isProduction: false,
    });

    const cookie = await sessionCookie(clinical.identityId, clinical.organizationId);
    const listPath = `/app/clinical/patients/${encodeURIComponent(patient.patient.id)}/documents`;

    const listRes = await request(app).get(listPath).set("Cookie", cookie);
    assert.equal(listRes.status, 200);
    assert.match(listRes.text, /data-ac-stitch="ACN18"/);
    assert.match(listRes.text, /9b5d55cc2e8445f5bf97ef98f00cf8d3/);
    assert.match(listRes.text, /ee65f85e2f484eb9b147dc06c97949ad/);
    assert.match(listRes.text, /data-ac-storage-gap/);
    assert.match(listRes.text, /Clinical Documents/);

    const { cookie: postCookie, csrf } = withCsrf(cookie);
    const createRes = await request(app)
      .post(listPath)
      .set("Cookie", postCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        facility_id: clinical.facilityId,
        document_type: "clinical_note",
        title: "HTTP draft note",
        body_text: "Body from HTTP",
        intent: "draft",
      });
    assert.equal(createRes.status, 303);
    const loc = String(createRes.headers.location || "");
    assert.match(loc, /\/documents\/[0-9a-f-]+/);

    const detailRes = await request(app).get(loc).set("Cookie", cookie);
    assert.equal(detailRes.status, 200);
    assert.match(detailRes.text, /HTTP draft note/);
    assert.match(detailRes.text, /data-ac-doc-status="draft"/);
    assert.match(detailRes.text, /data-ac-docs-desktop|data-ac-doc-history/);

    // After create, list shows desktop/mobile markers
    const listPopulated = await request(app).get(listPath).set("Cookie", cookie);
    assert.equal(listPopulated.status, 200);
    assert.match(listPopulated.text, /data-ac-docs-desktop/);
    assert.match(listPopulated.text, /data-ac-docs-mobile/);

    // Receptionist-only staff cannot create
    const desk = await provisionClinic("desk", [RECEPTIONIST]);
    const deskPatient = await registerActiveClinicPatient(pool, {
      organizationId: desk.organizationId,
      healthcareOrganizationId: desk.hcoId,
      facilityId: desk.facilityId,
      actor: desk.actor,
      demographics: { firstName: "Desk", lastName: "Only" },
      registrationMethod: "walk_in",
    });
    assert.equal(deskPatient.ok, true);
    const deskApp = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      isProduction: false,
    });
    const deskCookie = await sessionCookie(desk.identityId, desk.organizationId);
    const denyNew = await request(deskApp)
      .get(
        `/app/clinical/patients/${encodeURIComponent(deskPatient.patient.id)}/documents/new`
      )
      .set("Cookie", deskCookie);
    assert.equal(denyNew.status, 403);

    // Facility admin: facility.update alone must not grant clinical document view
    const adminOnly = await provisionClinic("fadmin", ["activeclinic_facility_admin"]);
    const helperPhone = nextPhone();
    const helperIdentity = await createPlatformIdentity(pool, {
      primaryPhone: helperPhone,
      phoneNormalized: helperPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    await setPlatformIdentityPassword(pool, {
      identityId: helperIdentity.identity.id,
      password: PASSWORD,
    });
    const helperStaff = await createStaffMember(pool, {
      organizationId: adminOnly.organizationId,
      healthcareOrganizationId: adminOnly.hcoId,
      firstName: "Help",
      lastName: "Clinician",
      employmentType: "permanent",
      phone: helperPhone,
      status: "active",
      platformIdentityId: helperIdentity.identity.id,
      jobTitle: "Clinician",
    });
    await assignStaffToFacility(pool, {
      organizationId: adminOnly.organizationId,
      staffMemberId: helperStaff.staffMember.id,
      facilityId: adminOnly.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: adminOnly.organizationId,
      staffMemberId: helperStaff.staffMember.id,
      roleKey: CLINICIAN,
      scopeType: "facility",
      facilityId: adminOnly.facilityId,
    });
    await assignStaffRole(pool, {
      organizationId: adminOnly.organizationId,
      staffMemberId: helperStaff.staffMember.id,
      roleKey: RECEPTIONIST,
      scopeType: "facility",
      facilityId: adminOnly.facilityId,
    });
    const seeded = await registerActiveClinicPatient(pool, {
      organizationId: adminOnly.organizationId,
      healthcareOrganizationId: adminOnly.hcoId,
      facilityId: adminOnly.facilityId,
      actor: {
        staffMemberId: helperStaff.staffMember.id,
        platformIdentityId: helperIdentity.identity.id,
      },
      demographics: { firstName: "Admin", lastName: "Scope" },
      registrationMethod: "walk_in",
    });
    assert.equal(seeded.ok, true, JSON.stringify(seeded));
    const adminCookie = await sessionCookie(
      adminOnly.identityId,
      adminOnly.organizationId
    );
    const adminDeny = await request(app)
      .get(
        `/app/clinical/patients/${encodeURIComponent(seeded.patient.id)}/documents`
      )
      .set("Cookie", adminCookie);
    assert.equal(adminDeny.status, 403);
  });
});
