"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("D88 clinical operation contracts", () => {
  it("keeps a signed note ahead of a draft and does not add an amendment", () => {
    const clinical = read("src/activeclinic/services/activeClinicClinicalService.js");
    const start = clinical.indexOf("async function recordConsultationNote");
    const note = clinical.slice(start, clinical.indexOf("async function", start + 20));
    assert.match(note, /CASE WHEN status = 'signed' THEN 0 ELSE 1 END/);
    assert.match(note, /RESULT\.CANNOT_EDIT_SIGNED/);
    assert.match(note, /status === "signed"/);
    assert.equal(note.includes("amendment"), false);
  });

  it("keeps results, acknowledgement, and dispensing inside the current contract", () => {
    const diagnostics = read("src/activeclinic/services/activeClinicDiagnosticsService.js");
    const pharmacy = read("src/activeclinic/services/activeClinicPharmacyService.js");
    const start = diagnostics.indexOf("async function acknowledgeCriticalResult");
    const ack = diagnostics.slice(start, diagnostics.indexOf("async function", start + 20));
    assert.match(ack, /patient_id/);
    assert.equal(/result_id/.test(ack), false);
    assert.equal(/escalat/i.test(ack), false);
    assert.match(diagnostics, /PATIENT_NOT_FOUND/);
    assert.equal(/allergy/i.test(pharmacy), false);
    const update = pharmacy.slice(pharmacy.indexOf("UPDATE activeclinic.pharmacy_prescriptions"));
    assert.match(update, /SET status = \$1/);
    assert.equal(update.slice(0, 180).includes("prescriber_staff_id"), false);
  });
});
