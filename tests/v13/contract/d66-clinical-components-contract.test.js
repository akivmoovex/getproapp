"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");
const pharmacy = fs.readFileSync(
  path.join(root, "src/activeclinic/services/activeClinicPharmacyService.js"),
  "utf8"
);
const diagnostics = fs.readFileSync(
  path.join(root, "src/activeclinic/services/activeClinicDiagnosticsService.js"),
  "utf8"
);

describe("D66 clinical scope contract", () => {
  it("keeps dispense quantity writes inside the prescription organization", () => {
    const start = pharmacy.indexOf("async function dispensePrescription");
    const body = pharmacy.slice(start, pharmacy.indexOf("async function", start + 20));
    assert.match(body, /pharmacy_prescription_items[\s\S]*organization_id = \$3/);
    assert.match(body, /inventory_batches[\s\S]*organization_id = \$3/);
    assert.match(
      body,
      /UPDATE activeclinic\.pharmacy_prescriptions[\s\S]*organization_id = \$3/
    );
    assert.equal(pharmacy.includes("function approveSubstitution"), false);
    assert.equal(/allergy/i.test(pharmacy), false);
  });

  it("does not add a result id or an escalation timer to acknowledgement", () => {
    const start = diagnostics.indexOf("async function acknowledgeCriticalResult");
    const slice = diagnostics.slice(start, diagnostics.indexOf("module.exports", start));
    assert.doesNotMatch(slice, /result_id/);
    assert.doesNotMatch(slice, /escalat/);
    assert.equal(diagnostics.includes("outbox"), false);
  });
});
