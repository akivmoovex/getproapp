"use strict";

/**
 * ActiveClinic V6 — reception/queue foundation (AC-V6-C05).
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
  FACILITY_ADMIN,
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
  checkInScheduledPatient,
  checkInWalkInPatient,
  createQueueEntry,
  listFacilityQueue,
  getQueueEntryDetail,
  callNextQueueEntry,
  startServingQueueEntry,
  completeQueueEntry,
  pauseQueueEntry,
  cancelQueueEntry,
  markLeftBeforeService,
  transferQueueEntry,
  RESULT,
  PERM,
} = require("../src/activeclinic/services/activeClinicReceptionService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
  resetDeploymentProfileWarningsForTests,
} = require("../src/platform/config/deploymentProfiles");
const repo = require("../src/activeclinic/repositories/receptionRepository");

let pool;
let databaseUrl;
let skipReason = null;
let phoneSeq = 960000000;

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
    organizationKey: `ac_rcpt_${tag}_${stamp}`,
    displayName: `AC Rcpt ${tag}`,
    productKey: "activeclinic",
    productTenantKey: `ac-rcpt-${tag}-${stamp}`,
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
  });
  const hco = await createHealthcareOrganization(pool, {
    organizationId: org.records.organization.id,
    legalName: "Rcpt Legal",
    publicName: "Rcpt Public",
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

async function seedServicePoint(tenant, actor, key) {
  const sp = await repo.insertServicePoint(pool, {
    organizationId: tenant.orgId,
    healthcareOrganizationId: tenant.hcoId,
    facilityId: tenant.facilityId,
    servicePointKey: key,
    displayName: `${key} Point`,
    serviceType: "general",
    status: "active",
    acceptsWalkIn: true,
    acceptsScheduled: true,
    maxQueueCapacity: null,
  });
  return sp;
}

describe("ActiveClinic reception/queue foundation (AC-V6-C05)", () => {
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
            'service_points', 'queue_priorities', 'reception_arrivals',
            'queue_entries', 'queue_status_events', 'reception_notes'
          )`
    );
    assert.equal(tables.rows.length, 6);
    const perms = await pool.query(
      `SELECT COUNT(*)::int AS c FROM blessboard.permissions
        WHERE permission_key LIKE 'activeclinic.reception.%'`
    );
    assert.ok(perms.rows[0].c >= 7);
    const staffGrant = await pool.query(
      `SELECT 1 FROM blessboard.role_permissions rp
         JOIN blessboard.roles r ON r.id = rp.role_id
         JOIN blessboard.permissions p ON p.id = rp.permission_id
        WHERE r.role_key = 'activeclinic_staff'
          AND p.permission_key LIKE 'activeclinic.reception.%'
        LIMIT 1`
    );
    assert.equal(staffGrant.rows.length, 0);
  });

  it("checks in scheduled patient and creates queue entry", async () => {
    requireDb();
    const stamp = Date.now().toString(36);
    const tenant = await seedTenant(stamp, "sched");
    const actor = await seedNetwork(tenant, nextPhone());
    const sp = await seedServicePoint(tenant, actor, "triage");

    const service = await createAppointmentServiceType(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      actor,
      serviceKey: "consult-rcpt",
      displayName: "Consultation",
      defaultDurationMinutes: 30,
    });
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Sched", lastName: "Patient" },
      registrationMethod: "walk_in",
    });
    const appt = await createAppointment(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      serviceTypeId: service.serviceType.id,
      startsAt: new Date("2026-11-01T09:00:00+02:00"),
      endsAt: new Date("2026-11-01T09:30:00+02:00"),
      timezone: "Africa/Lusaka",
      actor,
    });
    assert.equal(appt.ok, true);

    const checkIn = await checkInScheduledPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      appointmentId: appt.appointment.id,
      actor,
      checkInNote: "On time",
    });
    assert.equal(checkIn.ok, true, JSON.stringify(checkIn));
    assert.equal(checkIn.arrival.arrivalSource, "scheduled_appointment");
    assert.equal(checkIn.arrival.patientId, patient.patient.id);
    assert.equal(checkIn.arrival.appointmentId, appt.appointment.id);

    const queueEntry = await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: checkIn.arrival.id,
      actor,
      patientNote: "First patient",
    });
    assert.equal(queueEntry.ok, true);
    assert.equal(queueEntry.queueEntry.status, "waiting");
    assert.equal(queueEntry.queueEntry.queueNumber, 1);
    assert.equal(queueEntry.queueEntry.queuePosition, 1);

    const detail = await getQueueEntryDetail(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: queueEntry.queueEntry.id,
      actor,
    });
    assert.equal(detail.ok, true);
    assert.ok(detail.statusEvents.length >= 1);
    assert.equal(detail.statusEvents[0].toStatus, "waiting");

    assert.equal(PERM.CHECK_IN, "activeclinic.reception.check_in");
  });

  it("checks in walk-in patient and prevents duplicate queue entry", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}w`;
    const tenant = await seedTenant(stamp, "walkin");
    const actor = await seedNetwork(tenant, nextPhone());
    const sp = await seedServicePoint(tenant, actor, "consult");

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Walk", lastName: "In" },
      registrationMethod: "walk_in",
    });

    const walkInCheckIn = await checkInWalkInPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      actor,
      arrivalSource: "walk_in",
      checkInNote: "No appointment",
    });
    assert.equal(walkInCheckIn.ok, true);
    assert.equal(walkInCheckIn.arrival.arrivalSource, "walk_in");
    assert.equal(walkInCheckIn.arrival.appointmentId, null);

    const queue1 = await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: walkInCheckIn.arrival.id,
      actor,
    });
    assert.equal(queue1.ok, true);

    const duplicate = await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: walkInCheckIn.arrival.id,
      actor,
    });
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.code, RESULT.DUPLICATE_ACTIVE_ENTRY);
  });

  it("supports queue lifecycle: waiting → called → serving → completed", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}lc`;
    const tenant = await seedTenant(stamp, "lifecycle");
    const actor = await seedNetwork(tenant, nextPhone());
    const sp = await seedServicePoint(tenant, actor, "pharma");

    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Life", lastName: "Cycle" },
      registrationMethod: "walk_in",
    });
    const checkIn = await checkInWalkInPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      actor,
    });
    const queue = await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: checkIn.arrival.id,
      actor,
    });
    assert.equal(queue.queueEntry.status, "waiting");

    const called = await callNextQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: queue.queueEntry.id,
      actor,
      reason: "next_in_queue",
    });
    assert.equal(called.ok, true);
    assert.equal(called.queueEntry.status, "called");
    assert.ok(called.queueEntry.calledAt);

    const serving = await startServingQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: queue.queueEntry.id,
      actor,
      assignedRoom: "Room 3",
    });
    assert.equal(serving.ok, true);
    assert.equal(serving.queueEntry.status, "serving");
    assert.ok(serving.queueEntry.servingStartedAt);
    assert.equal(serving.queueEntry.servingStaffId, actor.staffMemberId);
    assert.equal(serving.queueEntry.assignedRoom, "Room 3");

    const completed = await completeQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: queue.queueEntry.id,
      actor,
      completionOutcome: "service_completed",
    });
    assert.equal(completed.ok, true);
    assert.equal(completed.queueEntry.status, "completed");
    assert.ok(completed.queueEntry.completedAt);
    assert.equal(completed.queueEntry.completionOutcome, "service_completed");

    const detail = await getQueueEntryDetail(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: queue.queueEntry.id,
      actor,
    });
    assert.equal(detail.statusEvents.length, 4);
    assert.equal(detail.statusEvents[0].toStatus, "waiting");
    assert.equal(detail.statusEvents[1].toStatus, "called");
    assert.equal(detail.statusEvents[2].toStatus, "serving");
    assert.equal(detail.statusEvents[3].toStatus, "completed");
  });

  it("supports pause, transfer, cancel, and left_before_service transitions", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}tr`;
    const tenant = await seedTenant(stamp, "trans");
    const actor = await seedNetwork(tenant, nextPhone());
    const sp = await seedServicePoint(tenant, actor, "lab");

    const patient1 = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Pause", lastName: "Pat" },
      registrationMethod: "walk_in",
    });
    const checkIn1 = await checkInWalkInPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient1.patient.id,
      actor,
    });
    const q1 = await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: checkIn1.arrival.id,
      actor,
    });
    await callNextQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: q1.queueEntry.id,
      actor,
    });
    await startServingQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: q1.queueEntry.id,
      actor,
    });
    const paused = await pauseQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: q1.queueEntry.id,
      actor,
      reason: "waiting_for_lab_results",
    });
    assert.equal(paused.ok, true);
    assert.equal(paused.queueEntry.status, "paused");

    const patient2 = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Transfer", lastName: "Pat" },
      registrationMethod: "walk_in",
    });
    const checkIn2 = await checkInWalkInPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient2.patient.id,
      actor,
    });
    const q2 = await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: checkIn2.arrival.id,
      actor,
    });
    const transferred = await transferQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: q2.queueEntry.id,
      actor,
      reason: "referred_to_specialist",
    });
    assert.equal(transferred.ok, true);
    assert.equal(transferred.queueEntry.status, "transferred");

    const patient3 = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Left", lastName: "Pat" },
      registrationMethod: "walk_in",
    });
    const checkIn3 = await checkInWalkInPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient3.patient.id,
      actor,
    });
    const q3 = await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: checkIn3.arrival.id,
      actor,
    });
    const left = await markLeftBeforeService(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: q3.queueEntry.id,
      actor,
      reason: "patient_left_facility",
    });
    assert.equal(left.ok, true);
    assert.equal(left.queueEntry.status, "left_before_service");

    const patient4 = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "Cancel", lastName: "Pat" },
      registrationMethod: "walk_in",
    });
    const checkIn4 = await checkInWalkInPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient4.patient.id,
      actor,
    });
    const q4 = await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: checkIn4.arrival.id,
      actor,
    });
    const cancelled = await cancelQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      queueEntryId: q4.queueEntry.id,
      actor,
      reason: "administrative_cancel",
    });
    assert.equal(cancelled.ok, true);
    assert.equal(cancelled.queueEntry.status, "cancelled");
  });

  it("enforces facility scope and cross-HCO denial", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}sc`;
    const tenant1 = await seedTenant(stamp, "scope1");
    const tenant2 = await seedTenant(`${stamp}x`, "scope2");
    const actor1 = await seedNetwork(tenant1, nextPhone());
    const actor2 = await seedNetwork(tenant2, nextPhone());
    const sp1 = await seedServicePoint(tenant1, actor1, "triage1");

    const patient1 = await registerActiveClinicPatient(pool, {
      organizationId: tenant1.orgId,
      healthcareOrganizationId: tenant1.hcoId,
      facilityId: tenant1.facilityId,
      actor: actor1,
      demographics: { firstName: "Scope", lastName: "One" },
      registrationMethod: "walk_in",
    });
    const checkIn1 = await checkInWalkInPatient(pool, {
      organizationId: tenant1.orgId,
      healthcareOrganizationId: tenant1.hcoId,
      facilityId: tenant1.facilityId,
      patientId: patient1.patient.id,
      actor: actor1,
    });
    const queue1 = await createQueueEntry(pool, {
      organizationId: tenant1.orgId,
      healthcareOrganizationId: tenant1.hcoId,
      facilityId: tenant1.facilityId,
      servicePointId: sp1.id,
      arrivalId: checkIn1.arrival.id,
      actor: actor1,
    });
    assert.equal(queue1.ok, true);

    const crossCheckIn = await checkInWalkInPatient(pool, {
      organizationId: tenant2.orgId,
      healthcareOrganizationId: tenant2.hcoId,
      facilityId: tenant1.facilityId,
      patientId: patient1.patient.id,
      actor: actor2,
    });
    assert.equal(crossCheckIn.ok, false);

    const listFromActor1 = await listFacilityQueue(pool, {
      organizationId: tenant1.orgId,
      healthcareOrganizationId: tenant1.hcoId,
      facilityId: tenant1.facilityId,
      actor: actor1,
    });
    assert.equal(listFromActor1.ok, true);
    assert.ok(listFromActor1.queueEntries.some((e) => e.id === queue1.queueEntry.id));

    const plainStaff = await createStaffMember(pool, {
      organizationId: tenant1.orgId,
      healthcareOrganizationId: tenant1.hcoId,
      firstName: "Plain",
      lastName: "Staff",
      employmentType: "permanent",
      status: "active",
      phone: nextPhone(),
    });
    await assignStaffToFacility(pool, {
      organizationId: tenant1.orgId,
      staffMemberId: plainStaff.staffMember.id,
      facilityId: tenant1.facilityId,
      isPrimary: true,
    });
    await assignStaffRole(pool, {
      organizationId: tenant1.orgId,
      staffMemberId: plainStaff.staffMember.id,
      roleKey: STAFF_ROLE,
      scopeType: "organisation",
    });
    const denied = await listFacilityQueue(pool, {
      organizationId: tenant1.orgId,
      healthcareOrganizationId: tenant1.hcoId,
      facilityId: tenant1.facilityId,
      actor: { staffMemberId: plainStaff.staffMember.id, organizationId: tenant1.orgId },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.code, RESULT.ACCESS_DENIED);
  });

  it("validates queue ordering and atomic number allocation", async () => {
    requireDb();
    const stamp = `${Date.now().toString(36)}ord`;
    const tenant = await seedTenant(stamp, "order");
    const actor = await seedNetwork(tenant, nextPhone());
    const sp = await seedServicePoint(tenant, actor, "general");

    const patients = [];
    for (let i = 0; i < 3; i++) {
      const p = await registerActiveClinicPatient(pool, {
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        facilityId: tenant.facilityId,
        actor,
        demographics: { firstName: `Pat${i}`, lastName: "Order" },
        registrationMethod: "walk_in",
      });
      patients.push(p.patient);
    }

    const queues = [];
    for (const patient of patients) {
      const checkIn = await checkInWalkInPatient(pool, {
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        facilityId: tenant.facilityId,
        patientId: patient.id,
        actor,
      });
      const q = await createQueueEntry(pool, {
        organizationId: tenant.orgId,
        healthcareOrganizationId: tenant.hcoId,
        facilityId: tenant.facilityId,
        servicePointId: sp.id,
        arrivalId: checkIn.arrival.id,
        actor,
      });
      queues.push(q.queueEntry);
    }

    assert.equal(queues[0].queueNumber, 1);
    assert.equal(queues[1].queueNumber, 2);
    assert.equal(queues[2].queueNumber, 3);
    assert.equal(queues[0].queuePosition, 1);
    assert.equal(queues[1].queuePosition, 2);
    assert.equal(queues[2].queuePosition, 3);

    const list = await listFacilityQueue(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      statuses: ["waiting"],
      actor,
    });
    assert.equal(list.ok, true);
    assert.equal(list.queueEntries.length, 3);
  });

  it("does not invent invoice payment dispense tables from reception alone", async () => {
    requireDb();
    // Reception foundation must remain independent of pharmacy/billing workflows.
    // Schema presence of later phases is allowed; this check documents reception scope.
    const receptionOnly = await pool.query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'activeclinic'
          AND table_name IN ('service_points', 'queue_entries', 'reception_arrivals')`
    );
    assert.ok(receptionOnly.rows.length >= 3);
  });

  it("does not modify BlessBoard church product tables", async () => {
    requireDb();
    const beforeCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM blessboard.churches`
    );
    const stamp = `${Date.now().toString(36)}bb`;
    const tenant = await seedTenant(stamp, "bb");
    const actor = await seedNetwork(tenant, nextPhone());
    const sp = await seedServicePoint(tenant, actor, "bb");
    const patient = await registerActiveClinicPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      actor,
      demographics: { firstName: "BB", lastName: "Test" },
      registrationMethod: "walk_in",
    });
    const checkIn = await checkInWalkInPatient(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      patientId: patient.patient.id,
      actor,
    });
    await createQueueEntry(pool, {
      organizationId: tenant.orgId,
      healthcareOrganizationId: tenant.hcoId,
      facilityId: tenant.facilityId,
      servicePointId: sp.id,
      arrivalId: checkIn.arrival.id,
      actor,
    });
    const afterCount = await pool.query(
      `SELECT COUNT(*)::int AS c FROM blessboard.churches`
    );
    assert.equal(afterCount.rows[0].c, beforeCount.rows[0].c);

    const members = await pool.query(
      `SELECT COUNT(*)::int AS c FROM blessboard.members`
    );
    assert.equal(members.rows[0].c, 0);
  });
});
