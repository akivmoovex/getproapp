"use strict";

/**
 * ActiveClinic V2.03 Batch 2 — appointments workspace (AC-B2-04 / AC-B2-05).
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

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
  ensureDefaultDepartments,
} = require("../src/activeclinic/services/activeClinicDepartmentService");
const {
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
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

function requireDb() {
  if (skipReason) assert.fail(`Local PostgreSQL unavailable: ${skipReason}`);
}

function withCsrf(cookie) {
  const csrf = issueCsrfToken(MINIMAL_AC);
  return {
    cookie: `${cookie}; ${CSRF_COOKIE_ACTIVECLINIC_ORG}=${csrf}`,
    csrf,
  };
}

async function seedAcTenant(stamp, keyPrefix) {
  const org = await provisionPlatformTenant(pool, {
    skipDomain: true,
    dataEnvironment: "testing",
    organizationKey: `${keyPrefix}_${stamp}`,
    displayName: `AC ${keyPrefix}`,
    productKey: "activeclinic",
    productTenantKey: `${keyPrefix}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  assert.equal(org.ok, true, JSON.stringify(org));
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Legal Hospital",
    publicName: "Batch2 Appt Clinic",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true, JSON.stringify(hco));
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: "main",
    displayName: "Main Facility",
    facilityType: "hospital",
    status: "active",
    isPrimary: true,
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
    phone: nextPhone(),
    city: "Lusaka",
  });
  assert.equal(facility.ok, true, JSON.stringify(facility));
  await ensureDefaultDepartments(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  });
  return {
    orgId: org.records.organization.id,
    hcoId: hco.healthcareOrganization.id,
    facilityId: facility.facility.id,
  };
}

async function seedStaff(ac, opts) {
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
    organizationId: ac.orgId,
    healthcareOrganizationId: ac.hcoId,
    firstName: opts.firstName || "Appt",
    lastName: opts.lastName || "Staff",
    employmentType: "permanent",
    phone,
    status: "active",
    platformIdentityId: identity.identity.id,
    jobTitle: opts.jobTitle || "Staff",
  });
  assert.equal(staff.ok, true, JSON.stringify(staff));
  await assignStaffToFacility(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: ac.facilityId,
    isPrimary: true,
  });
  await assignStaffRole(pool, {
    organizationId: ac.orgId,
    staffMemberId: staff.staffMember.id,
    roleKey: opts.roleKey || NETWORK_ADMIN,
    scopeType: opts.scopeType || "organisation",
    facilityId: opts.scopeType === "facility" ? ac.facilityId : null,
  });
  return { identity: identity.identity, staff: staff.staffMember };
}

async function sessionCookie(identityId, orgId, facilityId) {
  const session = await createPlatformIdentitySession(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    platformIdentityId: identityId,
    organizationId: orgId,
    contextJson: facilityId ? { selectedFacilityId: facilityId } : {},
  });
  assert.equal(session.ok, true, JSON.stringify(session));
  return `${COOKIE_ACTIVECLINIC_ORG}=${session.rawToken}`;
}

describe("ActiveClinic V2.03 Batch 2 appointments workspace", () => {
  before(async () => {
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

  it("ships B2 list/detail composition markers and 390px CSS", () => {
    const css = fs.readFileSync(
      path.join(__dirname, "../public/activeclinic/ac-app.css"),
      "utf8"
    );
    assert.match(css, /\.ac-appointments--b2/);
    assert.match(css, /\.ac-appointment-detail--b2/);
    assert.match(css, /@media \(max-width: 390px\)[\s\S]*\.ac-appointments-summary/);

    const list = fs.readFileSync(
      path.join(__dirname, "../views/activeclinic/app/appointments-list-content.ejs"),
      "utf8"
    );
    assert.match(list, /data-ac-stitch="AC-B2-04"/);
    assert.match(list, /ac-appointments-desktop/);
    assert.match(list, /ac-appointments-mobile/);
    assert.match(list, /gp-ops-status-badge/);

    const detail = fs.readFileSync(
      path.join(__dirname, "../views/activeclinic/app/appointment-detail-content.ejs"),
      "utf8"
    );
    assert.match(detail, /data-ac-stitch="AC-B2-05"/);
    assert.match(detail, /data-ac-action="check-in"/);
    assert.match(detail, /data-ac-action="reschedule"/);
    assert.match(detail, /data-ac-action="cancel"/);
    assert.match(detail, /gp-ops-timeline|data-ac-status-history/);
  });

  it("list/detail respect RBAC, filters, and existing check-in flow", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const ac = await seedAcTenant(stamp, "b2ap");
    const admin = await seedStaff(ac, {
      firstName: "Fac",
      lastName: "Admin",
      roleKey: FACILITY_ADMIN,
      scopeType: "facility",
    });
    const reception = await seedStaff(ac, {
      firstName: "Desk",
      lastName: "Lead",
      roleKey: RECEPTIONIST,
      scopeType: "facility",
    });
    const restricted = await seedStaff(ac, {
      firstName: "No",
      lastName: "Appts",
      roleKey: STAFF_ROLE,
      scopeType: "facility",
    });

    const registrarActor = {
      staffMemberId: reception.staff.id,
      organizationId: ac.orgId,
      platformIdentityId: reception.identity.id,
    };
    const schedulerActor = {
      staffMemberId: admin.staff.id,
      organizationId: ac.orgId,
      platformIdentityId: admin.identity.id,
    };
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      actor: registrarActor,
      demographics: {
        firstName: "Booked",
        lastName: "Patient",
        dateOfBirth: "1990-02-02",
      },
      contacts: { phone: nextPhone() },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true, JSON.stringify(patient));

    const service = await createAppointmentServiceType(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      actor: schedulerActor,
      serviceKey: "general_consult",
      displayName: "General consult",
      defaultDurationMinutes: 30,
    });
    assert.equal(service.ok, true, JSON.stringify(service));

    const starts = new Date("2026-11-15T09:00:00.000Z");
    const ends = new Date("2026-11-15T09:30:00.000Z");
    const booked = await createAppointment(pool, {
      organizationId: ac.orgId,
      healthcareOrganizationId: ac.hcoId,
      facilityId: ac.facilityId,
      actor: registrarActor,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: starts,
      endsAt: ends,
      timezone: "Africa/Lusaka",
      assignedStaffId: reception.staff.id,
    });
    assert.equal(booked.ok, true, JSON.stringify(booked));

    const app = createActiveClinicFoundationApp({
      getPool: () => pool,
      env: MINIMAL_AC,
      log: () => {},
    });
    const adminCookie = await sessionCookie(admin.identity.id, ac.orgId, ac.facilityId);
    const recCookie = await sessionCookie(
      reception.identity.id,
      ac.orgId,
      ac.facilityId
    );
    const staffCookie = await sessionCookie(
      restricted.identity.id,
      ac.orgId,
      ac.facilityId
    );

    const denied = await request(app)
      .get("/app/appointments")
      .set("Cookie", staffCookie);
    assert.equal(denied.status, 403);

    const list = await request(app)
      .get("/app/appointments?date=2026-11-15&date_to=2026-11-15")
      .set("Cookie", recCookie);
    assert.equal(list.status, 200);
    assert.match(list.text, /data-ac-stitch="AC-B2-04"/);
    assert.match(list.text, /ac-appointments--b2/);
    assert.match(list.text, /Booked Patient/);
    assert.match(list.text, /data-ac-status-summary="appointments"/);
    assert.match(list.text, /Scheduled|Confirmed|Checked in/);

    const detail = await request(app)
      .get(`/app/appointments/${booked.appointment.id}`)
      .set("Cookie", recCookie);
    assert.equal(detail.status, 200);
    assert.match(detail.text, /data-ac-stitch="AC-B2-05"/);
    assert.match(detail.text, /data-ac-appointment-actions="1"/);
    assert.match(detail.text, /Check-in|Confirm|Reschedule|Cancel/);
    assert.doesNotMatch(detail.text, /Avg wait:|Facility Capacity/);

    const csrf = withCsrf(recCookie);
    const checked = await request(app)
      .post(`/app/appointments/${booked.appointment.id}/check-in`)
      .set("Cookie", csrf.cookie)
      .type("form")
      .send({ [CSRF_FIELD]: csrf.csrf });
    assert.ok([200, 302, 303].includes(checked.status));

    const after = await request(app)
      .get(`/app/appointments/${booked.appointment.id}`)
      .set("Cookie", recCookie);
    assert.equal(after.status, 200);
    assert.match(after.text, /Arrived|Waiting|Checked/i);
  });
});
