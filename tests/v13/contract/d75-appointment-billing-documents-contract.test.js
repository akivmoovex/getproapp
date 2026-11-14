"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

describe("D75 appointment, billing and document contracts", () => {
  it("does not lock an appointment slot or approve a capacity number", () => {
    const source = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicAppointmentService.js"),
      "utf8"
    );
    const rules = fs.readFileSync(
      path.join(root, "src/activeclinic/services/appointmentSchedulingRules.js"),
      "utf8"
    );
    assert.equal(source.includes("FOR UPDATE"), false);
    assert.equal(source.includes("slot_capacity"), false);
    assert.match(rules, /BLOCKED_APPROVAL_REQUIRED/);
    assert.match(rules, /capacity: null/);
  });

  it("keeps a document write inside the stored facility and does not merge scans", () => {
    const source = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicClinicalDocumentService.js"),
      "utf8"
    );
    const repo = fs.readFileSync(
      path.join(root, "src/activeclinic/repositories/clinicalDocumentRepository.js"),
      "utf8"
    );
    assert.match(source, /clinical_attachment/);
    assert.match(repo, /facility_id = \$9/);
    assert.match(repo, /facility_id = \$5/);
    assert.equal(source.includes("mergePatient"), false);
    assert.equal(source.includes("sha256"), false);
  });
});
