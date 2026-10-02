"use strict";

/**
 * AC-SEC-01 — Patient portal consent/communication preferences security.
 * Mode: EXISTING_STORE (platform.communication_preferences).
 * Clinical consent remains staff-authoritative (ACN11); portal does not write it.
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
} = require("../src/activeclinic/services/activeClinicAuthorizationService");

const ROOT = path.join(__dirname, "..");
const PATIENT_PASSWORD = "PortalPass1!";
const STAFF_PASSWORD = "DemoStaff-ActiveClinic-2026A";

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 992200000;

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
    organizationKey: `ac_sec01_${stamp}`,
    displayName: "SEC01 Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-sec01-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "SEC01 Legal",
    publicName: "SEC01 Clinic",
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
    clinicKey: `ac_sec01_${stamp}`,
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(clinic, label) {
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
    roleKey: RECEPTIONIST,
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
  assert.ok([302, 303].includes(login.status), `login ${login.status}`);
  const session = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
  assert.ok(session);
  return `${COOKIE_ACTIVECLINIC_ORG}=${session}`;
}

describe("AC-SEC-01 portal communication preferences (EXISTING_STORE)", () => {
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

  it("A: authenticated patient renders existing-store prefs page", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}a`;
    const clinic = await seedPublishedClinic(stamp);
    const staff = await seedStaff(clinic, "RecvA");
    const portal = await seedPortalPatient(clinic, staff, {
      first: "Sec",
      last: "Alpha",
    });
    const app = appWithEnv();
    const cookie = await loginPatient(app, clinic.clinicKey, portal.phone);
    const res = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", cookie);
    assert.equal(res.status, 200);
    assert.match(res.text, /data-ac-sec="AC-SEC-01"/);
    assert.match(res.text, /data-ac-prefs-mode="existing_store"/);
    assert.match(res.text, /data-ac-prefs-authoritative="1"/);
    assert.match(res.text, /data-ac-clinical-consent-info="1"/);
    assert.match(res.text, /data-ac-communication-prefs-info="1"/);
    assert.match(res.text, /data-ac-prefs-save="1"/);
    assert.match(res.text, /cannot grant, withdraw, or change clinical consent/i);
  });

  it("B: unauthenticated access is denied/redirected", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}b`;
    const clinic = await seedPublishedClinic(stamp);
    const app = appWithEnv();
    const res = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/notifications`
    );
    assert.ok([302, 303, 401, 403].includes(res.status), String(res.status));
    assert.doesNotMatch(res.text, /data-ac-prefs-save="1"/);
  });

  it("C: patient cannot use another tenant clinic context", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}c`;
    const clinicA = await seedPublishedClinic(stamp);
    const clinicB = await seedPublishedClinic(`${stamp}b`);
    const staffA = await seedStaff(clinicA, "RecvCA");
    const portalA = await seedPortalPatient(clinicA, staffA, {
      first: "Tenant",
      last: "A",
    });
    const app = appWithEnv();
    const cookieA = await loginPatient(app, clinicA.clinicKey, portalA.phone);

    const cross = await request(app)
      .get(`/clinics/${clinicB.clinicKey}/patient/notifications`)
      .set("Cookie", cookieA);
    assert.ok(
      [302, 303, 401, 403, 404].includes(cross.status),
      `cross status ${cross.status}`
    );
    assert.doesNotMatch(cross.text, /data-ac-prefs-authoritative="1"/);
  });

  it("D/E/F: no fake success; save persists via existing store and reloads", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}f`;
    const clinic = await seedPublishedClinic(stamp);
    const staff = await seedStaff(clinic, "RecvF");
    const portal = await seedPortalPatient(clinic, staff, {
      first: "Persist",
      last: "Owner",
    });
    const app = appWithEnv();
    const cookie = await loginPatient(app, clinic.clinicKey, portal.phone);

    const fakeGet = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/notifications?saved=1`)
      .set("Cookie", cookie);
    assert.equal(fakeGet.status, 200);
    assert.doesNotMatch(fakeGet.text, /data-ac-prefs-saved="1"/);
    assert.doesNotMatch(fakeGet.text, /Preferences saved\./);

    const page = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", cookie);
    const csrfCookie = extractCookie(page, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const token =
      (page.text.match(/name="_csrf" value="([^"]+)"/) || [])[1] || csrfCookie;

    const forged = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrfCookie}`)
      .type("form")
      .send({
        [CSRF_FIELD]: token,
        email_booking_updates: "1",
        patient_id: "00000000-0000-4000-8000-000000000099",
        organization_id: "00000000-0000-4000-8000-000000000098",
      });
    assert.equal(forged.status, 400);
    assert.doesNotMatch(forged.text, /data-ac-prefs-saved="1"/);

    const page2 = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", cookie);
    const csrf2 = extractCookie(page2, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const token2 =
      (page2.text.match(/name="_csrf" value="([^"]+)"/) || [])[1] || csrf2;

    const saved = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: token2,
        email_booking_updates: "1",
        sms_administrative_reminders: "1",
        in_app_booking_updates: "1",
        in_app_administrative_reminders: "1",
      });
    assert.equal(saved.status, 200);
    assert.match(saved.text, /data-ac-prefs-saved="1"/);
    assert.match(saved.text, /Communication preferences saved/);
    assert.match(saved.text, /name="email_booking_updates"[^>]*checked/);

    const rows = await pool.query(
      `SELECT channel, purpose_key, opted_in, organization_id, subject_ref
         FROM platform.communication_preferences
        WHERE organization_id = $1
          AND product_code = 'activeclinic'
          AND subject_kind = 'patient'
          AND subject_ref = $2`,
      [clinic.orgId, portal.patient.id]
    );
    assert.ok(rows.rows.length >= 1);
    assert.ok(
      rows.rows.some(
        (r) =>
          r.channel === "email" &&
          r.purpose_key === "booking_updates" &&
          r.opted_in === true
      )
    );
    assert.ok(rows.rows.every((r) => String(r.organization_id) === clinic.orgId));
    assert.ok(
      rows.rows.every((r) => String(r.subject_ref) === String(portal.patient.id))
    );

    const consents = await pool.query(
      `SELECT COUNT(*)::int AS n FROM activeclinic.patient_consents WHERE patient_id = $1`,
      [portal.patient.id]
    );
    assert.equal(consents.rows[0].n, 0);

    const reload = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/notifications`)
      .set("Cookie", cookie);
    assert.equal(reload.status, 200);
    assert.match(reload.text, /name="email_booking_updates"[^>]*checked/);
    assert.doesNotMatch(reload.text, /data-ac-prefs-saved="1"/);
  });

  it("view markers document EXISTING_STORE mode (no new schema)", () => {
    const sql = fs.readFileSync(
      path.join(
        ROOT,
        "db/migrations/platform/043_shared_data_jobs_and_preferences.sql"
      ),
      "utf8"
    );
    assert.match(sql, /platform\.communication_preferences/);
    const view = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/patient/notifications.ejs"),
      "utf8"
    );
    assert.match(view, /data-ac-prefs-mode="<%= prefsMode/);
    assert.match(view, /data-ac-clinical-consent-info/);
    assert.match(view, /data-ac-communication-prefs-info/);
    assert.doesNotMatch(view, /CREATE TABLE|new consent engine/i);
  });
});
