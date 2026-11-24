"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");
const appointment = fs.readFileSync(
  path.join(root, "src/activeclinic/services/activeClinicAppointmentService.js"),
  "utf8"
);
const booking = fs.readFileSync(
  path.join(root, "src/activeclinic/services/activeClinicPublicBookingService.js"),
  "utf8"
);
const billing = fs.readFileSync(
  path.join(root, "src/activeclinic/services/activeClinicBillingService.js"),
  "utf8"
);

function createAppointmentBody() {
  const start = appointment.indexOf("async function createAppointment(");
  const end = appointment.indexOf("async function listAppointments(");
  return appointment.slice(start, end);
}

describe("D65 appointment and transaction contracts", () => {
  it("rechecks staff overlap inside the insert transaction", () => {
    const body = createAppointmentBody();
    const begin = body.indexOf('await client.query("BEGIN")');
    const lock = body.indexOf("lockStaffAppointmentScope");
    const insert = body.indexOf("insertAppointment");
    assert.equal(begin >= 0, true);
    assert.equal(lock > begin, true);
    assert.equal(insert > lock, true);
    assert.equal(appointment.includes("FOR UPDATE"), false);
    assert.equal(appointment.includes("slot_capacity"), false);
  });

  it("keeps public booking retry scoped to the organization and without a second token", () => {
    const start = booking.indexOf("async function recoverIdempotentBooking");
    const body = booking.slice(start, booking.indexOf("async function", start + 10));
    assert.match(body, /err\.code !== "23505"/);
    assert.match(body, /b\.organization_id = \$1 AND b\.idempotency_key = \$2/);
    assert.match(body, /accessToken: null/);
  });

  it("keeps payment idempotency on the tenant and rolls the transaction back", () => {
    const start = billing.indexOf("if (idempotencyKey)");
    const body = billing.slice(start, billing.indexOf("const paymentNumber", start));
    assert.match(body, /p\.idempotency_key = \$1/);
    assert.match(body, /p\.tenant_id = \$2/);
    assert.match(body, /dupCheck\.rows\.length > 0/);
    assert.match(body, /ROLLBACK/);
    assert.match(body, /DUPLICATE_SUBMISSION/);
    assert.equal(body.includes("INSERT"), false);
  });
});
