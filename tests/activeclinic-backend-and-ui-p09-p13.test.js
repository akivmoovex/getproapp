"use strict";

/**
 * ActiveClinic BACKEND_AND_UI batch — AC-P09…P13 portal missing functionality.
 * Ownership: own succeeds; other patient / other tenant → 404 not-found (no leak).
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
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createActiveClinicFoundationApp,
} = require("../src/activeclinic/http/activeClinicFoundationServer");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  COOKIE_ACTIVECLINIC_ORG,
  CSRF_COOKIE_ACTIVECLINIC_ORG,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const { CSRF_FIELD } = require("../src/platform/http/v5Csrf");
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
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  RECEPTIONIST,
  BILLING_OFFICER,
  CLINICIAN,
  PHARMACIST,
  LAB_TECHNICIAN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  createPatientCharge,
  createInvoice,
  postInvoice,
  RESULT: BILLING_RESULT,
} = require("../src/activeclinic/services/activeClinicBillingService");
const {
  createClinicalFollowUpItem,
} = require("../src/activeclinic/services/activeClinicClinicalFollowUpService");
const {
  addMedication,
  createPharmacyPrescription,
} = require("../src/activeclinic/services/activeClinicPharmacyService");
const {
  startEncounter,
} = require("../src/activeclinic/services/activeClinicClinicalService");
const {
  releaseLaboratoryResult,
} = require("../src/activeclinic/services/activeClinicDiagnosticsService");
const {
  listPatientReleasedResults,
} = require("../src/activeclinic/services/activeClinicPatientPortalClinicalReadService");

const ROOT = path.join(__dirname, "..");
const PATIENT_PASSWORD = "PortalPass1!";
const STAFF_PASSWORD = "DemoStaff-ActiveClinic-2026A";

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 991100000;

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

async function seedPublishedClinic(stamp) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `ac_bui_${stamp}`,
    displayName: "BUI Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-bui-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "BUI Legal",
    publicName: "BUI Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  await pool.query(
    `UPDATE activeclinic.healthcare_organizations
     SET website_published = true, public_booking_enabled = true
     WHERE id = $1`,
    [hco.healthcareOrganization.id]
  );
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main",
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
    clinicKey: `ac_bui_${stamp}`,
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(clinic, roleKey, label) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `${label}.${phone.slice(-8)}@example.test`,
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: STAFF_PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: clinic.orgId,
    healthcareOrganizationId: clinic.hcoId,
    firstName: label,
    lastName: "Staff",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: label,
  });
  assert.equal(staff.ok, true);
  await assignStaffToFacility(pool, {
    organizationId: clinic.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: clinic.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: clinic.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey,
    scopeType: "facility",
    facilityId: clinic.facilityId,
    assignmentOrigin: "system",
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  return {
    identityId: identity.identity.id,
    staffMemberId: staff.staffMember.id,
  };
}

async function seedPortalPatient(clinic, receptionist, name) {
  const phone = nextPhone();
  const patient = await registerActiveClinicPatient(pool, {
    organizationId: clinic.orgId,
    healthcareOrganizationId: clinic.hcoId,
    facilityId: clinic.facilityId,
    actor: {
      staffMemberId: receptionist.staffMemberId,
      platformIdentityId: receptionist.identityId,
      organizationId: clinic.orgId,
    },
    demographics: {
      firstName: name.first,
      lastName: name.last,
      dateOfBirth: "1990-01-01",
      sexAtRegistration: "female",
    },
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
  assert.equal(identity.ok, true);
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

async function loginPatient(app, clinicKey, phone) {
  const loginGet = await request(app).get(
    `/clinics/${encodeURIComponent(clinicKey)}/patient/login`
  );
  const csrf = extractCookie(loginGet, CSRF_COOKIE_ACTIVECLINIC_ORG);
  const login = await request(app)
    .post(`/clinics/${encodeURIComponent(clinicKey)}/patient/login`)
    .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
    .type("form")
    .send({
      [CSRF_FIELD]: csrf,
      identifier: phone,
      password: PATIENT_PASSWORD,
    });
  assert.ok([302, 303].includes(login.status), `login status ${login.status}`);
  const session = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
  assert.ok(session, "missing patient session");
  return `${COOKIE_ACTIVECLINIC_ORG}=${session}`;
}

describe("ActiveClinic BACKEND_AND_UI AC-P09…P13", () => {
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

  it("AC-P09 preferences persist; clinical consent boundary preserved", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}p09`;
    const clinic = await seedPublishedClinic(stamp);
    const receptionist = await seedStaff(clinic, RECEPTIONIST, "Recv09");
    const portal = await seedPortalPatient(clinic, receptionist, {
      first: "Pref",
      last: "Owner",
    });
    const app = appWithEnv();
    const cookie = await loginPatient(app, clinic.clinicKey, portal.phone);

    const get1 = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", cookie);
    assert.equal(get1.status, 200);
    assert.match(get1.text, /data-ac-batch3="AC-P09"/);
    assert.match(get1.text, /data-ac-notification-prefs="1"/);
    assert.match(get1.text, /data-ac-clinical-consent-boundary="1"/);
    assert.match(get1.text, /Clinical \/ treatment consent/);

    const csrf = extractCookie(get1, CSRF_COOKIE_ACTIVECLINIC_ORG) ||
      extractCookie(
        await request(app).get(`/clinics/${clinic.clinicKey}/patient/notifications`).set("Cookie", cookie),
        CSRF_COOKIE_ACTIVECLINIC_ORG
      );
    // Re-fetch page to obtain CSRF cookie + token for POST
    const prefPage = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", cookie);
    const csrfCookie = extractCookie(prefPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const token =
      (prefPage.text.match(/name="_csrf" value="([^"]+)"/) || [])[1] || csrfCookie;
    const post = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: token,
        email_booking_updates: "1",
        sms_booking_updates: "1",
        in_app_booking_updates: "1",
        in_app_administrative_reminders: "1",
      });
    assert.equal(post.status, 200, post.text.slice(0, 400));
    assert.match(post.text, /data-ac-prefs-saved="1"/);
    assert.match(post.text, /Communication preferences saved/);
    assert.match(post.text, /name="email_booking_updates"[^>]*checked/);

    const getFake = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/notifications?saved=1`)
      .set("Cookie", cookie);
    assert.equal(getFake.status, 200);
    assert.doesNotMatch(getFake.text, /data-ac-prefs-saved="1"/);

    const stored = await pool.query(
      `SELECT channel, purpose_key, opted_in
         FROM platform.communication_preferences
        WHERE organization_id = $1
          AND subject_kind = 'patient'
          AND subject_ref = $2
          AND channel = 'email'
          AND purpose_key = 'booking_updates'`,
      [clinic.orgId, portal.patient.id]
    );
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].opted_in, true);

    const consents = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.patient_consents WHERE patient_id = $1`,
      [portal.patient.id]
    );
    assert.equal(consents.rows[0].n, 0);
  });

  it("AC-P10 / AC-P11 prescriptions and referrals are own-only read-only", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}p1011`;
    const clinicA = await seedPublishedClinic(stamp);
    const clinicB = await seedPublishedClinic(`${stamp}b`);
    const recvA = await seedStaff(clinicA, RECEPTIONIST, "RecvA");
    const recvB = await seedStaff(clinicB, RECEPTIONIST, "RecvB");
    const pharm = await seedStaff(clinicA, PHARMACIST, "Pharm");
    const clin = await seedStaff(clinicA, CLINICIAN, "Clin");
    const owner = await seedPortalPatient(clinicA, recvA, {
      first: "Rx",
      last: "Owner",
    });
    const other = await seedPortalPatient(clinicA, recvA, {
      first: "Rx",
      last: "Other",
    });
    const foreign = await seedPortalPatient(clinicB, recvB, {
      first: "Rx",
      last: "Foreign",
    });

    const med = await addMedication(pool, {
      staffId: pharm.staffMemberId,
      organizationId: clinicA.orgId,
      healthcareOrganizationId: clinicA.hcoId,
      genericName: "Amoxicillin",
      strength: "250mg",
      dosageForm: "capsule",
      unitOfMeasure: "capsule",
    });
    assert.equal(med.ok, true, JSON.stringify(med));

    const rxOwn = await createPharmacyPrescription(pool, {
      staffId: pharm.staffMemberId,
      organizationId: clinicA.orgId,
      healthcareOrganizationId: clinicA.hcoId,
      facilityId: clinicA.facilityId,
      patientId: owner.patient.id,
      prescriberStaffId: clin.staffMemberId,
      items: [
        {
          medicationCatalogueItemId: med.medication.id,
          quantityOrdered: 10,
          dosageInstructions: "Take one capsule three times daily",
        },
      ],
    });
    assert.equal(rxOwn.ok, true, JSON.stringify(rxOwn));

    const rxOther = await createPharmacyPrescription(pool, {
      staffId: pharm.staffMemberId,
      organizationId: clinicA.orgId,
      healthcareOrganizationId: clinicA.hcoId,
      facilityId: clinicA.facilityId,
      patientId: other.patient.id,
      prescriberStaffId: clin.staffMemberId,
      items: [
        {
          medicationCatalogueItemId: med.medication.id,
          quantityOrdered: 5,
          dosageInstructions: "Other patient only",
        },
      ],
    });
    assert.equal(rxOther.ok, true);

    const refOwn = await createClinicalFollowUpItem(pool, {
      organizationId: clinicA.orgId,
      healthcareOrganizationId: clinicA.hcoId,
      facilityId: clinicA.facilityId,
      patientId: owner.patient.id,
      itemType: "pending_referral",
      title: "Orthopedic referral",
      reason: "Knee pain review",
      actor: {
        staffMemberId: clin.staffMemberId,
        platformIdentityId: clin.identityId,
      },
    });
    assert.equal(refOwn.ok, true, JSON.stringify(refOwn));

    const refOther = await createClinicalFollowUpItem(pool, {
      organizationId: clinicA.orgId,
      healthcareOrganizationId: clinicA.hcoId,
      facilityId: clinicA.facilityId,
      patientId: other.patient.id,
      itemType: "pending_referral",
      title: "Secret other referral",
      reason: "Must not leak",
      actor: {
        staffMemberId: clin.staffMemberId,
        platformIdentityId: clin.identityId,
      },
    });
    assert.equal(refOther.ok, true);

    const app = appWithEnv();
    const cookie = await loginPatient(app, clinicA.clinicKey, owner.phone);

    const rxList = await request(app)
      .get(`/clinics/${clinicA.clinicKey}/patient/prescriptions`)
      .set("Cookie", cookie);
    assert.equal(rxList.status, 200);
    assert.match(rxList.text, /data-ac-batch3="AC-P10"/);
    assert.match(rxList.text, new RegExp(rxOwn.prescription.prescriptionNumber));
    assert.doesNotMatch(
      rxList.text,
      new RegExp(rxOther.prescription.prescriptionNumber)
    );
    assert.doesNotMatch(rxList.text, /Order refill|Start prescribing|data-ac-pharmacy-dispense|data-ac-prescribe/i);

    const rxDetail = await request(app)
      .get(
        `/clinics/${clinicA.clinicKey}/patient/prescriptions/${rxOwn.prescription.id}`
      )
      .set("Cookie", cookie);
    assert.equal(rxDetail.status, 200);
    assert.match(rxDetail.text, /Amoxicillin/);
    assert.match(rxDetail.text, /data-ac-rx-readonly="1"/);

    const rxDenied = await request(app)
      .get(
        `/clinics/${clinicA.clinicKey}/patient/prescriptions/${rxOther.prescription.id}`
      )
      .set("Cookie", cookie);
    assert.equal(rxDenied.status, 404);
    assert.doesNotMatch(rxDenied.text, /Other patient only|Amoxicillin/);

    const refList = await request(app)
      .get(`/clinics/${clinicA.clinicKey}/patient/referrals`)
      .set("Cookie", cookie);
    assert.equal(refList.status, 200);
    assert.match(refList.text, /data-ac-batch3="AC-P11"/);
    assert.match(refList.text, /Orthopedic referral/);
    assert.doesNotMatch(refList.text, /Secret other referral/);
    assert.doesNotMatch(refList.text, /owner_staff|originating_staff/i);

    const refDetail = await request(app)
      .get(`/clinics/${clinicA.clinicKey}/patient/referrals/${refOwn.item.id}`)
      .set("Cookie", cookie);
    assert.equal(refDetail.status, 200);
    assert.match(refDetail.text, /Knee pain review/);

    const refDenied = await request(app)
      .get(
        `/clinics/${clinicA.clinicKey}/patient/referrals/${refOther.item.id}`
      )
      .set("Cookie", cookie);
    assert.equal(refDenied.status, 404);
    assert.doesNotMatch(refDenied.text, /Secret other referral|Must not leak/);

    const cookieB = await loginPatient(app, clinicB.clinicKey, foreign.phone);
    const cross = await request(app)
      .get(
        `/clinics/${clinicB.clinicKey}/patient/prescriptions/${rxOwn.prescription.id}`
      )
      .set("Cookie", cookieB);
    assert.equal(cross.status, 404);
    assert.doesNotMatch(
      cross.text,
      new RegExp(rxOwn.prescription.prescriptionNumber)
    );
  });

  it("AC-P12 released results only; staff release authz; unreleased never listed", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}p12`;
    const clinic = await seedPublishedClinic(stamp);
    const receptionist = await seedStaff(clinic, RECEPTIONIST, "Recv12");
    const clinician = await seedStaff(clinic, CLINICIAN, "Clin12");
    const labTech = await seedStaff(clinic, LAB_TECHNICIAN, "Lab12");
    const owner = await seedPortalPatient(clinic, receptionist, {
      first: "Lab",
      last: "Owner",
    });
    const other = await seedPortalPatient(clinic, receptionist, {
      first: "Lab",
      last: "Other",
    });

    const enc = await startEncounter(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: owner.patient.id,
      actor: {
        staffMemberId: clinician.staffMemberId,
        platformIdentityId: clinician.identityId,
      },
    });
    assert.equal(enc.ok, true, JSON.stringify(enc));

    const order = await pool.query(
      `INSERT INTO activeclinic.clinical_orders (
         organization_id, healthcare_organization_id, facility_id, encounter_id,
         patient_id, order_type, status, ordered_by_staff_id, submitted_at
       ) VALUES ($1,$2,$3,$4,$5,'laboratory','submitted',$6,now())
       RETURNING id`,
      [
        clinic.orgId,
        clinic.hcoId,
        clinic.facilityId,
        enc.encounter.id,
        owner.patient.id,
        clinician.staffMemberId,
      ]
    );

    const reqRow = await pool.query(
      `INSERT INTO activeclinic.laboratory_requests (
         organization_id, healthcare_organization_id, facility_id, clinical_order_id,
         encounter_id, patient_id, request_number, test_panel_name, status,
         requested_by_staff_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'verified',$9)
       RETURNING id`,
      [
        clinic.orgId,
        clinic.hcoId,
        clinic.facilityId,
        order.rows[0].id,
        enc.encounter.id,
        owner.patient.id,
        `LAB-${stamp}`,
        "Full blood count",
        clinician.staffMemberId,
      ]
    );

    const verified = await pool.query(
      `INSERT INTO activeclinic.laboratory_results (
         organization_id, healthcare_organization_id, facility_id,
         laboratory_request_id, patient_id, result_summary, status,
         entered_by_staff_id, verified_by_staff_id, verified_at, resulted_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'verified',$7,$7,now(),now())
       RETURNING id`,
      [
        clinic.orgId,
        clinic.hcoId,
        clinic.facilityId,
        reqRow.rows[0].id,
        owner.patient.id,
        "Hb within reference range",
        labTech.staffMemberId,
      ]
    );
    const verifiedId = verified.rows[0].id;

    const listedBefore = await listPatientReleasedResults(pool, {
      organizationId: clinic.orgId,
      patientId: owner.patient.id,
    });
    assert.equal(listedBefore.ok, true);
    assert.equal(listedBefore.results.length, 0);

    const deniedRelease = await releaseLaboratoryResult(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      laboratoryResultId: verifiedId,
      facilityId: clinic.facilityId,
      actor: {
        staffId: receptionist.staffMemberId,
        platformIdentityId: receptionist.identityId,
      },
    });
    assert.equal(deniedRelease.ok, false);
    assert.equal(deniedRelease.code, "ACCESS_DENIED");

    const released = await releaseLaboratoryResult(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      laboratoryResultId: verifiedId,
      facilityId: clinic.facilityId,
      actor: {
        staffId: labTech.staffMemberId,
        platformIdentityId: labTech.identityId,
      },
    });
    assert.equal(released.ok, true, JSON.stringify(released));

    const app = appWithEnv();
    const cookie = await loginPatient(app, clinic.clinicKey, owner.phone);
    const docs = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/documents`)
      .set("Cookie", cookie);
    assert.equal(docs.status, 200);
    assert.match(docs.text, /data-ac-batch3="AC-P12"/);
    assert.match(docs.text, /Full blood count/);

    const detail = await request(app)
      .get(
        `/clinics/${clinic.clinicKey}/patient/documents/laboratory/${verifiedId}`
      )
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-released-result="1"/);
    assert.match(detail.text, /Hb within reference range/);

    const cookieOther = await loginPatient(app, clinic.clinicKey, other.phone);
    const leak = await request(app)
      .get(
        `/clinics/${clinic.clinicKey}/patient/documents/laboratory/${verifiedId}`
      )
      .set("Cookie", cookieOther);
    assert.equal(leak.status, 404);
    assert.doesNotMatch(leak.text, /Full blood count|Hb within/);
  });

  it("AC-P13 invoice detail ownership and no finance notes leak", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}p13`;
    const clinic = await seedPublishedClinic(stamp);
    const otherClinic = await seedPublishedClinic(`${stamp}x`);
    const receptionist = await seedStaff(clinic, RECEPTIONIST, "Recv13");
    const billing = await seedStaff(clinic, BILLING_OFFICER, "Bill13");
    const otherRecv = await seedStaff(otherClinic, RECEPTIONIST, "RecvX");
    const owner = await seedPortalPatient(clinic, receptionist, {
      first: "Inv",
      last: "Owner",
    });
    const other = await seedPortalPatient(clinic, receptionist, {
      first: "Inv",
      last: "Other",
    });
    const foreign = await seedPortalPatient(otherClinic, otherRecv, {
      first: "Inv",
      last: "Foreign",
    });

    const charge = await createPatientCharge({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      patientId: owner.patient.id,
      chargeType: "consultation",
      description: "Detail consult line",
      unitAmountMinor: 15000,
      quantity: 1,
    });
    assert.equal(charge.result, BILLING_RESULT.CREATED);
    const invoice = await createInvoice({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      patientId: owner.patient.id,
      chargeIds: [charge.charge.id],
      notes: "INTERNAL FINANCE NOTE DO NOT SHOW",
    });
    assert.equal(invoice.result, BILLING_RESULT.CREATED, JSON.stringify(invoice));
    const posted = await postInvoice({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      invoiceId: invoice.invoice.id,
    });
    assert.equal(posted.result, BILLING_RESULT.OK, JSON.stringify(posted));

    const otherCharge = await createPatientCharge({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      patientId: other.patient.id,
      chargeType: "consultation",
      description: "Other patient invoice",
      unitAmountMinor: 9000,
      quantity: 1,
    });
    const otherInv = await createInvoice({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      patientId: other.patient.id,
      chargeIds: [otherCharge.charge.id],
    });
    await postInvoice({
      pool,
      tenantId: clinic.orgId,
      facilityId: clinic.facilityId,
      staffId: billing.staffMemberId,
      invoiceId: otherInv.invoice.id,
    });

    const app = appWithEnv();
    const cookie = await loginPatient(app, clinic.clinicKey, owner.phone);

    const list = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/invoices`)
      .set("Cookie", cookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-invoice-link="1"/);

    const detail = await request(app)
      .get(
        `/clinics/${clinic.clinicKey}/patient/invoices/${invoice.invoice.id}`
      )
      .set("Cookie", cookie);
    assert.equal(detail.status, 200, detail.text.slice(0, 400));
    assert.match(detail.text, /data-ac-batch3="AC-P13"/);
    assert.match(detail.text, /Detail consult line/);
    assert.doesNotMatch(detail.text, /INTERNAL FINANCE NOTE/);
    assert.doesNotMatch(detail.text, /Collect payment|Open cashier/i);
    assert.match(detail.text, /Medicare API claims are not shown|Medicare live claims are not available/i);

    const denied = await request(app)
      .get(
        `/clinics/${clinic.clinicKey}/patient/invoices/${otherInv.invoice.id}`
      )
      .set("Cookie", cookie);
    assert.equal(denied.status, 404);
    assert.doesNotMatch(denied.text, /Other patient invoice/);

    const missing = await request(app)
      .get(
        `/clinics/${clinic.clinicKey}/patient/invoices/00000000-0000-4000-8000-000000000099`
      )
      .set("Cookie", cookie);
    assert.equal(missing.status, 404);

    const cookieF = await loginPatient(app, otherClinic.clinicKey, foreign.phone);
    const cross = await request(app)
      .get(
        `/clinics/${otherClinic.clinicKey}/patient/invoices/${invoice.invoice.id}`
      )
      .set("Cookie", cookieF);
    assert.equal(cross.status, 404);
    assert.doesNotMatch(cross.text, /Detail consult line/);
  });

  it("views and nav markers exist for P09–P13", () => {
    const nav = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/partials/patient-nav.ejs"),
      "utf8"
    );
    assert.match(nav, /\/patient\/prescriptions/);
    assert.match(nav, /\/patient\/referrals/);
    assert.match(nav, /\/patient\/documents/);
    for (const f of [
      "notifications.ejs",
      "prescriptions.ejs",
      "referrals.ejs",
      "documents.ejs",
      "invoice-detail.ejs",
    ]) {
      assert.ok(
        fs.existsSync(path.join(ROOT, "views/activeclinic/patient", f)),
        f
      );
    }
  });
});
