"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");

describe("D73 encounter and queue contracts", () => {
  it("keeps encounter creation inside the caller facility and the stored states", () => {
    const clinical = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicClinicalService.js"),
      "utf8"
    );
    const scope = fs.readFileSync(
      path.join(root, "src/activeclinic/services/clinicalScope.js"),
      "utf8"
    );
    const start = clinical.slice(clinical.indexOf("async function startEncounter"));
    assert.match(start, /FROM activeclinic\.facilities[\s\S]*organization_id = \$2/);
    assert.match(start, /FROM activeclinic\.patients[\s\S]*healthcare_organization_id = \$3/);
    const triage = clinical.slice(clinical.indexOf("async function recordTriageAssessment"));
    assert.match(triage, /AND facility_id = \$12/);
    assert.match(scope, /"open", "completed", "cancelled"/);
    assert.equal(scope.includes('"inpatient"'), false);
    assert.equal(/systolic\s*[<>]/.test(clinical), false);
  });

  it("keeps a queue status write inside the loaded facility", () => {
    const reception = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicReceptionService.js"),
      "utf8"
    );
    const body = reception.slice(reception.indexOf("async function appendQueueStatusEvent"));
    assert.match(body, /facilityId: detail\.queueEntry\.facilityId/);
    assert.match(body, /actorStaffId: input\.actor\.staffMemberId/);
    assert.equal(body.includes('"admitted"'), false);
  });
});
