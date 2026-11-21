"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, "../../..", relativePath), "utf8");
}

describe("G04 pharmacy and billing source contract", () => {
  it("keeps catalogue handoff, minor units, and financial rows append-only", () => {
    const clinical = read("src/activeclinic/services/activeClinicClinicalService.js");
    const pharmacy = read("src/activeclinic/services/activeClinicPharmacyService.js");
    const billing = read("src/activeclinic/services/activeClinicBillingService.js");
    const routes = read("src/activeclinic/http/activeClinicBillingRoutes.js");

    assert.match(clinical, /medication_catalogue_items/);
    assert.match(clinical, /AND organization_id = \$2/);
    assert.match(clinical, /dosage_instructions/);
    assert.match(pharmacy, /activeclinic\.pharmacy\.dispense/);
    assert.match(pharmacy, /organization_id = \$2 FOR UPDATE/);
    assert.doesNotMatch(pharmacy, /DELETE FROM activeclinic\.dispense_events/);
    assert.match(billing, /amount_minor/);
    assert.match(billing, /integer minor units/);
    assert.doesNotMatch(billing, /DELETE FROM activeclinic\.payments/);
    assert.doesNotMatch(billing, /DELETE FROM activeclinic\.receipts/);
    assert.doesNotMatch(billing, /stripe|paypal|flutterwave/i);
    assert.match(routes, /activeclinic\.billing\.invoice\.create/);
    assert.match(routes, /activeclinic\.billing\.invoice\.void/);
  });
});
