"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

describe("D50 operations contract", () => {
  it("keeps stock, invoice numbers, and posting inside the caller organization", () => {
    const pharmacy = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPharmacyService.js"),
      "utf8"
    );
    const billing = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicBillingService.js"),
      "utf8"
    );
    assert.match(pharmacy, /WHERE id = \$1 AND organization_id = \$2 FOR UPDATE/);
    assert.equal(pharmacy.includes("function approveSubstitution"), false);
    assert.equal(/allergy/i.test(pharmacy), false);
    assert.match(billing, /WHERE id = \$1 AND organization_id = \$2/);
    const posted = billing.indexOf('eventType: "activeclinic.billing.invoice_posted"');
    const guard = billing.lastIndexOf("if (!updateResult.rowCount)", posted);
    assert.ok(guard > 0 && guard < posted);
    assert.equal(billing.includes("outbox"), false);
  });
});
