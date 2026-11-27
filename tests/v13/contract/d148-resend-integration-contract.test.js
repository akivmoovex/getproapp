"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D148 Resend integration contracts", () => {
  it("requires a fresh probe, a durable budget, and authorization before fetch", () => {
    const gate = read("src/platform/otp/otpQaLiveDelivery.js");
    const transport = read("src/platform/email/resendOtpTransport.js");
    const session = read("src/platform/otp/otpSessionGate.js");
    const service = read("src/platform/otp/otpService.js");
    assert.match(gate, /postgresql_observation/);
    assert.match(gate, /database_identity_stale/);
    assert.match(gate, /database_identity_malformed/);
    assert.match(gate, /QA_HTTP_ATTEMPT_LIMIT = 3/);
    assert.match(gate, /unauthorized_purpose/);
    assert.match(gate, /provider_budget_not_durable/);
    assert.match(gate, /restartSafe: false/);
    assert.doesNotMatch(gate, /options\.databaseIdentity(?!Probe)/);
    assert.doesNotMatch(gate, /deps\.databaseIdentity(?!Probe)/);
    assert.doesNotMatch(gate, /require\(["']pg["']\)/);
    assert.doesNotMatch(gate, /new Pool\(/);
    assert.doesNotMatch(gate, /api\.resend\.com/);
    assert.doesNotMatch(transport, /input\.fetchImpl/);
    assert.match(transport, /decision\.authorized !== true/);
    assert.match(transport, /tryReserve\(\)/);
    assert.match(transport, /provider_budget_exhausted/);
    assert.match(session, /attachOtpQaDeliveryDependencies/);
    assert.match(session, /otp_qa_dependencies_forbidden/);
    assert.match(service, /purpose: action\.purpose/);
    assert.match(service, /otp_delivery_activation_forbidden/);
    assert.doesNotMatch(service, /deliveryActivated:\s*true/);
  });
});
