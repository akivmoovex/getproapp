"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../../..", relativePath), "utf8");
}

describe("G02 patient journey source contract", () => {
  it("keeps duplicate review, queue states, triage entry, and signed-note protection", () => {
    const patients = read("src/activeclinic/services/activeClinicPatientService.js");
    const reception = read("src/activeclinic/services/activeClinicReceptionService.js");
    const clinical = read("src/activeclinic/services/activeClinicClinicalService.js");
    const routes = read("src/activeclinic/http/activeClinicClinicalRoutes.js");

    assert.match(patients, /DUPLICATE_WARNING/);
    assert.match(patients, /duplicateOverride/);
    assert.match(patients, /merge_deferred/);
    assert.match(patients, /nextOfKin/);

    assert.match(reception, /waiting/);
    assert.match(reception, /called/);
    assert.match(reception, /serving/);
    assert.match(reception, /completed/);
    assert.match(reception, /activeclinic\.reception\.check_in|PERM\.CHECK_IN/);

    assert.match(clinical, /CANNOT_EDIT_SIGNED/);
    assert.match(clinical, /corrects_observation_id/);
    assert.match(clinical, /activeclinic\.triage\.record/);
    assert.match(clinical, /recordAuditEventSafe/);
    assert.equal(clinical.includes("INSERT INTO activeclinic.consultation_note_amendments"), false);

    assert.match(routes, /Start triage/);
    assert.match(routes, /requirePermission\(\[PERM\.MANAGE, PERM\.TRIAGE\]\)/);
  });
});
