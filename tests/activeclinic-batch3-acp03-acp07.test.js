"use strict";

/**
 * V2.03 Batch 3 — AC-P03 My Appointments + AC-P07 Profile leaf UI.
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
  createConsultationBookingRequest,
} = require("../src/activeclinic/services/activeClinicPublicBookingService");
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
const VIEWS = path.join(ROOT, "views", "activeclinic", "patient");
const STAFF_PASSWORD = "DemoStaff-ActiveClinic-2026A";
const PATIENT_PASSWORD = "PortalPass1!";

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 981200000;

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
    organizationKey: `ac_b3p_${stamp}`,
    displayName: "B3 Portal Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-b3p-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "B3 Portal Legal",
    publicName: "B3 Portal Clinic",
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
    clinicKey: `ac_b3p_${stamp}`,
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedReceptionist(clinic) {
  const phone = nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryEmail: `recv.${phone.slice(-8)}@example.test`,
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
    firstName: "Portal",
    lastName: "Reception",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
    jobTitle: "Receptionist",
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

describe("V2.03 Batch 3 AC-P03 / AC-P07 portal leaves", () => {
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

  it("leaf views carry Batch 3 Stitch markers and 390px CSS hooks", () => {
    const bookings = fs.readFileSync(path.join(VIEWS, "bookings.ejs"), "utf8");
    assert.match(bookings, /data-ac-batch3="AC-P03"/);
    assert.match(bookings, /e5bc2a1492da4e1fb675d14c884ec059/);
    assert.match(bookings, /2ea963ee11384dd680b21978b3f56ea1/);
    assert.match(bookings, /data-ac-bookings-mobile/);
    assert.match(bookings, /My Appointments/);

    const profile = fs.readFileSync(path.join(VIEWS, "profile.ejs"), "utf8");
    assert.match(profile, /data-ac-batch3="AC-P07"/);
    assert.match(profile, /e042789d436d48e8843e4bb3f99f379b/);
    assert.match(profile, /c15fcece57e2481cb4d5ff988b325730/);
    assert.match(profile, /data-ac-mf-screen="MF08-05"/);
    assert.match(profile, /preferredContactMethod/);
    assert.match(profile, /addressPostalCode/);
    assert.doesNotMatch(profile, /Emergency Contact Full Name|Preferred Pronouns/);

    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-patient.css"), "utf8");
    assert.match(css, /\.acp-portal-leaf/);
    assert.match(css, /@media \(max-width:\s*390px\)[\s\S]*\.acp-portal-leaf__filters/);
  });

  it("AC-P03/AC-P07 render for linked portal owner and accept profile field updates", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}p`;
    const clinic = await seedPublishedClinic(stamp);
    const other = await seedPublishedClinic(`${stamp}x`);
    const receptionist = await seedReceptionist(clinic);
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
        firstName: "Leaf",
        lastName: "Owner",
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
    assert.equal(identity.ok, true, JSON.stringify(identity));
    const pwd = await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: PATIENT_PASSWORD,
    });
    assert.equal(pwd.ok, true, JSON.stringify(pwd));
    const linked = await linkIdentityToProductProfile(pool, {
      identityId: identity.identity.id,
      productKey: "activeclinic",
      profileType: "activeclinic_patient",
      productProfileId: patient.patient.id,
    });
    assert.equal(linked.ok, true, JSON.stringify(linked));
    await pool.query(
      `UPDATE activeclinic.patients SET platform_identity_id = $1 WHERE id = $2`,
      [identity.identity.id, patient.patient.id]
    );

    const booking = await createConsultationBookingRequest(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: "Leaf",
      patientLastName: "Owner",
      patientPhone: phone,
      preferredStartsAt: "2030-07-01T10:00:00Z",
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
      [patient.patient.id, identity.identity.id, booking.booking.id]
    );

    const app = appWithEnv();
    const loginPage = await request(app).get(`/clinics/${clinic.clinicKey}/patient/login`);
    assert.equal(loginPage.status, 200);
    const csrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const login = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: phone,
        password: PATIENT_PASSWORD,
      });
    assert.ok([200, 302, 303].includes(login.status), String(login.status));
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid, "patient session cookie");

    const bookingsRes = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(bookingsRes.status, 200);
    assert.match(bookingsRes.text, /data-ac-batch3="AC-P03"/);
    assert.match(bookingsRes.text, /My Appointments/);
    assert.match(bookingsRes.text, /ac-patient\.css\?v=v2-03-b3-acp03-07-01/);
    assert.match(
      bookingsRes.text,
      new RegExp(booking.booking.requestNumber || booking.booking.id)
    );

    const profileRes = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/profile`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(profileRes.status, 200);
    assert.match(profileRes.text, /data-ac-batch3="AC-P07"/);
    assert.match(profileRes.text, /data-ac-mf-screen="MF08-05"/);
    assert.match(profileRes.text, /preferredContactMethod/);

    const csrf2 = extractCookie(profileRes, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const national = phone.replace(/^\+260/, "");
    const save = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/profile`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        preferredName: "Leafy",
        email: "leafy@example.test",
        preferredContactMethod: "email",
        addressLine1: "Cairo Road",
        addressCity: "Lusaka",
        addressProvince: "Lusaka",
        addressPostalCode: "10101",
        addressCountryCode: "ZM",
        phone_country: "ZM",
        phone_national: national,
      });
    assert.ok([200, 303].includes(save.status), String(save.status));
    if (save.status === 200) {
      assert.match(save.text, /Leafy|saved|updated|success/i);
    }

    const foreign = await request(app)
      .get(`/clinics/${other.clinicKey}/patient/bookings`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.ok(
      [302, 303, 401, 403, 404].includes(foreign.status) ||
        !String(foreign.text).includes(String(booking.booking.requestNumber || ""))
    );
  });
});
