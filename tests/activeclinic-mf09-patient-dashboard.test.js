"use strict";

/**
 * MF09 patient dashboard chrome: bookings and current patient-safe data only.
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
const EHR_ABSENT = /Lab Results|Medications|Request Refill|Join Call|Telehealth|Copay|Insurance|Medical Records|Lisinopril|Dr\. Sarah Jenkins/;

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 981000000;

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
    organizationKey: `ac_mf09_${stamp}`,
    displayName: "MF09 Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-mf09-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "MF09 Legal",
    publicName: "MF09 Clinic",
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
    clinicKey: `ac_mf09_${stamp}`,
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
    firstName: "MF09",
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
  return {
    phone,
    patientId: patient.patient.id,
    firstName: demographics.firstName,
    lastName: demographics.lastName,
  };
}

describe("ActiveClinic MF09 patient dashboard chrome", () => {
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

  it("templates omit EHR, telehealth, billing, and sample clinical widgets", () => {
    const dashboard = fs.readFileSync(path.join(ROOT, "views/activeclinic/patient/dashboard.ejs"), "utf8");
    const empty = fs.readFileSync(path.join(ROOT, "views/activeclinic/patient/dashboard-empty.ejs"), "utf8");
    assert.match(dashboard, /data-ac-mf-family="MF09"/);
    assert.match(empty, /data-ac-mf-family="MF09"/);
    assert.doesNotMatch(dashboard, EHR_ABSENT);
    assert.doesNotMatch(empty, EHR_ABSENT);
    assert.doesNotMatch(dashboard, /Join Call|Request Refill|Messages|Billing/);
    assert.match(dashboard, /Pending requests/);
    assert.match(dashboard, /Book appointment/);
    assert.match(dashboard, /Link a guest booking/);
    assert.match(dashboard, /Your profile/);
  });

  it("anonymous dashboard redirects; empty and booked dashboards stay current-data-only", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const clinic = await seedPublishedClinic(stamp);
    const other = await seedPublishedClinic(`${stamp}b`);
    const receptionist = await seedReceptionist(clinic);
    const unlinked = await seedUnlinkedPatient(clinic, receptionist, {
      firstName: "Jane",
      lastName: "Portal",
    });
    const foreign = await seedUnlinkedPatient(clinic, receptionist, {
      firstName: "Other",
      lastName: "Patient",
    });
    const app = appWithEnv();

    const anon = await request(app).get(`/clinics/${clinic.clinicKey}/patient`).redirects(0);
    assert.ok([302, 303].includes(anon.status));
    assert.match(String(anon.headers.location || ""), /\/patient\/login/);

    const form = await request(app).get(`/clinics/${clinic.clinicKey}/patient/register`);
    const csrf = extractCookie(form, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const reg = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/register`)
      .set("Cookie", cookieHeader(csrf))
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        firstName: unlinked.firstName,
        lastName: unlinked.lastName,
        phone: unlinked.phone,
        password: PORTAL_PASSWORD,
      });
    assert.equal(reg.status, 303);

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

    const emptyDash = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(emptyDash.status, 200);
    assert.match(emptyDash.text, /data-ac-page-section="patient-dashboard-empty"|No bookings yet/);
    assert.match(emptyDash.text, /Book appointment/);
    assert.match(emptyDash.text, /Link a guest booking/);
    assert.match(emptyDash.text, /Your profile/);
    assert.doesNotMatch(emptyDash.text, EHR_ABSENT);
    assert.doesNotMatch(emptyDash.text, /data-patient-id|platform_identity/);

    const ownBooking = await createConsultationBookingRequest(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: unlinked.firstName,
      patientLastName: unlinked.lastName,
      patientPhone: unlinked.phone,
      preferredStartsAt: "2030-06-01T09:00:00Z",
      timezone: "Africa/Lusaka",
    });
    assert.equal(ownBooking.ok, true, JSON.stringify(ownBooking));
    const identityRow = await pool.query(
      `SELECT platform_identity_id FROM activeclinic.patients WHERE id = $1`,
      [unlinked.patientId]
    );
    await pool.query(
      `UPDATE activeclinic.public_booking_requests
          SET patient_id = $1,
              portal_platform_identity_id = $2,
              patient_link_status = 'linked',
              patient_linked_at = now()
        WHERE id = $3`,
      [unlinked.patientId, identityRow.rows[0].platform_identity_id, ownBooking.booking.id]
    );

    const foreignBooking = await createConsultationBookingRequest(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: foreign.firstName,
      patientLastName: foreign.lastName,
      patientPhone: foreign.phone,
      preferredStartsAt: "2030-07-01T09:00:00Z",
      timezone: "Africa/Lusaka",
    });
    assert.equal(foreignBooking.ok, true, JSON.stringify(foreignBooking));
    await pool.query(
      `UPDATE activeclinic.public_booking_requests
          SET patient_id = $1,
              patient_link_status = 'linked',
              patient_linked_at = now()
        WHERE id = $2`,
      [foreign.patientId, foreignBooking.booking.id]
    );

    const dash = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(dash.status, 200);
    assert.match(dash.text, /data-ac-mf-screen="MF09-01"/);
    assert.match(dash.text, /Welcome back/);
    assert.match(dash.text, /Pending clinic confirmation/);
    assert.match(dash.text, new RegExp(ownBooking.booking.requestNumber));
    assert.doesNotMatch(dash.text, new RegExp(foreignBooking.booking.requestNumber));
    assert.doesNotMatch(dash.text, new RegExp(ownBooking.booking.id, "i"));
    assert.doesNotMatch(dash.text, EHR_ABSENT);
    assert.doesNotMatch(dash.text, /Appointment confirmed|Join Call/);
    assert.match(dash.text, /href="\/clinics\/[^"]+\/book"/);
    assert.match(dash.text, /patient\/link-guest-booking/);
    assert.match(dash.text, /patient\/profile/);

    const stolen = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings/${foreignBooking.booking.requestNumber}`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.ok([404, 200].includes(stolen.status));
    if (stolen.status === 200) {
      assert.match(stolen.text, /not found|unavailable|No booking/i);
    }

    const appDenied = await request(app)
      .get("/app")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(0);
    assert.ok([302, 303, 401, 403].includes(appDenied.status));

    const otherClinic = await request(app)
      .get(`/clinics/${other.clinicKey}/patient`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(0);
    assert.ok([403, 303, 401].includes(otherClinic.status), `foreign clinic ${otherClinic.status}`);
    assert.doesNotMatch(otherClinic.text, /data-ac-mf-family="MF09"/);
  });

  it("staff session cannot own the patient dashboard", async () => {
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
    const portal = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(0);
    assert.ok([302, 303, 401, 403].includes(portal.status));
  });

  it("keeps the dashboard usable at 390px", async () => {
    requireDb();
    let browser;
    let httpServer;
    try {
      const { chromium } = require("playwright");
      const stamp = `${Date.now().toString(36)}m`;
      const clinic = await seedPublishedClinic(stamp);
      const receptionist = await seedReceptionist(clinic);
      const unlinked = await seedUnlinkedPatient(clinic, receptionist, {
        firstName: "Mobile",
        lastName: "Dash",
      });
      const app = appWithEnv();
      const form = await request(app).get(`/clinics/${clinic.clinicKey}/patient/register`);
      const csrf = extractCookie(form, CSRF_COOKIE_ACTIVECLINIC_ORG);
      await request(app)
        .post(`/clinics/${clinic.clinicKey}/patient/register`)
        .set("Cookie", cookieHeader(csrf))
        .type("form")
        .send({
          [CSRF_FIELD]: csrf,
          firstName: unlinked.firstName,
          lastName: unlinked.lastName,
          phone: unlinked.phone,
          password: PORTAL_PASSWORD,
        });
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

      httpServer = http.createServer(app);
      await new Promise((resolve, reject) => {
        httpServer.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
      });
      const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await context.addCookies([
        {
          name: COOKIE_ACTIVECLINIC_ORG,
          value: sid,
          url: baseUrl,
        },
      ]);
      const page = await context.newPage();
      const res = await page.goto(`${baseUrl}/clinics/${clinic.clinicKey}/patient`, {
        waitUntil: "load",
      });
      assert.ok(res && res.status() === 200);
      const metrics = await page.evaluate(() => {
        const doc = document.documentElement;
        const overflow = Math.max(doc.scrollWidth, document.body.scrollWidth) > doc.clientWidth + 2;
        return { overflow, width: doc.clientWidth };
      });
      assert.equal(metrics.width, 390);
      assert.equal(metrics.overflow, false, "dashboard horizontal overflow");
      const html = await page.content();
      assert.match(html, /Welcome back|No bookings yet/);
      assert.doesNotMatch(html, EHR_ABSENT);
    } finally {
      if (browser) await browser.close().catch(() => {});
      if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
    }
  });
});
