"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D162 durable budget contract", () => {
  it("reserves with an exclusive slot file and does not create the live ledger from boot", () => {
    const budget = read("src/platform/otp/otpQaAttemptBudget.js");
    const boot = read("src/platform/otp/otpQaBoot.js");
    const runtime = read("src/platform/http/moovexPlatformRuntimeServer.js");
    const gate = read("src/platform/otp/otpQaLiveDelivery.js");
    const transport = read("src/platform/email/resendOtpTransport.js");
    assert.match(budget, /openSync\([\s\S]*"wx"/);
    assert.match(budget, /live_budget_forbidden/);
    assert.match(budget, /fsyncSync/);
    assert.doesNotMatch(budget, /api\.resend\.com/);
    assert.doesNotMatch(budget, /1234/);
    assert.doesNotMatch(boot, /provisionIsolatedQaAttemptBudget/);
    assert.doesNotMatch(runtime, /\.v13-qa-otp-budget/);
    assert.match(gate, /restartSafe: false/);
    assert.match(gate, /isLiveAttemptBudget/);
    assert.match(gate, /exclusive-slot-file/);
    assert.match(gate, /snap\.reason/);
    assert.match(transport, /reserved\.confirmed === false/);
    assert.match(transport, /provider_budget_exhausted/);
    assert.doesNotMatch(read("package.json"), /d162-durable-budget/);
  });
});
