"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

describe("D86 patient contract", () => {
  it("does not merge patients or open a session from registration", () => {
    const patient = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientService.js"),
      "utf8"
    );
    const domain = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientDomainService.js"),
      "utf8"
    );
    const registration = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientPortalRegistrationService.js"),
      "utf8"
    );
    assert.equal(patient.includes("function mergePatient"), false);
    assert.equal(domain.includes("function mergePatient"), false);
    assert.equal(registration.includes("createSession"), false);
    assert.match(domain, /portal activation is optional/);
  });
});
