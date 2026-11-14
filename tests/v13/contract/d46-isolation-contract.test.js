"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "../../..");

describe("D46 isolation contract", () => {
  it("keeps the receipt name and invoiced charge inside the caller tenant", () => {
    const billing = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicBillingService.js"),
      "utf8"
    );
    assert.match(billing, /WHERE id = \$1 AND organization_id = \$2/);
    assert.match(billing, /AND tenant_id = \$2/);
    assert.match(billing, /AND facility_id = \$3/);
    assert.match(billing, /AND status = 'pending'/);
    assert.equal(/SET status = 'invoiced' WHERE id = \$1`/.test(billing), false);
    const profile = fs.readFileSync(
      path.join(root, "src/activeclinic/services/activeClinicPatientPortalProfileService.js"),
      "utf8"
    );
    assert.match(profile, /WHERE id = \$1 AND organization_id = \$2/);
  });
});
