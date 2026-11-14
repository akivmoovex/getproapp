"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D27 clinical foundation contract", () => {
  it("stores encounters as open, completed, or cancelled", () => {
    const migration = read("db/migrations/activeclinic/015_clinical_encounters.sql");
    assert.match(migration, /CHECK \(status IN \('open', 'completed', 'cancelled'\)\)/);
    assert.doesNotMatch(migration, /REGISTERED|IN_TRIAGE|READY_FOR_CLOSEOUT/);
    assert.match(migration, /CHECK \(status IN \('draft', 'signed'\)\)/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS activeclinic.consultation_note_amendments/);
  });

  it("refuses an in-place edit of a signed consultation note", () => {
    const service = read("src/activeclinic/services/activeClinicClinicalService.js");
    assert.match(service, /CANNOT_EDIT_SIGNED: "cannot_edit_signed"/);
    assert.equal(service.includes("INSERT INTO activeclinic.consultation_note_amendments"), false);
  });

  it("rejects a second active queue entry for the same visit", () => {
    const reception = read("src/activeclinic/services/activeClinicReceptionService.js");
    assert.match(reception, /DUPLICATE_ACTIVE_ENTRY: "duplicate_active_queue_entry"/);
  });

  it("leaves patient merge assigned to nobody", () => {
    const catalogue = read("db/migrations/blessboard/088_activeclinic_rbac_role_catalogue.sql");
    assert.match(catalogue, /Does NOT assign activeclinic.patient.merge/);
    assert.match(catalogue, /p.permission_key = 'activeclinic.patient.merge'/);
  });

  it("limits payment reversal to the finance supervisor catalogue", () => {
    const catalogue = read("db/migrations/blessboard/088_activeclinic_rbac_role_catalogue.sql");
    const cashier = catalogue.slice(
      catalogue.indexOf("'activeclinic_cashier'"),
      catalogue.indexOf("'activeclinic_finance_supervisor'")
    );
    const finance = catalogue.slice(catalogue.indexOf("'activeclinic_finance_supervisor'"));
    assert.equal(cashier.includes("activeclinic.payment.reverse"), false);
    assert.equal(finance.includes("activeclinic.payment.reverse"), true);
  });

  it("does not implement scan quarantine or a retention hold", () => {
    const documents = read("src/activeclinic/services/activeClinicClinicalDocumentService.js");
    assert.equal(/quarantine|legal_hold|retention_expiry/.test(documents), false);
    const diagnostics = read("src/activeclinic/services/activeClinicDiagnosticsService.js");
    assert.match(diagnostics, /function acknowledgeCriticalResult/);
    assert.match(diagnostics, /alert_type = 'critical_result'/);
    assert.doesNotMatch(diagnostics, /escalat/);
  });
});
