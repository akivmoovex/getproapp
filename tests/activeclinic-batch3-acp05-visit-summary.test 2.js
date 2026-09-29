"use strict";

/**
 * V2.03 AC-P05 — Patient visit summary release MVP.
 * Explicit clinician release snapshot; patient portal reads snapshots only.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const request = require("supertest");
const crypto = require("node:crypto");

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
  linkIdentityToProductProfile,
} = require("../src/platform/services/identityProductProfileService");
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
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  startEncounter,
  recordConsultationNote,
  signConsultationNote,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  createConsultationBookingRequest,
} = require("../src/activeclinic/services/activeClinicPublicBookingService");
const {
  buildPatientSafeProjection,
  releaseVisitSummary,
  getReleasedSummaryForPatient,
  listReleasedSummariesForPatient,
  findReleaseLinkedToBooking,
  PERM,
  RESULT,
} = require("../src/activeclinic/services/activeClinicVisitSummaryReleaseService");
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
  ASSET_VERSION: PATIENT_ASSET_VERSION,
} = require("../src/activeclinic/http/renderActiveClinicPatient");

const ROOT = path.join(__dirname, "..");
const PASSWORD = "activeclinic-pass-12";
const PATIENT_PASSWORD = "PortalPass1!";
const MINIMAL_AC = Object.freeze({
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "a".repeat(40),
});

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 892500000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function extractCookie(res, name) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
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

function appWithEnv() {
  return createActiveClinicFoundationApp({
    env: {
      NODE_ENV: "test",
      PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
      DATABASE_URL: databaseUrl,
      SESSION_SECRET: "a".repeat(40),
    },
    getPool: () => pool,
    isProduction: false,
  });
}

async function provisionClinic(label, roleKeys) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `ACP05 ${label}`,
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
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
        SET website_published = true, public_booking_enabled = true
      WHERE id = $1`,
    [hco.healthcareOrganization.id]
  );
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`,
    displayName: "HQ Clinic",
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
    clinicKey: stamp,
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

async function seedPortalPatient(clinic, firstName, lastName) {
  const phone = nextPhone();
  const patient = await registerActiveClinicPatient(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    facilityId: clinic.facilityId,
    actor: clinic.actor,
    demographics: { firstName, lastName },
    contacts: { phone },
    registrationMethod: "walk_in",
  });
  assert.equal(patient.ok, true, JSON.stringify(patient));
  const identity = await createPlatformIdentity(pool, {
    status: "active",
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
    requireContact: true,
  });
  assert.equal(identity.ok, true, JSON.stringify(identity));
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PATIENT_PASSWORD,
  });
  await linkIdentityToProductProfile(pool, {
    identityId: identity.identity.id,
    productKey: "activeclinic",
    profileType: "activeclinic_patient",
    productProfileId: patient.patient.id,
  });
  await pool.query(
    `UPDATE activeclinic.patients SET platform_identity_id = $1 WHERE id = $2`,
    [identity.identity.id, patient.patient.id]
  );
  return { patient: patient.patient, identityId: identity.identity.id, phone };
}

async function signedEncounter(clinic, patientId) {
  const started = await startEncounter(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    facilityId: clinic.facilityId,
    patientId,
    actor: clinic.actor,
    encounterType: "outpatient",
  });
  assert.equal(started.ok, true, JSON.stringify(started));
  const draft = await recordConsultationNote(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    facilityId: clinic.facilityId,
    encounterId: started.encounter.id,
    noteType: "consultation",
    subjectiveText: "Patient reports mild cough",
    assessmentText: "Likely viral URI — patient-safe assessment seed",
    planText: "Rest, fluids, return if worse",
    medicationText: "Paracetamol as needed",
    followUpPlanText: "Follow up in 7 days if symptoms persist",
    additionalNotes: "INTERNAL_ONLY_ADDITIONAL_NOTES",
    objectiveText: "INTERNAL_ONLY_OBJECTIVE SECRET_INTERNAL_NOTE",
    actor: clinic.actor,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(draft.ok, true, JSON.stringify(draft));
  const signed = await signConsultationNote(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    facilityId: clinic.facilityId,
    consultationNoteId: draft.consultation.id,
    actor: clinic.actor,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(signed.ok, true, JSON.stringify(signed));
  return { encounter: started.encounter, consultationNoteId: draft.consultation.id };
}

async function patientLogin(app, clinicKey, phone) {
  const loginPage = await request(app).get(`/clinics/${clinicKey}/patient/login`);
  const csrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
  const login = await request(app)
    .post(`/clinics/${clinicKey}/patient/login`)
    .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
    .type("form")
    .send({
      [CSRF_FIELD]: csrf,
      identifier: phone,
      password: PATIENT_PASSWORD,
    });
  const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
  assert.ok(sid, "patient session");
  return sid;
}

describe("ActiveClinic V2.03 AC-P05 visit summary release", () => {
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

  it("migration 042 defines release table + clinician-only permission", () => {
    const sql = fs.readFileSync(
      path.join(ROOT, "db/migrations/activeclinic/042_patient_visit_summary_releases.sql"),
      "utf8"
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS activeclinic\.patient_visit_summary_releases/);
    assert.match(sql, /patient_visit_summary_releases_encounter_unique/);
    assert.match(sql, /activeclinic\.visit_summary\.release/);
    assert.match(sql, /activeclinic_clinician/);
    assert.doesNotMatch(sql, /activeclinic_facility_admin/);
    assert.doesNotMatch(sql, /activeclinic_org_admin/);
  });

  it("patient views carry Stitch markers and PDF deferred note", () => {
    const detail = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/patient/visit-summary.ejs"),
      "utf8"
    );
    assert.match(detail, /data-ac-batch3="AC-P05"/);
    assert.match(detail, /cd4b21d6860843c6b6862f92326857af/);
    assert.match(detail, /5df55128997f4b9b916852f26b972bb5/);
    assert.match(detail, /data-ac-visit-summary-desktop/);
    assert.match(detail, /data-ac-visit-summary-mobile/);
    assert.match(detail, /data-ac-pdf-deferred/);
    assert.doesNotMatch(detail, /consultation_notes|objective_text|INTERNAL_ONLY/i);

    const list = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/patient/visit-summaries.ejs"),
      "utf8"
    );
    assert.match(list, /data-ac-visit-summary-desktop/);
    assert.match(list, /data-ac-visit-summary-mobile/);

    const nav = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/partials/patient-nav.ejs"),
      "utf8"
    );
    assert.match(nav, /\/patient\/visit-summaries/);
  });

  it("unreleased encounter is invisible; release then visible to correct patient only", async () => {
    requireDb();
    const clinic = await provisionClinic("rel", [RECEPTIONIST, CLINICIAN]);
    const other = await provisionClinic("oth", [RECEPTIONIST, CLINICIAN]);
    const owner = await seedPortalPatient(clinic, "Own", "Patient");
    const otherPatient = await seedPortalPatient(clinic, "Other", "Patient");
    const { encounter } = await signedEncounter(clinic, owner.patient.id);

    const listedBefore = await listReleasedSummariesForPatient(pool, {
      organizationId: clinic.organizationId,
      patientId: owner.patient.id,
    });
    assert.equal(listedBefore.ok, true);
    assert.equal(listedBefore.releases.length, 0);

    const forged = await getReleasedSummaryForPatient(pool, {
      organizationId: clinic.organizationId,
      patientId: owner.patient.id,
      summaryId: crypto.randomUUID(),
    });
    assert.equal(forged.ok, false);
    assert.equal(forged.code, RESULT.NOT_FOUND);

    const projection = await buildPatientSafeProjection(pool, {
      organizationId: clinic.organizationId,
      encounterId: encounter.id,
    });
    assert.equal(projection.ok, true);
    assert.equal(projection.hasContent, true);
    const snap = projection.projection;
    assert.ok(snap.assessmentSummary);
    assert.ok(snap.reasonForVisit);
    assert.doesNotMatch(JSON.stringify(snap), /INTERNAL_ONLY_OBJECTIVE|INTERNAL_ONLY_ADDITIONAL/);
    assert.equal(Object.prototype.hasOwnProperty.call(snap, "objective_text"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(snap, "consultation_notes"), false);

    const released = await releaseVisitSummary(pool, {
      organizationId: clinic.organizationId,
      encounterId: encounter.id,
      actor: clinic.actor,
      overrides: {
        patientInstructions: "Drink fluids and rest",
        assessmentSummary: "Patient-safe URI summary",
      },
    });
    assert.equal(released.ok, true, JSON.stringify(released));
    const summaryId = released.release.id;

    const again = await releaseVisitSummary(pool, {
      organizationId: clinic.organizationId,
      encounterId: encounter.id,
      actor: clinic.actor,
    });
    assert.equal(again.ok, false);
    assert.equal(again.code, RESULT.ALREADY_RELEASED);

    const ownerView = await getReleasedSummaryForPatient(pool, {
      organizationId: clinic.organizationId,
      patientId: owner.patient.id,
      summaryId,
    });
    assert.equal(ownerView.ok, true);
    assert.equal(ownerView.release.snapshot.assessmentSummary, "Patient-safe URI summary");
    assert.doesNotMatch(
      JSON.stringify(ownerView.release.snapshot),
      /INTERNAL_ONLY|SECRET_INTERNAL_NOTE|consultation_notes|objective_text/
    );
    // reasonForVisit still from signed subjective unless overridden — ensure raw object absent
    assert.ok(!ownerView.release.snapshot.objective_text);

    const crossPatient = await getReleasedSummaryForPatient(pool, {
      organizationId: clinic.organizationId,
      patientId: otherPatient.patient.id,
      summaryId,
    });
    assert.equal(crossPatient.ok, false);
    assert.equal(crossPatient.code, RESULT.NOT_FOUND);

    const crossTenant = await getReleasedSummaryForPatient(pool, {
      organizationId: other.organizationId,
      patientId: owner.patient.id,
      summaryId,
    });
    assert.equal(crossTenant.ok, false);

    // Snapshot stability: mutate underlying signed note text via SQL; patient snapshot unchanged
    await pool.query(
      `UPDATE activeclinic.consultation_notes
          SET assessment_text = 'MUTATED_AFTER_RELEASE_SHOULD_NOT_LEAK'
        WHERE id = $1`,
      [(await pool.query(
        `SELECT id FROM activeclinic.consultation_notes WHERE encounter_id = $1 LIMIT 1`,
        [encounter.id]
      )).rows[0].id]
    );
    const stable = await getReleasedSummaryForPatient(pool, {
      organizationId: clinic.organizationId,
      patientId: owner.patient.id,
      summaryId,
    });
    assert.equal(stable.release.snapshot.assessmentSummary, "Patient-safe URI summary");
    assert.doesNotMatch(
      JSON.stringify(stable.release.snapshot),
      /MUTATED_AFTER_RELEASE/
    );

    const app = appWithEnv();
    const sid = await patientLogin(app, clinic.clinicKey, owner.phone);
    const listHtml = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/visit-summaries`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(listHtml.status, 200);
    assert.match(listHtml.text, /data-ac-batch3="AC-P05"/);
    assert.match(listHtml.text, /cd4b21d6860843c6b6862f92326857af/);
    assert.match(listHtml.text, /5df55128997f4b9b916852f26b972bb5/);
    assert.ok(listHtml.text.includes(`ac-patient.css?v=${PATIENT_ASSET_VERSION}`));

    const detailHtml = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/visit-summaries/${summaryId}`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(detailHtml.status, 200);
    assert.match(detailHtml.text, /Patient-safe URI summary/);
    assert.match(detailHtml.text, /Drink fluids and rest/);
    assert.doesNotMatch(detailHtml.text, /INTERNAL_ONLY|MUTATED_AFTER_RELEASE|SECRET_INTERNAL_NOTE/);

    const forgedHtml = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/visit-summaries/${crypto.randomUUID()}`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(forgedHtml.status, 404);

    const otherSid = await patientLogin(app, clinic.clinicKey, otherPatient.phone);
    const deniedHtml = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/visit-summaries/${summaryId}`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${otherSid}`);
    assert.equal(deniedHtml.status, 404);
  });

  it("staff release requires visit_summary.release; facility admin denied", async () => {
    requireDb();
    const clinic = await provisionClinic("clin", [RECEPTIONIST, CLINICIAN]);
    const owner = await seedPortalPatient(clinic, "Rel", "Auth");
    const { encounter } = await signedEncounter(clinic, owner.patient.id);

    // Facility admin on same facility — no visit_summary.release
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

    const app = appWithEnv();
    const clinCookie = await sessionCookie(clinic.identityId, clinic.organizationId);
    const adminCookie = await sessionCookie(
      adminIdentity.identity.id,
      clinic.organizationId
    );

    const preview = await request(app)
      .get(`/app/clinical/encounter/${encounter.id}/visit-summary/release`)
      .set("Cookie", clinCookie);
    assert.equal(preview.status, 200);
    assert.match(preview.text, /data-ac-batch3="AC-P05"/);
    assert.match(preview.text, /Release to Patient/);

    const { cookie, csrf } = withCsrf(clinCookie);
    const releasePost = await request(app)
      .post(`/app/clinical/encounter/${encounter.id}/visit-summary/release`)
      .set("Cookie", cookie)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        assessment_summary: "Released via clinician UI",
        patient_instructions: "Rest",
        reason_for_visit: "Cough",
        care_provided: "Supportive care",
      });
    assert.ok([302, 303].includes(releasePost.status), String(releasePost.status));

    const adminPreview = await request(app)
      .get(`/app/clinical/encounter/${encounter.id}/visit-summary/release`)
      .set("Cookie", adminCookie);
    assert.equal(adminPreview.status, 403);
    assert.match(adminPreview.text, /do not have access|permission/i);
  });

  it("AC-P03/P04 show Visit Summary link only when a release exists", async () => {
    requireDb();
    const clinic = await provisionClinic("book", [RECEPTIONIST, CLINICIAN]);
    const owner = await seedPortalPatient(clinic, "Book", "Link");
    const preferredStartsAt = "2030-08-15T09:00:00Z";
    const booking = await createConsultationBookingRequest(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: "Book",
      patientLastName: "Link",
      patientPhone: owner.phone,
      preferredStartsAt,
      timezone: "Africa/Lusaka",
    });
    assert.equal(booking.ok, true, JSON.stringify(booking));
    await pool.query(
      `UPDATE activeclinic.public_booking_requests
          SET patient_id = $1,
              portal_platform_identity_id = $2,
              patient_link_status = 'linked',
              patient_linked_at = now()
        WHERE id = $3`,
      [owner.patient.id, owner.identityId, booking.booking.id]
    );

    const app = appWithEnv();
    const sid = await patientLogin(app, clinic.clinicKey, owner.phone);
    const bookingsBefore = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(bookingsBefore.status, 200);
    assert.doesNotMatch(bookingsBefore.text, /data-ac-action="view-visit-summary"/);

    const detailBefore = await request(app)
      .get(
        `/clinics/${clinic.clinicKey}/patient/bookings/${encodeURIComponent(
          booking.booking.requestNumber || booking.booking.id
        )}`
      )
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(detailBefore.status, 200);
    assert.doesNotMatch(detailBefore.text, /data-ac-action="view-visit-summary"/);

    const { encounter } = await signedEncounter(clinic, owner.patient.id);
    // Align snapshot visitDate with booking preferred date via override
    const released = await releaseVisitSummary(pool, {
      organizationId: clinic.organizationId,
      encounterId: encounter.id,
      actor: clinic.actor,
      overrides: {
        visitDate: "2030-08-15",
        assessmentSummary: "Booking-linked summary",
        patientInstructions: "See booking",
      },
    });
    assert.equal(released.ok, true, JSON.stringify(released));

    const linked = await findReleaseLinkedToBooking(pool, {
      organizationId: clinic.organizationId,
      patientId: owner.patient.id,
      preferredStartsAt,
    });
    assert.equal(linked.ok, true);
    assert.ok(linked.release);
    assert.equal(linked.release.id, released.release.id);

    const bookingsAfter = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.match(bookingsAfter.text, /data-ac-action="view-visit-summary"/);
    assert.match(
      bookingsAfter.text,
      new RegExp(`/patient/visit-summaries/${released.release.id}`)
    );

    const detailAfter = await request(app)
      .get(
        `/clinics/${clinic.clinicKey}/patient/bookings/${encodeURIComponent(
          booking.booking.requestNumber || booking.booking.id
        )}`
      )
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.match(detailAfter.text, /data-ac-action="view-visit-summary"/);
  });

  it("permission key is activeclinic.visit_summary.release", () => {
    assert.equal(PERM.RELEASE, "activeclinic.visit_summary.release");
  });
});
