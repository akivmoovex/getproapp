"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("D49 clinical contract", () => {
  it("keeps encounter close, alerts, and types inside the stored organization contract", () => {
    const clinical = fs.readFileSync(
      path.join(__dirname, "../../../src/activeclinic/services/activeClinicClinicalService.js"),
      "utf8"
    );
    assert.match(clinical, /AND organization_id = \$6/);
    assert.match(clinical, /AND a\.organization_id = \$2/);
    assert.match(clinical, /p\.organization_id = a\.organization_id/);
    assert.match(clinical, /organization_id = \$3 AND status = 'open'/);
    assert.match(clinical, /status = 'draft'/);
    assert.equal(clinical.includes("INSERT INTO activeclinic.consultation_note_amendments"), false);
    assert.equal(clinical.includes("diagnostic_range"), false);
  });
});
