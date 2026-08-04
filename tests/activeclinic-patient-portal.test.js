"use strict";

/**
 * ActiveClinic Patient Portal (P27) tests.
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
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
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
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
  assignStaffRole,
  NETWORK_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 970000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function extractCookie(res, name) {
  const cookies = [].concat(res.headers["set-cookie"] || []);
  const raw = cookies.find((c) => String(c).startsWith(`${name}=`)) || "";
  const match = String(raw).match(new RegExp(`${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
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
    organizationKey: `ac_pt_${stamp}`,
    displayName: "Portal Clinic",
    productKey: "activeclinic",
    productTenantKey: `ac-pt-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Portal Legal",
    publicName: "Portal Clinic",
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
  return {
    clinicKey: `ac_pt_${stamp}`,
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

describe("ActiveClinic Patient Portal (P27)", () => {
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

  beforeEach(() => {
    resetDeploymentProfileWarningsForTests();
  });

  function requireDb() {
    if (skipReason) {
      console.log("skip:", skipReason);
      return false;
    }
    return true;
  }

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

  it("migrations 026 and 020 apply", async () => {
    if (!requireDb()) return;
    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema='activeclinic' AND table_name='patients'
         AND column_name='platform_identity_id'`
    );
    assert.equal(col.rows.length, 1);
    const ev = await pool.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema='activeclinic' AND table_name='patient_portal_link_events'`
    );
    assert.equal(ev.rows.length, 1);
  });

  it("patient login/logout and session isolation from /app", async () => {
    if (!requireDb()) return;
    const stamp = Date.now().toString(36);
    const clinic = await seedPublishedClinic(stamp);
    const phone = nextPhone();

    const staff = await createStaffMember(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      firstName: "Net",
      lastName: "Admin",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
    });
    assert.equal(staff.ok, true);
    await assignStaffRole(pool, {
      organizationId: clinic.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: { staffMemberId: staff.staffMember.id },
      demographics: {
        firstName: "Pat",
        lastName: "Ent",
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
      password: "PortalPass1!",
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

    const app = appWithEnv();
    const loginPage = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/login`
    );
    assert.equal(loginPage.status, 200);
    assert.match(loginPage.text, /data-ac-shell="patient"|Patient/);
    const csrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    assert.ok(csrf);

    const login = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: phone,
        password: "PortalPass1!",
      });
    assert.ok([200, 302, 303].includes(login.status), String(login.status));
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid, "patient session cookie");

    const dash = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(dash.status, 200);
    assert.match(dash.text, /Pat|booking|Dashboard|Welcome/i);

    const appDenied = await request(app)
      .get("/app")
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`)
      .redirects(0);
    assert.ok([302, 303, 401, 403].includes(appDenied.status));
    assert.notEqual(appDenied.status, 200);
  });

  it("guest token registration links patient and lists only owned bookings", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}g`;
    const clinic = await seedPublishedClinic(stamp);
    const phone = nextPhone();

    const staff = await createStaffMember(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      firstName: "Net",
      lastName: "Admin",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
    });
    assert.equal(staff.ok, true);
    await assignStaffRole(pool, {
      organizationId: clinic.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: { staffMemberId: staff.staffMember.id },
      demographics: {
        firstName: "Guest",
        lastName: "Link",
        sexAtRegistration: "male",
      },
      contacts: { phone },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const booking = await createConsultationBookingRequest(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: "Guest",
      patientLastName: "Link",
      patientPhone: phone,
      preferredStartsAt: "2030-06-01T09:00:00Z",
      timezone: "Africa/Lusaka",
    });
    assert.equal(booking.ok, true, JSON.stringify(booking));
    const token = booking.booking.accessToken;
    assert.ok(token);

    // Ensure booking has patient_id for linking path
    await pool.query(
      `UPDATE activeclinic.public_booking_requests SET patient_id = $1 WHERE id = $2`,
      [patient.patient.id, booking.booking.id]
    );

    const app = appWithEnv();
    const form = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/register`
    );
    const csrf = extractCookie(form, CSRF_COOKIE_ACTIVECLINIC_ORG);

    const reg = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/register`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        phone,
        password: "GuestPass12!",
        guestToken: token,
        firstName: "Guest",
        lastName: "Link",
      });
    assert.ok([200, 302, 303].includes(reg.status), `${reg.status} ${reg.text.slice(0, 200)}`);

    const linked = await pool.query(
      `SELECT platform_identity_id FROM activeclinic.patients WHERE id = $1`,
      [patient.patient.id]
    );
    assert.ok(linked.rows[0].platform_identity_id);

    // Login and open bookings
    const loginPage = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/login`
    );
    const csrf2 = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const login = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf2}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf2,
        identifier: phone,
        password: "GuestPass12!",
      });
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);

    const list = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(list.status, 200);
    assert.match(list.text, new RegExp(booking.booking.requestNumber));

    const foreign = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings/NOT-A-REAL-REF`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.ok([404, 200].includes(foreign.status));
    if (foreign.status === 200) {
      assert.match(foreign.text, /not found|unavailable|No booking/i);
    }
  });

  it("forgot password is enumeration-safe and does not claim delivery", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}f`;
    const clinic = await seedPublishedClinic(stamp);
    const app = appWithEnv();
    const page = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/forgot-password`
    );
    const csrf = extractCookie(page, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const res = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/forgot-password`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: "+260977000000",
      });
    assert.ok([200, 303].includes(res.status));
    const body = res.text || "";
    assert.doesNotMatch(body, /SMS sent|email sent|WhatsApp sent/i);
    assert.match(body, /unavailable|contact|clinic|instructions|received/i);
  });

  it("CSRF required on patient login POST", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}c`;
    const clinic = await seedPublishedClinic(stamp);
    const app = appWithEnv();
    const bad = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .type("form")
      .send({ identifier: "+260977111111", password: "Whatever123!" });
    assert.equal(bad.status, 403);
  });

  it("login page renders EJS patient shell", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}ejs`;
    const clinic = await seedPublishedClinic(stamp);
    const app = appWithEnv();
    const page = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/login`
    );
    assert.equal(page.status, 200);
    assert.match(page.text, /data-ac-shell="patient"/);
    assert.match(page.text, /ac-patient-header/);
    assert.match(page.text, /ac-patient\.css\?v=p27-1/);
    assert.match(page.text, /<h1[^>]*>Patient portal sign in<\/h1>/i);
    assert.doesNotMatch(page.text, /href="#"/);
    assert.equal((page.text.match(/<h1/gi) || []).length, 1);
  });

  it("verify-phone honesty page does not claim SMS delivery", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}vp`;
    const clinic = await seedPublishedClinic(stamp);
    const app = appWithEnv();
    const page = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/verify-phone`
    );
    assert.equal(page.status, 200);
    assert.match(page.text, /not yet available|contact the clinic|no SMS/i);
    assert.doesNotMatch(page.text, /SMS sent|code sent|OTP sent/i);
    assert.doesNotMatch(page.text, /href="#"/);
    assert.equal((page.text.match(/<h1/gi) || []).length, 1);
  });

  it("bookings filter by status query param", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}bf`;
    const clinic = await seedPublishedClinic(stamp);
    const phone = nextPhone();

    const staff = await createStaffMember(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      firstName: "Net",
      lastName: "Admin",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
    });
    assert.equal(staff.ok, true);
    await assignStaffRole(pool, {
      organizationId: clinic.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: { staffMemberId: staff.staffMember.id },
      demographics: {
        firstName: "Filter",
        lastName: "Pat",
        sexAtRegistration: "female",
      },
      contacts: { phone },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);

    const identity = await createPlatformIdentity(pool, {
      status: "active",
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
      requireContact: true,
    });
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: "PortalPass1!",
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

    const confirmed = await createConsultationBookingRequest(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: "Filter",
      patientLastName: "Pat",
      patientPhone: phone,
      preferredStartsAt: "2030-07-01T09:00:00Z",
      timezone: "Africa/Lusaka",
    });
    assert.equal(confirmed.ok, true);
    await pool.query(
      `UPDATE activeclinic.public_booking_requests SET patient_id = $1, status = 'confirmed' WHERE id = $2`,
      [patient.patient.id, confirmed.booking.id]
    );

    const pending = await createConsultationBookingRequest(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientFirstName: "Filter",
      patientLastName: "Pat",
      patientPhone: phone,
      preferredStartsAt: "2030-08-01T09:00:00Z",
      timezone: "Africa/Lusaka",
    });
    assert.equal(pending.ok, true);
    await pool.query(
      `UPDATE activeclinic.public_booking_requests SET patient_id = $1 WHERE id = $2`,
      [patient.patient.id, pending.booking.id]
    );

    const app = appWithEnv();
    const loginPage = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/login`
    );
    const csrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const login = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: phone,
        password: "PortalPass1!",
      });
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);

    const filtered = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/bookings?status=confirmed`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(filtered.status, 200);
    assert.match(filtered.text, new RegExp(confirmed.booking.requestNumber));
    assert.doesNotMatch(filtered.text, new RegExp(pending.booking.requestNumber));
    assert.match(filtered.text, /ac-patient-filters/);
  });

  it("link-guest-booking page renders for authenticated patient", async () => {
    if (!requireDb()) return;
    const stamp = `${Date.now().toString(36)}lg`;
    const clinic = await seedPublishedClinic(stamp);
    const phone = nextPhone();

    const staff = await createStaffMember(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      firstName: "Net",
      lastName: "Admin",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
    });
    assert.equal(staff.ok, true);
    await assignStaffRole(pool, {
      organizationId: clinic.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey: NETWORK_ADMIN,
      scopeType: "organisation",
    });

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: clinic.orgId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      actor: { staffMemberId: staff.staffMember.id },
      demographics: {
        firstName: "Link",
        lastName: "Pat",
        sexAtRegistration: "male",
      },
      contacts: { phone },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);

    const identity = await createPlatformIdentity(pool, {
      status: "active",
      primaryPhone: phone,
      phoneNormalized: phone,
      phoneVerifiedAt: new Date().toISOString(),
      requireContact: true,
    });
    await setPlatformIdentityPassword(pool, {
      identityId: identity.identity.id,
      password: "PortalPass1!",
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

    const app = appWithEnv();
    const loginPage = await request(app).get(
      `/clinics/${clinic.clinicKey}/patient/login`
    );
    const csrf = extractCookie(loginPage, CSRF_COOKIE_ACTIVECLINIC_ORG);
    const login = await request(app)
      .post(`/clinics/${clinic.clinicKey}/patient/login`)
      .set("Cookie", `${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`)
      .type("form")
      .send({
        [CSRF_FIELD]: csrf,
        identifier: phone,
        password: "PortalPass1!",
      });
    const sid = extractCookie(login, COOKIE_ACTIVECLINIC_ORG);
    assert.ok(sid);

    const page = await request(app)
      .get(`/clinics/${clinic.clinicKey}/patient/link-guest-booking`)
      .set("Cookie", `${COOKIE_ACTIVECLINIC_ORG}=${sid}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /Link guest booking/i);
    assert.match(page.text, /name="guestToken"/);
    assert.match(page.text, /\/patient\/link-guest-booking/);
    assert.doesNotMatch(page.text, /href="#"/);
    assert.equal((page.text.match(/<h1/gi) || []).length, 1);
  });
});
