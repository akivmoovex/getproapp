"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("D58 payment duplicate guard", () => {
  it("rolls back when the same tenant already stored the idempotency key", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../../../src/activeclinic/services/activeClinicBillingService.js"),
      "utf8"
    );
    const start = source.indexOf("if (idempotencyKey)");
    const end = source.indexOf("const paymentNumber = await generatePaymentNumber");
    const slice = source.slice(start, end);
    assert.ok(start > 0 && end > start);
    assert.match(slice, /p\.idempotency_key = \$1/);
    assert.match(slice, /p\.tenant_id = \$2/);
    assert.match(slice, /if \(dupCheck\.rows\.length > 0\)/);
    assert.match(slice, /ROLLBACK/);
    assert.match(slice, /DUPLICATE_SUBMISSION/);
    assert.equal(slice.includes("INSERT INTO activeclinic.payments"), false);
  });
});
