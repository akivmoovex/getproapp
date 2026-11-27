"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D157 OTP integration contract", () => {
  it("keeps the probe, budget, and boot fail-closed", () => {
    const probe = read("src/platform/otp/otpQaIdentityProbe.js");
    const boot = read("src/platform/otp/otpQaBoot.js");
    const gate = read("src/platform/otp/otpQaLiveDelivery.js");
    const runtime = read("src/platform/http/moovexPlatformRuntimeServer.js");
    assert.match(probe, /current_database\(\)/);
    assert.match(probe, /postmaster\.pid/);
    assert.match(probe, /LISTENER_PATH_EVIDENCE/);
    assert.match(gate, /listener_postmaster_pid/);
    assert.doesNotMatch(probe, /current_setting\('data_directory'\)/);
    assert.doesNotMatch(probe, /current_setting\('unix_socket_directories'\)/);
    assert.doesNotMatch(probe, /getpro_v13_e2e_otpqa135/);
    assert.doesNotMatch(probe, /getpro_v13_e2e_g78d2301/);
    assert.doesNotMatch(probe, /api\.resend\.com/);
    assert.match(boot, /qa_live_delivery_not_approved/);
    assert.match(boot, /inspectDatabaseUrl/);
    assert.doesNotMatch(boot, /fetchImpl/);
    assert.match(gate, /restartSafe: false/);
    assert.match(gate, /bindDurableAttemptBudget/);
    assert.match(runtime, /attachQaOtpBoot\(env\)/);
    assert.match(read("src/platform/otp/otpProviders.js"), /deliveryActivated: false/);
    assert.doesNotMatch(read("package.json"), /d157-otp-integration/);
  });
});
