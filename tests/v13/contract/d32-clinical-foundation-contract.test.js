"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D32 clinical foundation contract", () => {
  it("TEN-01-02 scopes facility reads by organization", () => {
    const repo = read("src/activeclinic/repositories/facilityRepository.js");
    assert.match(repo, /WHERE id = \$1 AND organization_id = \$2/);
    assert.match(repo, /WHERE organization_id = \$1 AND facility_key = \$2/);
  });

  it("ID-02-01 and ID-02-02 leave merge unassigned and unimplemented", () => {
    const catalogue = read("db/migrations/blessboard/088_activeclinic_rbac_role_catalogue.sql");
    const duplicates = read("src/activeclinic/services/activeClinicPatientDuplicateService.js");
    assert.match(catalogue, /p.permission_key = 'activeclinic.patient.merge'/);
    assert.match(duplicates, /no automatic merge/);
    assert.equal(duplicates.includes("function mergePatient"), false);
    assert.equal(duplicates.includes("function unmerge"), false);
  });

  it("VIS-01-01 and CLN-01-02 keep stored encounter states and signed notes", () => {
    const migration = read("db/migrations/activeclinic/015_clinical_encounters.sql");
    const service = read("src/activeclinic/services/activeClinicClinicalService.js");
    assert.match(migration, /CHECK \(status IN \('open', 'completed', 'cancelled'\)\)/);
    assert.doesNotMatch(migration, /REGISTERED|IN_TRIAGE|READY_FOR_CLOSEOUT/);
    assert.match(service, /CANNOT_EDIT_SIGNED: "cannot_edit_signed"/);
    assert.equal(service.includes("INSERT INTO activeclinic.consultation_note_amendments"), false);
  });

  it("NUR-01-02 stores pain from 0 to 10 and does not encode a diagnostic range", () => {
    const migration = read("db/migrations/activeclinic/015_clinical_encounters.sql");
    const service = read("src/activeclinic/services/activeClinicClinicalService.js");
    assert.match(migration, /pain_level >= 0 AND pain_level <= 10/);
    assert.equal(/systolic\s*[<>]/.test(service), false);
    assert.equal(service.includes("diagnostic_range"), false);
  });

  it("SEC-01-01 encounter audit metadata has no purpose field", () => {
    const service = read("src/activeclinic/services/activeClinicClinicalService.js");
    const start = service.indexOf('actionKey: "activeclinic.encounter.started"');
    const slice = service.slice(start, start + 400);
    assert.match(slice, /facility_id/);
    assert.doesNotMatch(slice, /purpose/);
  });
});
