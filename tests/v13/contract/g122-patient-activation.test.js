"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

describe("G122 patient activation contract", () => {
  it("links an existing clinic patient and does not insert a public patient", () => {
    const source = read("src/activeclinic/services/activeClinicPatientPortalRegistrationService.js");
    const match = source.slice(source.indexOf("async function registerPatientWithPhoneMatch"));
    assert.match(match, /phone_normalized = \$1/);
    assert.match(match, /healthcare_organization_id = \$3/);
    assert.match(match, /AMBIGUOUS_MATCH/);
    assert.match(match, /platform_identity_id IS NULL/);
    assert.match(match, /FOR UPDATE/);
    assert.doesNotMatch(match, /INSERT INTO activeclinic\.patients/);
  });

  it("tells an unknown public identity to use clinic registration", () => {
    const routes = read("src/activeclinic/http/activeClinicPatientPortalRoutes.js");
    assert.match(routes, /does not create a new patient record/);
    assert.match(routes, /Patients are registered by clinic staff/);
  });

  it("appends a vitals correction without updating the original row", () => {
    const clinical = read("src/activeclinic/services/activeClinicClinicalService.js");
    const fn = clinical.slice(clinical.indexOf("async function correctVitalSignObservation"));
    assert.match(fn, /STALE_VERSION/);
    assert.match(fn, /corrects_observation_id/);
    assert.doesNotMatch(fn, /UPDATE activeclinic\.vital_sign_observations/);
    const view = read("views/activeclinic/app/vital-signs-entry-content.ejs");
    assert.match(view, /data-ac-vital-correct="1"/);
    assert.match(view, /correction_reason/);
  });
});
