"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createConsultationBookingRequest } = require(
  "../../../src/activeclinic/services/activeClinicPublicBookingService"
);
const {
  ADMISSION_ENV,
  ADMISSION_VALUE,
} = require("../../../src/activeclinic/services/publicBookingAdmission");
const { evaluateSlotCapacity } = require(
  "../../../src/activeclinic/services/appointmentSchedulingRules"
);

const ORG = "11111111-1111-4111-8111-111111111111";
const HCO = "22222222-2222-4222-8222-222222222222";
const FACILITY = "33333333-3333-4333-8333-333333333333";
const BOOKING = "44444444-4444-4444-8444-444444444444";

function bookingDb({ conflict, recover }) {
  let inserts = 0;
  return {
    inserts: () => inserts,
    async query(sql) {
      if (sql.includes("public_booking_enabled")) {
        return { rows: [{ id: FACILITY, status: "active", public_booking_enabled: true }] };
      }
      if (sql.includes("INSERT INTO activeclinic.public_booking_requests")) {
        inserts += 1;
        if (conflict) {
          const error = new Error("unique_violation");
          error.code = "23505";
          throw error;
        }
      }
      if (sql.includes("idempotency_key")) {
        if (!recover || inserts === 0) return { rows: [] };
        return {
          rows: [{
            id: BOOKING,
            request_number: "BK-1",
            status: "submitted_pending_confirmation",
            created_at: "2026-12-01T09:00:00.000Z",
          }],
        };
      }
      return { rows: [] };
    },
  };
}

const input = {
  organizationId: ORG,
  healthcareOrganizationId: HCO,
  facilityId: FACILITY,
  patientFirstName: "Pat",
  patientLastName: "Ient",
  patientPhone: "+260977000222",
  idempotencyKey: "d48-retry-key",
  env: {
    DEPLOYMENT_ENV: "testing",
    [ADMISSION_ENV]: ADMISSION_VALUE,
  },
};

describe("D48 public booking retry", () => {
  it("returns the stored request when a simultaneous insert hits the existing unique key", async () => {
    const db = bookingDb({ conflict: true, recover: true });
    const result = await createConsultationBookingRequest(db, input);
    assert.equal(result.duplicate, true);
    assert.equal(result.booking.id, BOOKING);
    assert.equal(result.booking.accessToken, null);
    assert.equal(db.inserts(), 1);
  });

  it("does not invent a booking when the unique violation is not that key", async () => {
    const db = bookingDb({ conflict: true, recover: false });
    await assert.rejects(
      () => createConsultationBookingRequest(db, input),
      (error) => error.code === "23505"
    );
  });

  it("keeps slot capacity unapproved", () => {
    const capacity = evaluateSlotCapacity();
    assert.equal(capacity.code, "BLOCKED_APPROVAL_REQUIRED");
    assert.equal(capacity.capacity, null);
  });
});
