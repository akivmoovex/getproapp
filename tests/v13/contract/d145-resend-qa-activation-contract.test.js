"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D145 Resend QA activation contracts", () => {
  it("keeps the QA gate free of credentials, database clients, and live delivery defaults", () => {
    const gate = read("src/platform/otp/otpQaLiveDelivery.js");
    const providers = read("src/platform/otp/otpProviders.js");
    const service = read("src/platform/otp/otpService.js");
    assert.match(gate, /authorized: reasons\.length === 0/);
    assert.match(gate, /database_identity_unverified/);
    assert.match(gate, /getpro_v13_e2e_g78d2301/);
    assert.doesNotMatch(gate, /getpro_v13_e2e_otpqa135/);
    assert.match(gate, /55432/);
    assert.doesNotMatch(gate, /deliveryActivated:\s*true/);
    assert.doesNotMatch(gate, /require\(["']pg["']\)/);
    assert.doesNotMatch(gate, /new Pool\(/);
    assert.doesNotMatch(gate, /api\.resend\.com/);
    assert.doesNotMatch(gate, /\bre_[A-Za-z0-9]{8,}/);
    assert.match(providers, /deliveryActivated: false/);
    assert.doesNotMatch(providers, /deliveryActivated:\s*true/);
    assert.match(service, /otp_delivery_activation_forbidden/);
    assert.match(service, /sessionComplete: false/);
  });
});
