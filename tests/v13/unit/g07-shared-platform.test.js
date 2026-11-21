"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeAuditMetadata } = require(
  "../../../src/platform/services/auditEventService"
);

describe("G07 shared platform", () => {
  it("drops secrets from audit metadata", () => {
    const cleaned = sanitizeAuditMetadata({
      organization_id: "org",
      password: "not-stored",
      password_hash: "not-stored",
      otp: "000000",
    });
    assert.equal(cleaned.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned.metadata, "password"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned.metadata, "password_hash"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(cleaned.metadata, "otp"), false);
  });
});
