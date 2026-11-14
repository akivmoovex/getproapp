"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("D41 operations contract", () => {
  it("keeps payment retries inside the tenant and stock locks inside the organization", () => {
    const billing = read("src/activeclinic/services/activeClinicBillingService.js");
    const lookup = billing.indexOf("WHERE p.idempotency_key = $1");
    const insert = billing.indexOf("INSERT INTO activeclinic.payments");
    const between = billing.slice(lookup, insert);
    assert.match(between, /tenant_id = \$2/);
    assert.match(between, /ROLLBACK/);
    assert.equal(billing.includes("outbox"), false);
    const pharmacy = read("src/activeclinic/services/activeClinicPharmacyService.js");
    assert.match(pharmacy, /inventory_items[\s\S]{0,80}organization_id = \$2/);
    assert.equal(pharmacy.includes("function approveSubstitution"), false);
    assert.equal(fs.existsSync(path.join(root, "db/migrations/platform/048_otp_challenges.sql")), false);
  });
});
