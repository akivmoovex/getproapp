"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createAppointment, RESULT } = require("../../../src/activeclinic/services/activeClinicAppointmentService");
const {
  intervalsOverlap,
  isUsableAssignedStaffId,
  staffOverlapApplies,
} = require("../../../src/activeclinic/services/appointmentSchedulingRules");

const ORG = "11111111-1111-4111-8111-111111111111";
const STAFF = "22222222-2222-4222-8222-222222222222";

function throwingDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

describe("D98 implemented appointment boundaries", () => {
  it("accepts a blank staff id and rejects a malformed one before a query", async () => {
    assert.equal(isUsableAssignedStaffId(null), true);
    assert.equal(isUsableAssignedStaffId("   "), true);
    assert.equal(isUsableAssignedStaffId(`  ${STAFF}  `), true);
    assert.equal(isUsableAssignedStaffId("not-a-staff-id"), false);
    assert.equal(staffOverlapApplies("   "), false);
    assert.equal(staffOverlapApplies(STAFF), true);

    const input = {
      organizationId: ORG,
      healthcareOrganizationId: ORG,
      facilityId: ORG,
      patientId: ORG,
      serviceTypeId: ORG,
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T09:30:00.000Z",
      actor: { staffMemberId: STAFF },
    };
    const malformed = await createAppointment(throwingDb(), {
      ...input,
      assignedStaffId: "not-a-staff-id",
    });
    assert.equal(malformed.ok, false);
    assert.equal(malformed.code, RESULT.INVALID_INPUT);
    assert.equal(malformed.appointment, null);
    await assert.rejects(
      () => createAppointment(throwingDb(), { ...input, assignedStaffId: "   " }),
      /db_not_allowed/
    );
  });

  it("does not treat an invalid timestamp as an overlap", () => {
    assert.equal(
      intervalsOverlap("not-a-time", "2026-12-01T09:30:00.000Z", "2026-12-01T09:00:00.000Z", "2026-12-01T10:00:00.000Z"),
      false
    );
    assert.equal(
      intervalsOverlap("2026-12-01T10:00:00.000Z", "2026-12-01T09:00:00.000Z", "2026-12-01T09:00:00.000Z", "2026-12-01T09:30:00.000Z"),
      false
    );
  });
});
