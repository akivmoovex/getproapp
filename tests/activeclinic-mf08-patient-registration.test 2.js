"use strict";

/**
 * MF08 patient portal registration / profile chrome on the existing identity flow.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const http = require("node:http");
const path = require("path");
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
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  RECEPTIONIST,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createConsultationBookingRequest,
} = require("../src/activeclinic/services/activeClinicPublicBookingService");
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

const ROOT = path.join(__dirname, "..");
const PORTAL_PASSWORD = "PatientPass12";
const STAFF_PASSWORD = "DemoStaff-ActiveClinic-2026A";

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 980000000;

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

function cookieHeader(csrf, sid) {
  const parts = [];
  if (csrf) parts.push(`${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`);
  if (sid) parts.push(`${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
  return parts.join("; ");
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

async function seedPublishedClinic(stamp) {
  const org = await provisionOrg({
    organizationKey: `ac_mf08_${stamp}`,
    displayName: "MF08 Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-mf08-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "MF08 Legal",
    publicName: "MF08 Clinic",
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
    clinicKey: `ac_mf08_${stamp}`,
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
    firstName: "MF08",
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
    phone,
    email: `recv.${phone.slice(-8)}@example.test`,
  };
}

async function seedUnlinkedPatient(clinic, receptionist, demographics) {
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
      firstName: demographics.firstName,
      lastName: demographics.lastName,
      sexAtRegistration: "female",
    },
    contacts: { phone },
    registrationMethod: "walk_in",
  });
  assert.equal(patient.ok, true, JSON.stringify(patient));
  return { phone, patientId: patient.patient.id, firstName: demographics.firstName, lastName: demographics.lastName };
}

describe("ActiveClinic MF08 patient registration chrome", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
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

  function appWithEnv() {
    return createActiveClinicFoundationApp({
      getPool: () => pool,
      env: {
        NODE_ENV: "test",
        PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6,
        SESSION_SECRET: "a".repeat(48),
        DATABASE_URL: databaseUrl,
      },
    });
  }

  it("templates omit OTP, SSO, insurance, and clinical onboarding fields", () => {
    const register = fs.readFileSync(path.join(ROOT, "views/activeclinic/patient/register.ejs"), "utf8");
    const profile = fs.readFileSync(path.join(ROOT, "views/activeclinic/patient/profile.ejs"), "utf8");
    const verify = fs.readFileSync(path.join(ROOT, "views/activeclinic/patient/verify-phone.ejs"), "utf8");
    assert.match(register, /data-ac-mf-family="MF08"/);
    assert.match(register, /Create an account/);
    assert.match(register, /name="firstName"/);
    assert.match(register, /name="lastName"/);
    assert.match(register, /name="guestToken"/);
    assert.doesNotMatch(register, /Sign in with Google|Continue with Google|Sign in with Apple|ClinicBuilder/);
    assert.doesNotMatch(register, /dateOfBirth|date of birth|Biological Sex|Policy \/ Member ID/i);
    assert.match(profile, /data-ac-mf-screen="MF08-05"/);
    assert.doesNotMatch(profile, /Health Insurance|Biological Sex|Upload Photo|Height|Weight/);
    assert.match(verify, /SMS and automated phone verification are not yet available/);
    assert.doesNotMatch(verify, /6-digit|Resend Code|Verify Authentication/);
  });

  it("registration GET, valid phone-first register, login, profile, and isolation", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedPublishedClinic(stamp);
    const other = await seedPublishedClinic(`${stamp}x`);
    const receptionist = await seedReceptionist(clinic);
    const unlinked = await seedUnlinkedPatient(clinic, receptionist, {
      firstName: "Amina",
      lastName: "Banda",
    });
    const app = appWithEnv();
    const registerPath = `/clinics/${clinic.clinicKey}/patient/register`;

    const getReg = await request(app).get(registerPath);
    assert.equal(getReg.status, 200);
    assert.match(getReg.text, /data-ac-mf-screen="MF08-01"/);
    assert.match(getReg.text, /Create an account/);
    assert.match(getReg.text, /Mobile number/);
    assert.match(getReg.text, /id="guestToken"/);
    assert.doesNotMatch(getReg.text, /Google|Apple|6-digit|ClinicBuilder/);
    assert.doesNotMatch(getReg.text, /data-patient-id|platform_identity|patientNumber/);
    const prefill = await request(app).get(`${registerPath}?guestToken=qa-guest-token-example`);
    assert.equal(prefill.status, 200);
    assert.match(prefill.text, /value="qa-guest-token-example"/);
    assert.match(prefill.text, /<details class="acp-mf08-guest" open>/);
    const csrf = extractCookie(getReg, CSRF_COOKIE_ACTIVECLINIC_ORG);

    const noMatch = await request(app)
      .post(registerPath)
      .set("Cookie", cookieHeader(csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        firstName: "No",
        lastName: "Match",
        phone: nextPhone(),
        password: PORTAL_PASSWORD,
      });
    assert.equal(noMatch.status, 400);
    assert.match(noMatch.text, /No matching patient record found/);

    const created = await request(app)
      .post(registerPath)
      .set("Cookie", cookieHeader(csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        firstName: unlinked.firstName,
        lastName: unlinked.lastName,
        phone: unlinked.phone,
        password: PORTAL_PASSWORD,
      });
    assert.equal(created.status, 303);
    assert.match(created.headers.location, /\/patient\/login$/);

    const duplicate = await request(app)
      .post(registerPath)
      .set("Cookie", cookieHeader(csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        firstName: unlinked.firstName,
        lastName: unlinked.lastName,
        phone: unlinked.phone,
        password: PORTAL_PASSWORD,
      });
    assert.equal(duplicate.status, 400);
    assert.match(duplicate.text, /already exists|already linked/i);

    const loginPage = await request(app).get(`/clinics/${clinic.clinicKey}/patient/login`);
    const loginCsrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const login = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .set("Cookie", cookieHeader(loginCsrf))
      .type("form")
      .send({
        [CSRF_FIELD]: loginCsrf,
        identifier: unlinked.phone,
        password: PORTAL_PASSWORD,
      });
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);

    const profile = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/profile`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(profile.status, 200);
    assert.match(profile.text, /data-ac-mf-screen="MF08-05"/);
    assert.match(profile.text, /Your profile/);
    assert.doesNotMatch(profile.text, /Health Insurance|Biological Sex|Upload Photo/);
    const profileCsrf = extractCookie(profile, CSRF_COOKIE_ACTIVECLINIC_ORG) || loginCsrf;

    const updated = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/profile`)
      .set("Cookie", cookieHeader(profileCsrf, sid))
      .type("form")
      .send({
        [CSRF_FIELD]: profileCsrf,
        preferredName: "Ami",
        email: `ami.${unlinked.phone.slice(-8)}@example.test`,
        addressCity: "Lusaka",
      });
    assert.ok([200, 303].includes(updated.status), String(updated.status));
    const after = updated.status === 303
      ? await request(app)
          .get(`/clinics/${clinic.clinicKey}/patient/profile`)
          .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      : updated;
    assert.match(after.text, /value="Ami"|Ami/);
    assert.doesNotMatch(after.text, /data-patient-id|platform_identity_id/);

    const appDenied = await request(app)
      .get("/app")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(0);
    assert.ok([302, 303, 401, 403].includes(appDenied.status));
    assert.notEqual(appDenied.status, 200);

    const otherProfile = await request(app)
      .get(`/clinics/${other.clinicKey}/patient/profile`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(0);
    assert.ok([200, 302, 303, 401, 403].includes(otherProfile.status));
    if (otherProfile.status === 200) {
      assert.doesNotMatch(otherProfile.text, /\/app\/patients|platform_identity|data-patient-id/);
    }

    const foreignBooking = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings/NOT-A-REAL-REF`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.ok([404, 200].includes(foreignBooking.status));
    if (foreignBooking.status === 200) {
      assert.match(foreignBooking.text, /not found|unavailable|No booking/i);
    }
  });

  it("guest booking linkage remains available and does not invent OTP", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}g`;
    const clinic = await seedPublishedClinic(stamp);
    const receptionist = await seedReceptionist(clinic);
    const unlinked = await seedUnlinkedPatient(clinic, receptionist, {
      firstName: "Guest",
      lastName: "Link",
    });
    const booking = await createConsultationBookingRequest(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: unlinked.firstName,
      patientLastName: unlinked.lastName,
      patientPhone: unlinked.phone,
      preferredStartsAt: "2030-06-01T09:00:00Z",
      timezone: "Africa/Lusaka",
    });
    assert.equal(booking.ok, true, JSON.stringify(booking));
    await pool.query(
      `UPDATE activeclinic.public_booking_requests
          SET patient_id = $1,
              patient_link_status = 'linked',
              patient_linked_at = now()
        WHERE id = $2`,
      [unlinked.patientId, booking.booking.id]
    );

    const app = appWithEnv();
    const form = await request(app).get(`/clinics/${clinic.clinicKey}/patient/register`);
    const csrf = extractCookie(form, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const reg = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/register`)
      .set("Cookie", cookieHeader(csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        phone: unlinked.phone,
        password: PORTAL_PASSWORD,
        guestToken: booking.booking.accessToken,
        firstName: unlinked.firstName,
        lastName: unlinked.lastName,
      });
    assert.ok([200, 302, 303].includes(reg.status), String(reg.status));

    const loginPage = await request(app).get(`/clinics/${clinic.clinicKey}/patient/login`);
    const loginCsrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const login = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .set("Cookie", cookieHeader(loginCsrf))
      .type("form")
      .send({
        [CSRF_FIELD]: loginCsrf,
        identifier: unlinked.phone,
        password: PORTAL_PASSWORD,
      });
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);
    const list = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(list.status, 200);
    assert.match(list.text, new RegExp(booking.booking.requestNumber));
  });

  it("staff session cannot own the patient portal profile", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}s`;
    const clinic = await seedPublishedClinic(stamp);
    const receptionist = await seedReceptionist(clinic);
    const app = appWithEnv();
    const loginPage = await request(app).get("/login");
    const csrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const login = await request(app)
      .post("/login")
      .set("Cookie", cookieHeader(csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: receptionist.email,
        password: STAFF_PASSWORD,
      });
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);
    const staffApp = await request(app)
      .get("/app")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(0);
    assert.ok([200, 302, 303].includes(staffApp.status));

    const portal = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/profile`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(0);
    assert.ok([200, 302, 303, 401, 403].includes(portal.status));
    if (portal.status === 200) {
      assert.doesNotMatch(portal.text, /data-ac-mf-screen="MF08-05"/);
      assert.match(portal.text, /Sign in|Patient portal/i);
    }
  });

  it("keeps patient register usable at 390px", async () => {
    requireDb();
    let browser;
    let httpServer;
    try {
      const { chromium } = require("playwright");
      const stamp = `${Date.now().toString(36)}m`;
      const clinic = await seedPublishedClinic(stamp);
      const expressApp = appWithEnv();
      httpServer = http.createServer(expressApp);
      await new Promise((resolve, reject) => {
        httpServer.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
      });
      const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      const page = await context.newPage();
      const res = await page.goto(`${baseUrl}/clinics/${clinic.clinicKey}/patient/register`, {
        waitUntil: "load",
      });
      assert.ok(res && res.status() === 200);
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 2;
        return { overflow, width: doc.clientWidth };
      });
      assert.equal(metrics.width, 390);
      assert.equal(metrics.overflow, false, "register horizontal overflow");
      const html = await page.content();
      assert.match(html, /Create an account/);
      assert.doesNotMatch(html, /Sign in with Google|6-digit/);
    } finally {
      if (browser) await browser.close().catch(() => {});
      if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    }
  });
});
