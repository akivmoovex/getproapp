"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

describe("D74 clinical operation contracts", () => {
  it("keeps a signed consultation note from being rewritten", () => {
    const source = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicClinicalService.js"),
      "utf8"
    );
    const body = source.slice(source.indexOf("async function recordConsultationNote"));
    assert.match(body, /CASE WHEN status = 'signed'/);
    assert.match(body, /CANNOT_EDIT_SIGNED/);
    assert.equal(body.includes("created_by_staff_id ="), false);
    assert.equal(source.includes("INSERT INTO activeclinic.consultation_note_amendments"), false);
  });

  it("does not let a dispense replace the prescriber", () => {
    const source = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPharmacyService.js"),
      "utf8"
    );
    const dispense = source.slice(
      source.indexOf("async function dispensePrescription"),
      source.indexOf("async function createPharmacyPrescription")
    );
    assert.match(dispense, /PERM\.PHARMACY_DISPENSE/);
    assert.match(source, /PHARMACY_DISPENSE: "activeclinic\.pharmacy\.dispense"/);
    const update = dispense.slice(dispense.indexOf("UPDATE activeclinic.pharmacy_prescriptions"));
    assert.match(update, /SET status = \$1/);
    assert.equal(update.includes("prescriber_staff_id"), false);
    assert.equal(/allergy/i.test(source), false);
  });
});
