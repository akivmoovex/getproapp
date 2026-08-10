"use strict";

/**
 * ActiveClinic V6 — appointment scheduling foundation (AC-V6-C03).
 */

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

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
  createStaffMember,
} = require("../src/activeclinic/services/activeClinicStaffService");
const {
  assignStaffToFacility,
} = require("../src/activeclinic/services/activeClinicStaffFacilityService");
const {
  assignStaffRole,
  RECEPTIONIST,
  STAFF_ROLE,
  FACILITY_ADMIN,
} = require("../src/activeclinic/services/activeClinicAuthorizationService");
const {
  registerActiveClinicPatient,
} = require("../src/activeclinic/services/activeClinicPatientService");
const {
  createAppointmentServiceType,
  createAppointment,
  listAppointments,
  getAppointmentDetail,
  cancelAppointment,
  checkInAppointment,
  rescheduleAppointment,
  appendAppointmentStatusEvent,
  RESULT,
  PERM,
} = require("../src/activeclinic/services/activeClinicAppointmentService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 850000000;

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

async function seedTenant(stamp, tag) {
  const org = await provisionOrg({
    organizationKey: `ac_appt_${tag}_${stamp}`,
    displayName: `AC Appt ${tag}`,
    productKey: "activeclinic",
    productTenantKey: `ac-appt-${tag}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Appt Legal",
    publicName: "Appt Public",
    organizationType: "private_healthcare",
    countryCode: "ZM",
    timezone: "Africa/Lusaka",
  });
  assert.equal(hco.ok, true);
  const facility = await createFacility(pool, {
    organizationId: org.records.organization.id,
    healthcareOrganizationId: hco.healthcareOrganization.id,
    facilityKey: `main-${tag}`.slice(0, 64),
    displayName: "Main",
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

async function seedNetwork(tenant, phone) {
  const staff = await createStaffMember(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    firstName: "Net",
    lastName: "Admin",
    employmentType: "permanent",
    status: "active",
    phone,
  });
  assert.equal(staff.ok, true);
  await assignStaffToFacility(pool, {
    organizationId: tenant.orgId,
    staffMemberId: staff.staffMember.id,
    facilityId: tenant.facilityId,
  });
  // Facility admin (schedule/service types) + receptionist (appointments/patients).
  for (const roleKey of [FACILITY_ADMIN, RECEPTIONIST]) {
    const role = await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      roleKey,
      scopeType: "facility",
      facilityId: tenant.facilityId,
    });
    assert.equal(role.ok, true, JSON.stringify(role));
  }
  return { staffMemberId: staff.staffMember.id, organizationId: tenant.orgId };
}

describe("ActiveClinic appointment foundation (AC-V6-C03)", () => {
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

  it("schema and permissions exist", async () => {
    requireDb();
    const tables = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'activeclinic'
          AND table_name IN (
            'appointment_service_types', 'appointments',
            'appointment_status_events', 'appointment_reminder_requests'
          )`
    );
    assert.equal(tables.rows.length, 4);
    const perms = await pool.query(
      `SELECT COUNT(*)::int AS c FROM blessboard.permissions
        WHERE permission_key LIKE 'activeclinic.appointment.%'`
    );
    assert.ok(perms.rows[0].c >= 7);
    const staffGrant = await pool.query(
      `SELECT 1 FROM blessboard.role_permissions rp
         JOIN blessboard.roles r ON r.id = rp.role_id
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE r.role_key = 'activeclinic_staff'
          AND p.permission_key LIKE 'activeclinic.appointment.%'
        LIMIT 1`
    );
    assert.equal(staffGrant.rows.length, 0);
  });

  it("creates appointments with status history, collisions, and scope", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedTenant(stamp, "a");
    const other = await seedTenant(`${stamp}o`, "b");
    const actor = await seedNetwork(tenant, nextPhone());
    const otherActor = await seedNetwork(other, nextPhone());

    const service = await createAppointmentServiceType(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor,
      serviceKey: "general-consult",
      displayName: "General consultation",
      defaultDurationMinutes: 30,
      requiresAssignedStaff: true,
    });
    assert.equal(service.ok, true, JSON.stringify(service));

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Appt", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    assert.equal(patient.ok, true);

    const staff = await createStaffMember(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      firstName: "Clin",
      lastName: "ician",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
    });
    assert.equal(staff.ok, true);
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: staff.staffMember.id,
      facilityId: tenant.facilityId,
      isPrimary: true,
    });

    const starts = new Date("2026-09-01T09:00:00+02:00");
    const ends = new Date("2026-09-01T09:30:00+02:00");
    const created = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      assignedStaffId: staff.staffMember.id,
      startsAt: starts,
      endsAt: ends,
      timezone: "Africa/Lusaka",
      actor,
      reminderChannel: "sms",
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    assert.equal(created.appointment.status, "scheduled");
    assert.equal(created.appointment.timezone, "Africa/Lusaka");

    const detail = await getAppointmentDetail(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      appointmentId: created.appointment.id,
      actor,
    });
    assert.equal(detail.ok, true);
    assert.ok(detail.statusEvents.length >= 1);

    const collision = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      assignedStaffId: staff.staffMember.id,
      startsAt: new Date("2026-09-01T09:15:00+02:00"),
      endsAt: new Date("2026-09-01T09:45:00+02:00"),
      timezone: "Africa/Lusaka",
      actor,
    });
    assert.equal(collision.ok, false);
    assert.equal(collision.code, RESULT.COLLISION);

    const cross = await createAppointment(pool, {
      organizationId: other.orgId,
      healthcareOrganizationId: other.hcoId,
      facilityId: other.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: starts,
      endsAt: ends,
      timezone: "Africa/Lusaka",
      actor: otherActor,
    });
    assert.equal(cross.ok, false);

    const checked = await checkInAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      appointmentId: created.appointment.id,
      actor,
    });
    assert.equal(checked.ok, true);
    assert.equal(checked.appointment.status, "checked_in");

    const cancelled = await cancelAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      appointmentId: created.appointment.id,
      actor,
      reason: "patient_request",
    });
    // checked_in -> cancelled is allowed
    assert.equal(cancelled.ok, true, JSON.stringify(cancelled));

    const reminders = await pool.query(
      `SELECT delivery_state FROM activeclinic.appointment_reminder_requests
        WHERE appointment_id = $1`,
      [created.appointment.id]
    );
    assert.equal(reminders.rows[0].delivery_state, "unavailable");
    assert.ok(!reminders.rows.some((r) => r.delivery_state === "sent"));

    const encounters = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'activeclinic' AND table_name LIKE '%encounter%'`
    );
    // P04 clinical foundation introduced encounter tables; appointments must
    // still function without creating encounter rows from this booking path.
    assert.ok(encounters.rows.length >= 1);
    const encounterRows = await pool.query(
      `SELECT COUNT(*)::int AS c FROM activeclinic.encounters
        WHERE organization_id = $1`,
      [tenant.orgId]
    );
    assert.equal(encounterRows.rows[0].c, 0);

    assert.equal(PERM.CREATE, "activeclinic.appointment.create");
  });

  it("lists appointments with facility scope and supports reschedule", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}r`;
    const tenant = await seedTenant(stamp, "r");
    const actor = await seedNetwork(tenant, nextPhone());
    const service = await createAppointmentServiceType(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor,
      serviceKey: "follow-up",
      displayName: "Follow up",
      defaultDurationMinutes: 20,
    });
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Res", lastName: "Ched" },
      registrationMethod: "walk_in",
    });
    const created = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: new Date("2026-10-01T10:00:00+02:00"),
      endsAt: new Date("2026-10-01T10:20:00+02:00"),
      timezone: "Africa/Lusaka",
      actor,
    });
    assert.equal(created.ok, true);

    const listed = await listAppointments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor,
      startsFrom: new Date("2026-10-01T00:00:00+02:00"),
      startsTo: new Date("2026-10-02T00:00:00+02:00"),
    });
    assert.equal(listed.ok, true);
    assert.ok(listed.appointments.some((a) => a.id === created.appointment.id));

    const rescheduled = await rescheduleAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      appointmentId: created.appointment.id,
      startsAt: new Date("2026-10-02T11:00:00+02:00"),
      endsAt: new Date("2026-10-02T11:20:00+02:00"),
      actor,
    });
    assert.equal(rescheduled.ok, true, JSON.stringify(rescheduled));
    assert.ok(rescheduled.appointment.rescheduledFromAppointmentId);

    const noShowSeed = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: new Date("2026-10-03T09:00:00+02:00"),
      endsAt: new Date("2026-10-03T09:20:00+02:00"),
      timezone: "Africa/Lusaka",
      actor,
    });
    assert.equal(noShowSeed.ok, true);
    const noShow = await appendAppointmentStatusEvent(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      appointmentId: noShowSeed.appointment.id,
      actor,
      toStatus: "no_show",
      reason: "patient_no_show",
    });
    assert.equal(noShow.ok, true);
    assert.equal(noShow.appointment.status, "no_show");

    const plain = await createStaffMember(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      firstName: "No",
      lastName: "Appt",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
    });
    await assignStaffToFacility(pool, {
      organizationId: tenant.orgId,
      staffMemberId: plain.staffMember.id,
      facilityId: tenant.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: tenant.orgId,
      staffMemberId: plain.staffMember.id,
      roleKey: STAFF_ROLE,
      scopeType: "organisation",
    });
    const denied = await listAppointments(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor: { staffMemberId: plain.staffMember.id, organizationId: tenant.orgId },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, RESULT.ACCESS_DENIED);

    void FACILITY_ADMIN;
  });
});
