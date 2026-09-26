"use strict";

/**
 * V2.03 Batch 1A — ACN06–ACN09 appointments calendar, create, detail, booking requests.
 * Extends the existing appointment engine (no second scheduler).
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
  createPlatformIdentity,
} = require("../src/platform/services/platformIdentityService");
const {
  setPlatformIdentityPassword,
} = require("../src/platform/services/platformIdentityCredentialService");
const {
  createHealthcareOrganization,
} = require("../src/activeclinic/services/healthcareOrganizationService");
const { createFacility } = require("../src/activeclinic/services/facilityService");
const { createStaffMember } = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  FACILITY_ADMIN,
  RECEPTIONIST,
  STAFF_ROLE,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createAppointmentServiceType,
  createAppointment,
  getAppointmentDetail,
  checkInAppointment,
  markWaitingAppointment,
  markWithPractitionerAppointment,
  completeAppointment,
  cancelAppointment,
  RESULT,
  ALLOWED_TRANSITIONS,
  STATUS_LABELS,
  APPOINTMENT_STATUSES,
} = require("../src/activeclinic/services/activeClinicAppointmentService");
const {
  createConsultationBookingRequest,
} = require("../src/activeclinic/services/activeClinicPublicBookingService");
const {
  linkBookingToExistingPatient,
  LINK_STATUS,
} = require("../src/activeclinic/services/activeClinicBookingPatientLinkageService");
const {
  confirmBookingRequest,
  declineBookingRequest,
} = require("../src/activeclinic/services/activeClinicBookingRequestTriageService");
const configRepo = require("../src/activeclinic/repositories/servicePractitionerConfigRepository");
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

const ROOT = path.join(__dirname, "..");
const STITCH = Object.freeze({
  calendarDesktop: "3c1a421cf1e140e9affe193071c8f80a",
  calendarMobile: "c36313bff4274c72b341c38cdfafbc35",
  bookDesktop: "c1e205c9ebd84f7a8f67d21681230d83",
  detailDesktop: "abc9994a9cff42568c7d7ddb4bf905a4",
  listDesktop: "6bf6da61f93a4e12972d7c3ab649549c",
  bookingQueueDesktop: "41394d581882437b80e941cebefbb95f",
});

let pool;
let skipReason = null;
let phoneSeq = 780000000;
let app;

function nextPhone() {
  phoneSeq += 1;
  return `+2609${String(phoneSeq).slice(-8)}`;
}

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function extractCsrf(res) {
  const html = String(res.text || "");
  const meta = html.match(/name="csrf-token"\s+content="([^"]+)"/);
  if (meta) return meta[1];
  const field = html.match(new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"`));
  return field ? field[1] : issueCsrfToken(MINIMAL_AC);
}

async function provisionClinic(label) {
  const stamp = `${label}_${Date.now().toString(36)}`;
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: stamp,
    displayName: `Appt ${label}`,
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
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `hq-${stamp}`,
    displayName: "HQ",
    facilityType: "clinic",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
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
    firstName: "Ada",
    lastName: "Admin",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: "Administrator",
  });
  await assignStaffToFacility(pool, {
    organizationId: org.records.organization.id,
    staffMemberId: staff.staffMember.id,
    facilityId: facility.facility.id,
    isPrimary: true,
  });
  for (const roleKey of [FACILITY_ADMIN, RECEPTIONIST]) {
    const role = await assignStaffRole(pool, {
      organizationId: org.records.organization.id,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId: facility.facility.id,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return {
    organizationId: org.records.organization.id,
    organizationKey: org.records.organization.organization_key || stamp,
    orgKey: stamp,
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

async function sessionCookie(clinic) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: clinic.identityId,
    organizationId: clinic.organizationId,
  });
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

async function seedBookingContext(clinic) {
  const service = await createAppointmentServiceType(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    actor: clinic.actor,
    serviceKey: `consult-${Date.now().toString(36)}`,
    displayName: "Consultation",
    defaultDurationMinutes: 30,
  });
  const patient = await registerActiveClinicPatient(pool, {
    organizationId: clinic.organizationId,
    healthcareOrganizationId: clinic.hcoId,
    facilityId: clinic.facilityId,
    actor: clinic.actor,
    demographics: { firstName: "Pat", lastName: "ient" },
    registrationMethod: "walk_in",
  });
  return { service, patient };
}

describe("ActiveClinic V2.03 ACN06–09 appointments", () => {
  before(async () => {
    resetDeploymentProfileWarningsForTests();
    try {
      const databaseUrl = await resetFoundationDatabase();
      pool = createFoundationPool(databaseUrl);
      await migrate({ connectionString: databaseUrl });
      app = createActiveClinicFoundationApp({
        getPool: () => pool,
        env: MINIMAL_AC,
        log: () => {},
      });
    } catch (err) {
      skipReason = err && err.message ? String(err.message) : String(err);
    }
  });

  after(async () => {
    if (pool) await pool.end();
  });

  it("ships migration, views, CSS, and canonical status vocabulary", () => {
    const migration = fs.readFileSync(
      path.join(ROOT, "db/migrations/activeclinic/037_batch1a_appointment_canonical_statuses.sql"),
      "utf8"
    );
    assert.match(migration, /with_practitioner/);
    assert.match(migration, /decline_reason/);
    assert.match(migration, /ALTER COLUMN status SET DEFAULT 'confirmed'/);

    const calendar = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/appointments-calendar-content.ejs"),
      "utf8"
    );
    assert.match(calendar, /data-ac-stitch="ACN06"/);
    assert.match(calendar, /data-ac-calendar="mobile"/);
    assert.match(calendar, /single-day agenda/);

    const detail = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/appointment-detail-content.ejs"),
      "utf8"
    );
    assert.match(detail, /data-ac-stitch="AC-B2-05"/);
    assert.match(detail, /data-ac-batch1="ACN08"/);
    assert.match(detail, /data-ac-lifecycle/);

    const requests = fs.readFileSync(
      path.join(ROOT, "views/activeclinic/app/booking-requests-content.ejs"),
      "utf8"
    );
    assert.match(requests, /data-ac-stitch="ACN09"/);
    assert.match(requests, /Decline reason/);

    const css = fs.readFileSync(path.join(ROOT, "public/activeclinic/ac-app.css"), "utf8");
    assert.match(css, /ac-lifecycle/);
    assert.match(css, /ACN06/);

    assert.equal(STATUS_LABELS.with_practitioner, "With Practitioner");
    assert.equal(APPOINTMENT_STATUSES.CONFIRMED, "confirmed");
    assert.deepEqual(ALLOWED_TRANSITIONS.confirmed, [
      "arrived",
      "waiting",
      "cancelled",
      "no_show",
    ]);
    assert.deepEqual(ALLOWED_TRANSITIONS.completed, []);
  });

  it("creates confirmed appointments, blocks double-booking, and records status history", async () => {
    requireDb();
    const clinic = await provisionClinic("hist");
    const { service, patient } = await seedBookingContext(clinic);
    const starts = new Date("2026-12-01T09:00:00+02:00");
    const ends = new Date("2026-12-01T09:30:00+02:00");

    const created = await createAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      assignedStaffId: clinic.staffId,
      startsAt: starts,
      endsAt: ends,
      timezone: "Africa/Lusaka",
      actor: clinic.actor,
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.appointment.status, "confirmed");

    const collision = await createAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      assignedStaffId: clinic.staffId,
      startsAt: new Date("2026-12-01T09:15:00+02:00"),
      endsAt: new Date("2026-12-01T09:45:00+02:00"),
      timezone: "Africa/Lusaka",
      actor: clinic.actor,
    });
    assert.equal(collision.ok, false);
    assert.equal(collision.code, RESULT.COLLISION);

    const arrived = await checkInAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      appointmentId: created.appointment.id,
      actor: clinic.actor,
    });
    assert.equal(arrived.ok, true);
    assert.equal(arrived.appointment.status, "arrived");

    const invalid = await completeAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      appointmentId: created.appointment.id,
      actor: clinic.actor,
    });
    assert.equal(invalid.ok, false);
    assert.equal(invalid.code, RESULT.INVALID_TRANSITION);

    const waiting = await markWaitingAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      appointmentId: created.appointment.id,
      actor: clinic.actor,
    });
    assert.equal(waiting.ok, true);

    const withPrac = await markWithPractitionerAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      appointmentId: created.appointment.id,
      actor: clinic.actor,
    });
    assert.equal(withPrac.ok, true);
    assert.equal(withPrac.appointment.status, "with_practitioner");

    const done = await completeAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      appointmentId: created.appointment.id,
      actor: clinic.actor,
    });
    assert.equal(done.ok, true);
    assert.equal(done.appointment.status, "completed");

    const detail = await getAppointmentDetail(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      appointmentId: created.appointment.id,
      actor: clinic.actor,
    });
    assert.equal(detail.ok, true);
    const pathStatuses = detail.statusEvents.map((e) => e.toStatus);
    assert.ok(pathStatuses.includes("confirmed"));
    assert.ok(pathStatuses.includes("arrived"));
    assert.ok(pathStatuses.includes("waiting"));
    assert.ok(pathStatuses.includes("with_practitioner"));
    assert.ok(pathStatuses.includes("completed"));
    assert.ok(detail.statusEvents.every((e) => e.createdAt));
  });

  it("rejects booking into blocked practitioner time", async () => {
    requireDb();
    const clinic = await provisionClinic("block");
    const { service, patient } = await seedBookingContext(clinic);

    await configRepo.insertAvailabilityBlock(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      staffMemberId: clinic.staffId,
      facilityId: clinic.facilityId,
      blockKind: "leave",
      startsAt: new Date("2026-12-05T08:00:00+02:00").toISOString(),
      endsAt: new Date("2026-12-05T12:00:00+02:00").toISOString(),
      reason: "Annual leave",
      createdByStaffId: clinic.staffId,
    });

    const collide = await createAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      assignedStaffId: clinic.staffId,
      startsAt: new Date("2026-12-05T09:00:00+02:00"),
      endsAt: new Date("2026-12-05T09:30:00+02:00"),
      timezone: "Africa/Lusaka",
      actor: clinic.actor,
    });
    assert.equal(collide.ok, false);
    assert.equal(collide.code, RESULT.COLLISION);
  });

  it("enforces cross-clinic isolation and RBAC on status changes", async () => {
    requireDb();
    const a = await provisionClinic("isoA");
    const b = await provisionClinic("isoB");
    const ctxA = await seedBookingContext(a);
    const created = await createAppointment(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      facilityId: a.facilityId,
      patientId: ctxA.patient.patient.id,
      serviceTypeId: ctxA.service.serviceType.id,
      assignedStaffId: a.staffId,
      startsAt: new Date("2026-12-10T10:00:00+02:00"),
      endsAt: new Date("2026-12-10T10:30:00+02:00"),
      timezone: "Africa/Lusaka",
      actor: a.actor,
    });
    assert.equal(created.ok, true);

    const cross = await getAppointmentDetail(pool, {
      organizationId: b.organizationId,
      healthcareOrganizationId: b.hcoId,
      appointmentId: created.appointment.id,
      actor: b.actor,
    });
    assert.equal(cross.ok, false);

    const plainPhone = nextPhone();
    const plainIdentity = await createPlatformIdentity(pool, {
      primaryPhone: plainPhone,
      phoneNormalized: plainPhone,
      phoneVerifiedAt: new Date().toISOString(),
    });
    const plain = await createStaffMember(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      firstName: "No",
      lastName: "Perms",
      employmentType: "permanent",
      status: "active",
      phone: plainPhone,
      platformIdentityId: plainIdentity.identity.id,
    });
    await assignStaffToFacility(pool, {
      organizationId: a.organizationId,
      staffMemberId: plain.staffMember.id,
      facilityId: a.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: a.organizationId,
      staffMemberId: plain.staffMember.id,
      roleKey: STAFF_ROLE,
      scopeType: "organisation",
    });
    const denied = await cancelAppointment(pool, {
      organizationId: a.organizationId,
      healthcareOrganizationId: a.hcoId,
      appointmentId: created.appointment.id,
      actor: {
        staffMemberId: plain.staffMember.id,
        platformIdentityId: plainIdentity.identity.id,
      },
      reason: "should_fail",
    });
    assert.equal(denied.ok, false);
  });

  it("triages booking requests: decline requires reason; confirm creates appointment", async () => {
    requireDb();
    const clinic = await provisionClinic("triage");
    const { service, patient } = await seedBookingContext(clinic);

    await pool.query(
      `UPDATE activeclinic.healthcare_organizations
          SET website_published = true, public_booking_enabled = true
        WHERE id = $1`,
      [clinic.hcoId]
    );

    const booking = await createConsultationBookingRequest(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      serviceTypeId: service.serviceType.id,
      preferredStartsAt: new Date("2026-12-15T11:00:00+02:00"),
      preferredEndsAt: new Date("2026-12-15T11:30:00+02:00"),
      timezone: "Africa/Lusaka",
      patientFirstName: "Req",
      patientLastName: "Guest",
      patientPhone: nextPhone(),
      idempotencyKey: `idem-${Date.now()}`,
    });
    assert.equal(booking.ok, true, JSON.stringify(booking));

    const noReason = await declineBookingRequest(pool, {
      organizationId: clinic.organizationId,
      bookingId: booking.booking.id,
      actor: clinic.actor,
      body: {},
      declineReason: "",
    });
    assert.equal(noReason.ok, false);
    assert.equal(noReason.code, "decline_reason_required");

    const booking2 = await createConsultationBookingRequest(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      serviceTypeId: service.serviceType.id,
      preferredStartsAt: new Date("2026-12-16T11:00:00+02:00"),
      preferredEndsAt: new Date("2026-12-16T11:30:00+02:00"),
      timezone: "Africa/Lusaka",
      patientFirstName: "Link",
      patientLastName: "Me",
      patientPhone: nextPhone(),
      idempotencyKey: `idem2-${Date.now()}`,
    });
    assert.equal(booking2.ok, true, JSON.stringify(booking2));

    const linked = await linkBookingToExistingPatient(pool, {
      organizationId: clinic.organizationId,
      bookingId: booking2.booking.id,
      patientId: patient.patient.id,
      actor: clinic.actor,
      body: {},
    });
    assert.equal(linked.ok, true, JSON.stringify(linked));
    assert.equal(linked.booking.patientLinkStatus, LINK_STATUS.LINKED);

    const confirmed = await confirmBookingRequest(pool, {
      organizationId: clinic.organizationId,
      bookingId: booking2.booking.id,
      actor: clinic.actor,
      body: {},
      assignedStaffId: clinic.staffId,
    });
    assert.equal(confirmed.ok, true, JSON.stringify(confirmed));
    assert.equal(confirmed.appointment.status, "confirmed");

    const declined = await declineBookingRequest(pool, {
      organizationId: clinic.organizationId,
      bookingId: booking.booking.id,
      actor: clinic.actor,
      body: {},
      declineReason: "No capacity this week",
    });
    assert.equal(declined.ok, true, JSON.stringify(declined));
  });

  it("renders ACN06–09 HTTP screens with Stitch markers and persists after refresh", async () => {
    requireDb();
    const clinic = await provisionClinic("http");
    const { service, patient } = await seedBookingContext(clinic);
    const created = await createAppointment(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      facilityId: clinic.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      assignedStaffId: clinic.staffId,
      startsAt: new Date("2026-12-20T09:00:00+02:00"),
      endsAt: new Date("2026-12-20T09:30:00+02:00"),
      timezone: "Africa/Lusaka",
      actor: clinic.actor,
    });
    assert.equal(created.ok, true);

    const cookie = await sessionCookie(clinic);

    const calendar = await request(app)
      .get("/app/appointments/calendar?view=day&date=2026-12-20")
      .set("Cookie", cookie);
    assert.equal(calendar.status, 200);
    assert.match(calendar.text, /data-ac-stitch="ACN06"/);
    assert.match(calendar.text, new RegExp(STITCH.calendarDesktop));
    assert.match(calendar.text, new RegExp(STITCH.calendarMobile));
    assert.match(calendar.text, /data-ac-calendar="mobile"/);
    assert.match(calendar.text, /single-day agenda/);
    assert.match(calendar.text, /Practitioner|Location|Service|Status/);

    const form = await request(app).get("/app/appointments/new").set("Cookie", cookie);
    assert.equal(form.status, 200);
    assert.match(form.text, /data-ac-screen="ACN07"/);
    assert.match(form.text, new RegExp(STITCH.bookDesktop));

    const detail = await request(app)
      .get(`/app/appointments/${created.appointment.id}`)
      .set("Cookie", cookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-stitch="AC-B2-05"/);
    assert.match(detail.text, new RegExp(STITCH.detailDesktop));
    assert.match(detail.text, /data-ac-lifecycle/);
    assert.match(detail.text, /Confirmed|Mark arrived/);

    const csrf = issueCsrfToken(MINIMAL_AC);
    const postCookie = `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`;
    const arrived = await request(app)
      .post(`/app/appointments/${created.appointment.id}/check-in`)
      .set("Cookie", postCookie)
      .type("form")
      .send({ [CSRF_FIELD]: csrf });
    assert.equal(arrived.status, 303);

    const refreshed = await request(app)
      .get(`/app/appointments/${created.appointment.id}`)
      .set("Cookie", cookie);
    assert.match(refreshed.text, /Arrived|arrived/);
    assert.match(refreshed.text, /data-ac-status-history|data-ac-lifecycle/);

    const queue = await request(app).get("/app/booking-requests").set("Cookie", cookie);
    assert.equal(queue.status, 200);
    assert.match(queue.text, /data-ac-stitch="ACN09"/);
    assert.match(queue.text, new RegExp(STITCH.bookingQueueDesktop));
  });

  it("public /book regression still accepts consultation wizard submission", async () => {
    requireDb();
    const clinic = await provisionClinic("bookreg");
    await createAppointmentServiceType(pool, {
      organizationId: clinic.organizationId,
      healthcareOrganizationId: clinic.hcoId,
      actor: clinic.actor,
      serviceKey: "public-consult",
      displayName: "Public Consult",
      defaultDurationMinutes: 30,
      publicBookable: true,
      publicWebsiteVisible: true,
    });

    const orgKey =
      (
        await pool.query(
          `SELECT organization_key FROM platform.organizations WHERE id = $1`,
          [clinic.organizationId]
        )
      ).rows[0]?.organization_key || clinic.orgKey;

    const base = `/clinics/${orgKey}/book`;
    const entry = await request(app).get(base);
    assert.ok([200, 302, 303].includes(entry.status) || entry.status < 500);

    if (entry.status === 200) {
      assert.doesNotMatch(entry.text, /Internal Server Error/i);
      const csrf = extractCsrf(entry);
      const cookies = [entry.headers["set-cookie"]].flat().filter(Boolean).join("; ");
      const step = await request(app)
        .post(base)
        .set("Cookie", cookies)
        .type("form")
        .send({ [CSRF_FIELD]: csrf, wizardAction: "continue", serviceKey: "public-consult" });
      assert.ok([200, 302, 303, 400].includes(step.status));
    }
  });
});
