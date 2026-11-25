"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D25 appointment contract", () => {
  it("rechecks assigned-staff overlap inside the create transaction and does not lock a slot capacity", () => {
    const service = read("src/activeclinic/services/activeClinicAppointmentService.js");
    const start = service.indexOf("async function createAppointment(");
    const end = service.indexOf("async function listAppointments(");
    const body = service.slice(start, end);
    const begin = body.indexOf('await client.query("BEGIN")');
    const lock = body.indexOf("lockStaffAppointmentScope");
    const insert = body.indexOf("insertAppointment");
    assert.ok(begin >= 0 && lock > begin && insert > lock);
    assert.match(service, /appointment_collision/);
    assert.match(service, /if \(assignedStaffId\)/);
    assert.doesNotMatch(service, /FOR UPDATE/);
    assert.doesNotMatch(service, /slot_capacity|capacity_limit/);
    assert.doesNotMatch(service, /evaluateSlotCapacity/);
  });

  it("keeps facility and organization scope on the create path", () => {
    const service = read("src/activeclinic/services/activeClinicAppointmentService.js");
    assert.match(service, /FACILITY_NOT_FOUND/);
    assert.match(service, /healthcareOrganizationId !== healthcareOrganizationId/);
    assert.match(service, /getPatientByOrgAndId/);
    assert.match(service, /PATIENT_NOT_FOUND/);
  });

  it("has no appointment capacity column or exclusion constraint", () => {
    const migration = read("db/migrations/activeclinic/013_appointments.sql");
    assert.match(migration, /CREATE TABLE IF NOT EXISTS activeclinic.appointments/);
    assert.doesNotMatch(migration, /capacity/i);
    assert.doesNotMatch(migration, /EXCLUDE/);
    assert.match(migration, /CREATE INDEX IF NOT EXISTS appointments_staff_starts_idx/);
    assert.doesNotMatch(migration, /CREATE UNIQUE INDEX[\s\S]*assigned_staff_id/);
  });

  it("deduplicates a public booking retry by organization and idempotency key", () => {
    const booking = read("src/activeclinic/services/activeClinicPublicBookingService.js");
    const migration = read("db/migrations/activeclinic/019_public_website_and_booking.sql");
    const lookup = booking.indexOf("const existingRow = await db.query");
    const insert = booking.indexOf("INSERT INTO activeclinic.public_booking_requests");
    assert.ok(lookup > 0 && insert > lookup);
    assert.match(booking, /duplicate: true/);
    assert.match(migration, /public_booking_requests_idempotency_unique UNIQUE \(organization_id, idempotency_key\)/);
  });

  it("rolls back a stale appointment version and does not revive a cancelled appointment", () => {
    const service = read("src/activeclinic/services/activeClinicAppointmentService.js");
    assert.match(service, /STALE_VERSION/);
    assert.match(service, /await client\.query\("ROLLBACK"\)/);
    assert.match(service, /confirmed: \["arrived", "waiting", "cancelled", "no_show"\]/);
    assert.match(service, /cancelled: \[\]/);
  });
});
