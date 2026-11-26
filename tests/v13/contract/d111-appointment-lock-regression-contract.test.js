"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const service = fs.readFileSync(
  path.join(root, "src/activeclinic/services/activeClinicAppointmentService.js"),
  "utf8"
);
const repository = fs.readFileSync(
  path.join(root, "src/activeclinic/repositories/appointmentRepository.js"),
  "utf8"
);

function body(name, nextName) {
  const start = service.indexOf(`async function ${name}(`);
  const end = nextName ? service.indexOf(`\nasync function ${nextName}`, start) : service.length;
  assert.ok(start >= 0, `${name} exists`);
  return service.slice(start, end);
}

describe("D111 appointment lock regression contract", () => {
  it("uses the current transaction-scoped lock helper for create, update, and reschedule", () => {
    for (const [name, next] of [
      ["createAppointment", "listAppointments"],
      ["updateAppointment", "rescheduleAppointment"],
      ["rescheduleAppointment", null],
    ]) {
      const section = body(name, next);
      const begin = section.indexOf('await client.query("BEGIN")');
      const lock = section.indexOf("lockStaffAppointmentScope");
      const collision = section.indexOf("RESULT.COLLISION");
      assert.ok(begin >= 0 && lock > begin, `${name} locks after BEGIN`);
      assert.ok(collision >= 0, `${name} preserves collision handling`);
    }
  });

  it("checks overlap on the transaction client and rolls back failures", () => {
    const helper = service.slice(
      service.indexOf("async function lockStaffAppointmentScope"),
      service.indexOf("\nasync function withClient")
    );
    assert.match(helper, /repo\.findStaffCollision\(client/);
    for (const name of ["createAppointment", "updateAppointment", "rescheduleAppointment"]) {
      const section = body(name, name === "createAppointment" ? "listAppointments" : name === "updateAppointment" ? "rescheduleAppointment" : null);
      assert.match(section, /await client\.query\("ROLLBACK"\)/, `${name} rollback`);
    }
  });

  it("preserves the approved advisory-lock algorithm and avoids unapproved local APIs", () => {
    assert.match(service, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
    assert.doesNotMatch(service, /hashtextextended|assignedStaffLockKey|lockAssignedStaffResources/);
    assert.doesNotMatch(repository, /hashtextextended|assignedStaffLockKey|lockAssignedStaffResources/);
  });

  it("keeps overlap boundaries, cancellation, version, tenant, and facility protections in the current contracts", () => {
    assert.match(repository, /starts_at < \$5/);
    assert.match(repository, /ends_at > \$4/);
    assert.match(repository, /organization_id = \$2/);
    assert.match(repository, /healthcare_organization_id = \$3/);
    assert.match(repository, /status IN \(\s*'requested', 'confirmed', 'arrived'/);
    assert.match(service, /expectedVersion/);
    assert.match(service, /resolveFacilityScope/);
  });
});
