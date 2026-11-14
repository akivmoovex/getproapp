"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

describe("D48 appointment contract", () => {
  it("keeps staff overlap unlocked and recovers only an idempotency conflict", () => {
    const appointments = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicAppointmentService.js"),
      "utf8"
    );
    assert.equal(appointments.includes("FOR UPDATE"), false);
    assert.equal(appointments.includes("slot_capacity"), false);
    assert.equal(appointments.includes("evaluateSlotCapacity"), false);
    const booking = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPublicBookingService.js"),
      "utf8"
    );
    assert.match(booking, /err\.code !== "23505"/);
    assert.match(booking, /b\.organization_id = \$1 AND b\.idempotency_key = \$2/);
    assert.equal(booking.includes("slot_capacity"), false);
  });
});
