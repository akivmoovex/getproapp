"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createAppointment,
  updateAppointment,
  listAvailableAppointmentSlots,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicAppointmentService");
const {
  intervalsOverlap,
  isBlockingAppointmentStatus,
  staffOverlapApplies,
  classifyIdempotentRetry,
  evaluateSlotCapacity,
  BLOCKING_APPOINTMENT_STATUSES,
} = require("../../../src/activeclinic/services/appointmentSchedulingRules");

const ORG = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";

function throwingDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

describe("D39 appointment scheduling rules", () => {
  it("rejects an unusable assigned staff id before any query", async () => {
    const input = {
      organizationId: ORG,
      healthcareOrganizationId: ORG,
      facilityId: ORG,
      patientId: ORG,
      serviceTypeId: ORG,
      assignedStaffId: "not-a-staff-id",
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T09:30:00.000Z",
      actor: { staffMemberId: STAFF },
    };
    const created = await createAppointment(throwingDb(), input);
    assert.equal(created.code, RESULT.INVALID_INPUT);
    const updated = await updateAppointment(throwingDb(), input);
    assert.equal(updated.code, RESULT.INVALID_INPUT);
    const slots = await listAvailableAppointmentSlots(throwingDb(), input);
    assert.equal(slots.code, RESULT.INVALID_INPUT);
    assert.deepEqual(slots.slots, []);
  });

  it("treats touching intervals as free and overlapping intervals as taken", () => {
    const nine = "2026-12-01T09:00:00.000Z";
    const nineThirty = "2026-12-01T09:30:00.000Z";
    const ten = "2026-12-01T10:00:00.000Z";
    assert.equal(intervalsOverlap(nine, nineThirty, nineThirty, ten), false);
    assert.equal(intervalsOverlap(nine, ten, nineThirty, ten), true);
    assert.equal(intervalsOverlap(ten, nine, nine, nineThirty), false);
    assert.equal(staffOverlapApplies(null), false);
    assert.equal(staffOverlapApplies(STAFF), true);
  });

  it("uses only the stored blocking statuses and does not invent a capacity", () => {
    for (const status of BLOCKING_APPOINTMENT_STATUSES) {
      assert.equal(isBlockingAppointmentStatus(status), true);
    }
    assert.equal(isBlockingAppointmentStatus("cancelled"), false);
    assert.equal(isBlockingAppointmentStatus("completed"), false);
    assert.equal(isBlockingAppointmentStatus("no_show"), false);
    const capacity = evaluateSlotCapacity();
    assert.equal(capacity.code, "BLOCKED_APPROVAL_REQUIRED");
    assert.equal(capacity.capacity, null);
    const retry = classifyIdempotentRetry({ id: ORG });
    assert.equal(retry.duplicate, true);
    assert.equal(retry.capacity, null);
    assert.equal(retry.protection, "request_dedup_not_slot_lock");
  });
});
