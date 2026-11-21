"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../../..", relativePath), "utf8");
}

describe("G09–G15 hardening source contract", () => {
  it("keeps journey ownership, duplicate guards, and the unrouted migration service", () => {
    const clinical = read("src/activeclinic/services/activeClinicClinicalService.js");
    const reception = read("src/activeclinic/services/activeClinicReceptionService.js");
    const billing = read("src/activeclinic/services/activeClinicBillingService.js");
    const appointments = read("src/activeclinic/services/activeClinicAppointmentService.js");
    const migration = read("src/activeclinic/services/activeClinicRecordMigrationService.js");
    const http = read("src/activeclinic/http/activeClinicClinicalRoutes.js");

    assert.match(clinical, /DUPLICATE_ACTIVE_ENCOUNTER/);
    assert.match(clinical, /AND organization_id = \$6/);
    assert.match(clinical, /AND status = 'open'/);
    assert.match(clinical, /CANNOT_EDIT_SIGNED/);
    assert.equal(clinical.includes("INSERT INTO activeclinic.consultation_note_amendments"), false);
    assert.match(clinical, /WHERE clinical_order_id = \$1/);
    assert.match(reception, /duplicate_active_queue_entry/);
    assert.match(billing, /duplicate_submission/);
    assert.match(appointments, /STALE_VERSION/);
    assert.match(http, /requireDepartment\("clinical"\)/);
    assert.equal(migration.includes("DELETE FROM"), false);
    assert.equal(http.includes("activeClinicRecordMigrationService"), false);
  });
});
