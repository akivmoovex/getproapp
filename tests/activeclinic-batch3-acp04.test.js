"use strict";

/**
 * V2.03 Batch 3 — AC-P04 Appointment Detail & Reschedule leaf UI.
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
const DETAIL = path.join(ROOT, "views", "activeclinic", "patient", "booking-detail.ejs");
const STAFF_PASSWORD = "DemoStaff-ActiveClinic-2026A";
const PATIENT_PASSWORD = "PortalPass1!";

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 982200000;

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
    organizationKey: `ac_b3d_${stamp}`,
    displayName: "B3 Detail Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-b3d-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true);
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "B3 Detail Legal",
    publicName: "B3 Detail Clinic",
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
    clinicKey: `ac_b3d_${stamp}`,
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
    firstName: "Detail",
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

describe("V2.03 Batch 3 AC-P04 booking detail leaf", () => {
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

  it("leaf view carries Batch 3 Stitch markers and omits demo-only slot calendar", () => {
    const html = fs.readFileSync(DETAIL, "utf8");
    assert.match(html, /data-ac-batch3="AC-P04"/);
    assert.match(html, /497d0c05f6f241f981d07b47be7c7606/);
    assert.match(html, /0af4b000cec2477389a576b11b33cba0/);
    assert.match(html, /Appointment Details/);
    assert.match(html, /data-ac-booking-reschedule/);
    assert.match(html, /data-ac-booking-cancel/);
    assert.doesNotMatch(html, /Garage P2|Fast Check-in|patient reviews|Summary PDF/);

    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-patient.css"), "utf8");
    assert.match(css, /\.acp-portal-leaf--booking-detail/);
    assert.match(css, /@media \(max-width:\s*390px\)[\s\S]*\.acp-portal-leaf--booking-detail/);
  });

  it("AC-P04 renders owned booking detail and accepts reschedule request", async () => {
    requireDb();
    resetDeploymentProfileWarningsForTests();
    const stamp = `${Date.now().toString(36)}d`;
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
        firstName: "Detail",
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

    const booking = await createConsultationBookingRequest(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: "Detail",
      patientLastName: "Owner",
      patientPhone: phone,
      preferredStartsAt: "2030-08-01T10:00:00Z",
      timezone: "Africa/Lusaka",
    });
    assert.equal(booking.ok, true, JSON.stringify(booking));
    await pool.query(
      `UPDATE activeclinic.public_booking_requests
          SET patient_id = $1,
              portal_platform_identity_id = $2,
              patient_link_status = 'linked',
              patient_linked_at = now(),
              status = 'confirmed'
        WHERE id = $3`,
      [patient.patient.id, identity.identity.id, booking.booking.id]
    );

    const ref = booking.booking.requestNumber || booking.booking.id;
    const app = appWithEnv();
    const loginPage = await request(app).get(`/clinics/${clinic.clinicKey}/patient/login`);
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
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);

    const detail = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings/${ref}`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-batch3="AC-P04"/);
    assert.match(detail.text, /Appointment Details/);
    assert.match(detail.text, new RegExp(String(ref)));
    assert.match(detail.text, /ac-patient\.css\?v=v2-03-b3-acp04-01/);
    assert.match(detail.text, /data-ac-booking-reschedule/);

    const csrf2 = extractCookie(detail, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const reschedule = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/bookings/${ref}/reschedule`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .redirects(0)
      .send({
        [CSRF_FIELD]: csrf2,
        preferredStartsAt: "2030-08-15T11:00",
        reason: "Travel conflict",
      });
    assert.ok([302, 303].includes(reschedule.status), String(reschedule.status));

    const foreign = await request(app)
      .get(`/clinics/${other.clinicKey}/patient/bookings/${ref}`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.ok([302, 303, 401, 403, 404].includes(foreign.status));
  });
});
