"use strict";

/**
 * ActiveClinic V6 — reception/queue Stitch UI parity (AC-V6-C05).
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
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const {
  createFacility,
} = require("../src/activeclinic/services/facilityService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  NETWORK_ADMIN,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createAppointmentServiceType,
  createAppointment,
} = require("../src/activeclinic/services/activeClinicAppointmentService");
const receptionRepo = require("../src/activeclinic/repositories/receptionRepository");
const {
  checkInWalkInPatient,
  createQueueEntry,
} = require("../src/activeclinic/services/activeClinicReceptionService");
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

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 870000000;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
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

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionOrg({
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Hospital",
    publicName: "Public Hospital",
    organizationType: "faith_based_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${keyPrefix}`.slice(0, 64),
    displayName: "Main Hospital",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
  });
  assert.equal(facility.ok, true);
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(tenant, opts) {
  const phone = opts.phone || nextPhone();
  const identity = await createPlatformIdentity(pool, {
    primaryPhone: phone,
    phoneNormalized: phone,
    phoneVerifiedAt: new Date().toISOString(),
  });
  assert.equal(identity.ok, true);
  await setPlatformIdentityPassword(pool, {
    identityId: identity.identity.id,
    password: PASSWORD,
  });
  const staff = await createStaffMember(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: opts.firstName || "Staff",
    lastName: opts.lastName || "User",
    employmentType: "permanent",
    status: "active",
    phone,
    platformIdentityId: identity.identity.id,
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey,
    scopeType: opts.roleKey === NETWORK_ADMIN ? "organisation" : "facility",
    facilityId: opts.roleKey === NETWORK_ADMIN ? null : tenant.facilityId,
  });
  return { identity: identity.identity, staff: staff.staffMember };
}

async function sessionCookie(identityId, organizationId) {
  const session = await createPlatformIdentitySession(pool, {
    platformIdentityId: identityId,
    organizationId,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

function withCsrf(cookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
    csrf,
  };
}

describe("ActiveClinic reception UI parity (AC-V6-C05)", () => {
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
    if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
  }

  it("reception queue: view, check-in walk-in, call, complete, CSRF, privacy", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedAcTenant(stamp, "recui");
    const other = await seedAcTenant(`${stamp}x`, "recui2");
    const admin = await seedStaff(tenant, {
      roleKey: NETWORK_ADMIN,
      firstName: "Rec",
      lastName: "Admin",
    });
    const plain = await seedStaff(tenant, {
      roleKey: STAFF_ROLE,
      firstName: "Plain",
      lastName: "Staff",
    });
    const otherAdmin = await seedStaff(other, {
      roleKey: NETWORK_ADMIN,
      firstName: "Other",
      lastName: "Admin",
    });

    const actor = {
      staffMemberId: admin.staff.id,
      organizationId: tenant.orgId,
    };

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Bob", lastName: "Queue" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);

    const servicePoint = await receptionRepo.insertServicePoint(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointKey: "general",
      displayName: "General Reception",
      serviceType: "general",
      status: "active",
    });

    const app = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      getPool: () => pool,
      isProduction: false,
    });

    const adminCookie = await sessionCookie(admin.identity.id, tenant.orgId);

    // Facility context is stored on the session (DB), not a separate cookie.
    const { cookie: selectCookie, csrf: selectCsrf } = withCsrf(adminCookie);
    const facilitySelect = await request(app)
      .post("/app/select-facility")
      .set("Cookie", selectCookie)
      .type("form")
      .send({ [CSRF_FIELD]: selectCsrf, facility_id: tenant.facilityId });
    assert.equal(facilitySelect.status, 303);
    const adminCookieWithFacility = adminCookie;

    const queueList = await request(app)
      .get("/app/reception")
      .set("Cookie", adminCookieWithFacility);
    assert.equal(queueList.status, 200);
    assert.match(queueList.text, /data-ac-page-section="reception-queue"/);
    assert.match(queueList.text, /data-ac-stitch-desktop="8b7173ba4ff94eb2a7d7e548b5f7253d"/);
    // Empty queue shows empty state, not table
    assert.match(queueList.text, /data-ac-card-list="reception-queue"|No patients in queue/);

    const walkInForm = await request(app)
      .get("/app/reception/walk-in")
      .set("Cookie", adminCookieWithFacility);
    assert.equal(walkInForm.status, 200);
    assert.match(walkInForm.text, /data-ac-page-section="reception-walk-in"/);
    assert.match(walkInForm.text, /data-ac-stitch-desktop="305d90143b0e4381b112bf6eb113f1c2"/);

    const csrfDenied = await request(app)
      .post("/app/reception/walk-in")
      .set("Cookie", adminCookieWithFacility)
      .type("form")
      .send({});
    assert.equal(csrfDenied.status, 403);

    const { cookie: walkCookie, csrf: walkCsrf } = withCsrf(adminCookieWithFacility);
    const walkIn = await request(app)
      .post("/app/reception/walk-in")
      .set("Cookie", walkCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: walkCsrf,
        patient_number: patient.patient.patientNumber,
        service_point_id: servicePoint.id,
        check_in_note: "Walk-in visit",
      });
    assert.equal(walkIn.status, 303);
    assert.match(walkIn.headers.location, /\/app\/reception\/queue\/[0-9a-f-]+\?checked_in=1/);

    const entryId = walkIn.headers.location.split("/").pop().split("?")[0];
    const queueDetail = await request(app)
      .get(`/app/reception/queue/${entryId}`)
      .set("Cookie", adminCookieWithFacility);
    assert.equal(queueDetail.status, 200);
    assert.match(queueDetail.text, /data-ac-page-section="queue-detail"/);
    assert.match(queueDetail.text, /Bob Queue/);
    assert.match(queueDetail.text, /waiting|Waiting/i);
    assert.match(queueDetail.text, /Call patient/);

    const { cookie: callCookie, csrf: callCsrf } = withCsrf(adminCookieWithFacility);
    const called = await request(app)
      .post(`/app/reception/queue/${entryId}/call`)
      .set("Cookie", callCookie)
      .type("form")
      .send({ [CSRF_FIELD]: callCsrf });
    assert.equal(called.status, 303);

    const afterCall = await request(app)
      .get(`/app/reception/queue/${entryId}`)
      .set("Cookie", adminCookieWithFacility);
    assert.match(afterCall.text, /called|Called/i);
    assert.match(afterCall.text, /Start serving/);

    const { cookie: serveCookie, csrf: serveCsrf } = withCsrf(adminCookieWithFacility);
    const serving = await request(app)
      .post(`/app/reception/queue/${entryId}/start-serving`)
      .set("Cookie", serveCookie)
      .type("form")
      .send({ [CSRF_FIELD]: serveCsrf });
    assert.equal(serving.status, 303);

    const { cookie: completeCookie, csrf: completeCsrf } = withCsrf(adminCookieWithFacility);
    const completed = await request(app)
      .post(`/app/reception/queue/${entryId}/complete`)
      .set("Cookie", completeCookie)
      .type("form")
      .send({ [CSRF_FIELD]: completeCsrf });
    assert.equal(completed.status, 303);

    const afterComplete = await request(app)
      .get(`/app/reception/queue/${entryId}`)
      .set("Cookie", adminCookieWithFacility);
    assert.match(afterComplete.text, /completed|Completed/i);

    const callBoard = await request(app)
      .get("/app/reception/call-board")
      .set("Cookie", adminCookieWithFacility);
    assert.equal(callBoard.status, 200);
    assert.match(callBoard.text, /data-ac-page-section="reception-call-board"/);
    assert.match(callBoard.text, /data-ac-table="call-board"/);
    assert.doesNotMatch(callBoard.text, /\+2609\d{8}/);
    assert.doesNotMatch(callBoard.text, /Bob Queue/);
    assert.doesNotMatch(callBoard.text, new RegExp(patient.patient.patientNumber));
    // Call-board privacy: no full name, phone, or patient number (initials-only when populated).
    assert.match(callBoard.text, /call board does not show patient phone/i);

    const staffCookie = await sessionCookie(plain.identity.id, tenant.orgId);
    const denied = await request(app)
      .get("/app/reception")
      .set("Cookie", staffCookie);
    assert.ok(denied.status === 403 || /Access Restricted|permission/i.test(denied.text));

    const otherCookie = await sessionCookie(otherAdmin.identity.id, other.orgId);
    const cross = await request(app)
      .get(`/app/reception/queue/${entryId}`)
      .set("Cookie", otherCookie);
    assert.ok(cross.status === 403 || cross.status === 404);

    const encounterRows = await pool.query(
      `SELECT COUNT(*)::int AS c FROM activeclinic.encounters
        WHERE organization_id = $1`,
      [tenant.orgId]
    );
    assert.equal(encounterRows.rows[0].c, 0);
  });

  it("reception: scheduled check-in with appointment", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedAcTenant(stamp, "recsch");
    const admin = await seedStaff(tenant, {
      roleKey: NETWORK_ADMIN,
      firstName: "Scheduled",
      lastName: "Admin",
    });

    const actor = {
      staffMemberId: admin.staff.id,
      organizationId: tenant.orgId,
    };

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Scheduled", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);

    const service = await createAppointmentServiceType(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor,
      serviceKey: "consult",
      displayName: "Consultation",
      defaultDurationMinutes: 30,
    });
    assert.equal(service.ok, true);

    const appointment = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: new Date("2026-11-10T09:00:00+02:00"),
      endsAt: new Date("2026-11-10T09:30:00+02:00"),
      timezone: "Africa/Lusaka",
      actor,
    });
    assert.equal(appointment.ok, true);

    const servicePoint = await receptionRepo.insertServicePoint(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointKey: "general",
      displayName: "General Reception",
      serviceType: "general",
      status: "active",
    });

    const app = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      getPool: () => pool,
      isProduction: false,
    });

    const adminCookie = await sessionCookie(admin.identity.id, tenant.orgId);

    const { cookie: selectCookie, csrf: selectCsrf } = withCsrf(adminCookie);
    const facilitySelect = await request(app)
      .post("/app/select-facility")
      .set("Cookie", selectCookie)
      .type("form")
      .send({ [CSRF_FIELD]: selectCsrf, facility_id: tenant.facilityId });
    assert.equal(facilitySelect.status, 303);
    const adminCookieWithFacility = adminCookie;

    const checkInForm = await request(app)
      .get(`/app/reception/check-in?appointment_id=${appointment.appointment.id}`)
      .set("Cookie", adminCookieWithFacility);
    assert.equal(checkInForm.status, 200);
    assert.match(checkInForm.text, /data-ac-page-section="reception-check-in"/);
    assert.match(checkInForm.text, /Scheduled Patient/);

    const { cookie: checkCookie, csrf: checkCsrf } = withCsrf(adminCookieWithFacility);
    const checked = await request(app)
      .post("/app/reception/check-in")
      .set("Cookie", checkCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: checkCsrf,
        appointment_id: appointment.appointment.id,
        service_point_id: servicePoint.id,
        check_in_note: "Scheduled check-in",
      });
    assert.equal(checked.status, 303);
    assert.match(checked.headers.location, /\/app\/reception\/queue\/[0-9a-f-]+\?checked_in=1/);
  });
});
