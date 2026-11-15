"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

describe("D87 visit contracts", () => {
  it("keeps check-in, encounter states, and capacity inside the current contract", () => {
    const appointments = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicAppointmentService.js"),
      "utf8"
    );
    const scope = fs.readFileSync(
      path.join(root, "src/activeclinic/services/clinicalScope.js"),
      "utf8"
    );
    const clinical = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicClinicalService.js"),
      "utf8"
    );
    assert.match(appointments, /toStatus: "arrived"/);
    assert.equal(appointments.includes("FOR UPDATE"), false);
    assert.equal(appointments.includes("slot_capacity"), false);
    assert.match(scope, /"open", "completed", "cancelled"/);
    assert.equal(scope.includes("\"admitted\""), false);
    assert.equal(/systolic\s*[<>=]/.test(clinical), false);
  });
});
