"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

describe("D39 appointment contract", () => {
  it("keeps capacity and row locks out of the appointment service", () => {
    const source = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicAppointmentService.js"),
      "utf8"
    );
    assert.equal(source.includes("FOR UPDATE"), false);
    assert.equal(source.includes("slot_capacity"), false);
    assert.match(source, /isUsableAssignedStaffId/);
    const rules = fs.readFileSync(
      path.join(root, "src/activeclinic/services/appointmentSchedulingRules.js"),
      "utf8"
    );
    assert.match(rules, /BLOCKED_APPROVAL_REQUIRED/);
    assert.doesNotMatch(rules, /capacity:\s*[1-9]/);
  });

  it("prepares the overlap race without opening a pool by default", () => {
    const source = fs.readFileSync(
      path.join(root, "tests/v13/integration/d25-appointment-concurrency.integration.test.js"),
      "utf8"
    );
    assert.match(source, /runGated/);
    assert.match(source, /D39-STAFF-OVERLAP-RACE/);
    assert.match(source, /APT-01-03_OPTION_C_POLICY/);
  });
});
