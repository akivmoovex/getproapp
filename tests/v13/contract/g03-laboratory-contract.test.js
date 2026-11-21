"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../../..", relativePath), "utf8");
}

describe("G03 laboratory source contract", () => {
  it("links orders to the encounter, keeps tenant filters, and does not call an external laboratory", () => {
    const clinical = read("src/activeclinic/services/activeClinicClinicalService.js");
    const diagnostics = read("src/activeclinic/services/activeClinicDiagnosticsService.js");
    const routes = read("src/activeclinic/http/activeClinicDiagnosticsRoutes.js");
    const form = read("views/activeclinic/app/create-laboratory-request-content.ejs");

    assert.match(clinical, /clinical_order_id, encounter_id, patient_id/);
    assert.match(clinical, /urgency, requested_by_staff_id/);
    assert.match(diagnostics, /AND organization_id = \$2/);
    assert.match(diagnostics, /acknowledged_by_staff_id/);
    assert.doesNotMatch(diagnostics, /value_numeric\s*[<>]/);
    assert.doesNotMatch(diagnostics, /https?:\/\//);
    assert.match(routes, /requirePermission\(PERM\.LAB_RESULT\)/);
    assert.match(routes, /requirePermission\(LAB_VIEW_ANY\)/);
    assert.match(form, /name="urgency"/);
    assert.match(form, /value="stat"/);
    assert.match(form, /name="reason"/);
  });
});
