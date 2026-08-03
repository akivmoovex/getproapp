"use strict";

/**
 * ActiveClinic V6 — appointment Stitch UI parity (AC-V6-C04).
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
let phoneSeq = 860000000;

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

describe("ActiveClinic appointment UI parity (AC-V6-C04)", () => {
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

  it("lists, calendars, creates, and transitions appointments with scope and CSRF", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedAcTenant(stamp, "apptui");
    const other = await seedAcTenant(`${stamp}x`, "apptui2");
    const admin = await seedStaff(tenant, {
      roleKey: NETWORK_ADMIN,
      firstName: "Net",
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
    const service = await createAppointmentServiceType(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor,
      serviceKey: "consult",
      displayName: "Consultation",
      defaultDurationMinutes: 30,
    });
    assert.equal(service.ok, true, JSON.stringify(service));

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Ann", lastName: "Appt" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);

    const starts = new Date("2026-11-10T09:00:00+02:00");
    const ends = new Date("2026-11-10T09:30:00+02:00");
    const booked = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: starts,
      endsAt: ends,
      timezone: "Africa/Lusaka",
      actor,
    });
    assert.equal(booked.ok, true, JSON.stringify(booked));

    const app = createActiveClinicFoundationApp({
      env: { ...MINIMAL_AC, DATABASE_URL: databaseUrl },
      getPool: () => pool,
      isProduction: false,
    });

    const adminCookie = await sessionCookie(admin.identity.id, tenant.orgId);
    const list = await request(app)
      .get("/app/appointments?date=2026-11-10&date_to=2026-11-10")
      .set("Cookie", adminCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-page-section="appointment-list"/);
    assert.match(list.text, /data-ac-stitch-desktop="284e9f8cd6804b0eb0f50574e2f571d6"/);
    assert.match(list.text, /data-ac-table="appointments"/);
    assert.match(list.text, /data-ac-card-list="appointments"/);
    assert.match(list.text, /Ann Appt|Consultation|Africa\/Lusaka|Scheduled/);
    assert.doesNotMatch(list.text, /\b(prescription|pharmacy stock|lab result)\b/i);

    const calendar = await request(app)
      .get("/app/appointments/calendar?date=2026-11-10&date_to=2026-11-12")
      .set("Cookie", adminCookie);
    assert.equal(calendar.status, 200);
    assert.match(calendar.text, /data-ac-page-section="appointment-calendar"/);
    assert.match(calendar.text, /data-ac-calendar="desktop"/);
    assert.match(calendar.text, /data-ac-calendar="mobile"/);
    assert.match(calendar.text, /2026-11-10/);

    const detail = await request(app)
      .get(`/app/appointments/${booked.appointment.id}`)
      .set("Cookie", adminCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-status-history/);
    assert.match(detail.text, /Check in|Mark no-show|Cancel appointment/);

    const csrfDenied = await request(app)
      .post(`/app/appointments/${booked.appointment.id}/check-in`)
      .set("Cookie", adminCookie)
      .type("form")
      .send({});
    assert.equal(csrfDenied.status, 403);

    const { cookie: checkCookie, csrf: checkCsrf } = withCsrf(adminCookie);
    const checked = await request(app)
      .post(`/app/appointments/${booked.appointment.id}/check-in`)
      .set("Cookie", checkCookie)
      .type("form")
      .send({ [CSRF_FIELD]: checkCsrf });
    assert.equal(checked.status, 303);

    const afterCheck = await request(app)
      .get(`/app/appointments/${booked.appointment.id}`)
      .set("Cookie", adminCookie);
    assert.match(afterCheck.text, /checked_in|Checked in/i);

    const { cookie: noshowCookie, csrf: noshowCsrf } = withCsrf(adminCookie);
    // need a fresh scheduled appt for no-show
    const booked2 = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: new Date("2026-11-11T10:00:00+02:00"),
      endsAt: new Date("2026-11-11T10:30:00+02:00"),
      timezone: "Africa/Lusaka",
      actor,
    });
    const noshow = await request(app)
      .post(`/app/appointments/${booked2.appointment.id}/no-show`)
      .set("Cookie", noshowCookie)
      .type("form")
      .send({ [CSRF_FIELD]: noshowCsrf });
    assert.equal(noshow.status, 303);

    const { cookie: cancelCookie, csrf: cancelCsrf } = withCsrf(adminCookie);
    const booked3 = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: new Date("2026-11-12T11:00:00+02:00"),
      endsAt: new Date("2026-11-12T11:30:00+02:00"),
      timezone: "Africa/Lusaka",
      actor,
    });
    const cancelled = await request(app)
      .post(`/app/appointments/${booked3.appointment.id}/cancel`)
      .set("Cookie", cancelCookie)
      .type("form")
      .send({ [CSRF_FIELD]: cancelCsrf, reason: "patient_request" });
    assert.equal(cancelled.status, 303);

    const newForm = await request(app)
      .get("/app/appointments/new")
      .set("Cookie", adminCookie);
    assert.equal(newForm.status, 200);
    assert.match(newForm.text, /data-ac-stitch-book/);
    assert.match(newForm.text, /Administrative scheduling only/);

    const { cookie: createCookie, csrf: createCsrf } = withCsrf(adminCookie);
    const createReview = await request(app)
      .post("/app/appointments")
      .set("Cookie", createCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: createCsrf,
        patient_number: patient.patient.patientNumber,
        facility_id: tenant.facilityId,
        service_type_id: service.serviceType.id,
        starts_date: "2026-11-15",
        starts_time: "14:00",
        ends_time: "14:30",
        timezone: "Africa/Lusaka",
        reminder_channel: "none",
      });
    assert.equal(createReview.status, 200);
    assert.match(createReview.text, /Review booking|data-ac-appointment-step="review"/);

    const { cookie: confirmCookie, csrf: confirmCsrf } = withCsrf(adminCookie);
    const created = await request(app)
      .post("/app/appointments")
      .set("Cookie", confirmCookie)
      .type("form")
      .send({
        [CSRF_FIELD]: confirmCsrf,
        confirm: "1",
        patient_number: patient.patient.patientNumber,
        facility_id: tenant.facilityId,
        service_type_id: service.serviceType.id,
        starts_date: "2026-11-15",
        starts_time: "14:00",
        ends_time: "14:30",
        timezone: "Africa/Lusaka",
        reminder_channel: "sms",
      });
    assert.equal(created.status, 303);
    assert.match(created.headers.location, /\/app\/appointments\/[0-9a-f-]+\?booked=1/);

    const staffCookie = await sessionCookie(plain.identity.id, tenant.orgId);
    const denied = await request(app)
      .get("/app/appointments")
      .set("Cookie", staffCookie);
    assert.ok(denied.status === 403 || /Access Restricted|permission/i.test(denied.text));

    const otherCookie = await sessionCookie(otherAdmin.identity.id, other.orgId);
    const cross = await request(app)
      .get(`/app/appointments/${booked.appointment.id}`)
      .set("Cookie", otherCookie);
    assert.ok(cross.status === 403 || cross.status === 404);

    const encounters = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'activeclinic' AND table_name LIKE '%encounter%'`
    );
    assert.equal(encounters.rows.length, 0);
  });
});
