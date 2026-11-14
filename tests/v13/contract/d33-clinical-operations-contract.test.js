"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D33 clinical operations contract", () => {
  it("ORD-01-01 stores orders as draft, submitted, or cancelled", () => {
    const migration = read("db/migrations/activeclinic/015_clinical_encounters.sql");
    assert.match(migration, /CHECK \(status IN \('draft', 'submitted', 'cancelled'\)\)/);
    assert.doesNotMatch(migration, /ACKNOWLEDGED|IN_PROGRESS|RESULTED|REVIEWED/);
  });

  it("LAB-01-03 acknowledges an active alert for the linked patient and does not escalate", () => {
    const source = read("src/activeclinic/services/activeClinicDiagnosticsService.js");
    const start = source.indexOf("async function acknowledgeCriticalResult");
    const slice = source.slice(start, source.indexOf("module.exports", start));
    assert.match(slice, /laboratory_results/);
    assert.match(slice, /patient_id = \$3/);
    assert.match(slice, /ORDER BY created_at DESC/);
    assert.match(slice, /LIMIT 1/);
    assert.doesNotMatch(slice, /result_id/);
    assert.doesNotMatch(slice, /escalat/);
  });

  it("RX-01-02 and RX-01-03 keep dispense permission and do not define a substitution rule", () => {
    const pharmacy = read("src/activeclinic/services/activeClinicPharmacyService.js");
    const catalogue = read("db/migrations/blessboard/088_activeclinic_rbac_role_catalogue.sql");
    assert.match(pharmacy, /PHARMACY_DISPENSE: "activeclinic.pharmacy.dispense"/);
    assert.equal(pharmacy.includes("function approveSubstitution"), false);
    assert.equal(/allerg(y|ies).{0,40}(block|threshold)/i.test(pharmacy), false);
    const cashier = catalogue.slice(
      catalogue.indexOf("'activeclinic_cashier'"),
      catalogue.indexOf("'activeclinic_finance_supervisor'")
    );
    assert.equal(cashier.includes("activeclinic.pharmacy.dispense"), false);
  });

  it("FIN-01-03 rolls back a repeated idempotency key before insert", () => {
    const billing = read("src/activeclinic/services/activeClinicBillingService.js");
    const lookup = billing.indexOf("WHERE p.idempotency_key = $1");
    const insert = billing.indexOf("INSERT INTO activeclinic.payments");
    assert.ok(lookup > 0 && insert > lookup);
    const between = billing.slice(lookup, insert);
    assert.match(between, /ROLLBACK/);
    assert.match(between, /DUPLICATE_SUBMISSION/);
    assert.equal(billing.includes("outbox"), false);
  });
});
