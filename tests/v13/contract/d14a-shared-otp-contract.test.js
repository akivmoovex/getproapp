"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { OTP_POLICY, PROTECTED_ACTIONS } = require("../../../src/platform/otp");
const { runProductionStartupChecks } = require("../../../src/startup/productionStartupChecks");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D14A OTP contracts", () => {
  it("keeps one shared policy and does not activate delivery or a second product engine", () => {
    assert.equal(OTP_POLICY.codeLength, 6);
    assert.equal(OTP_POLICY.ttlSeconds, 300);
    assert.equal(OTP_POLICY.maxAttempts, 5);
    assert.equal(OTP_POLICY.resendCooldownSeconds, 60);
    assert.equal(OTP_POLICY.testingCode, "1234");
    for (const action of [
      "auth.login",
      "auth.password_recovery",
      "auth.account_activation",
      "admin.role_change",
      "admin.member_export",
      "admin.security_setting",
    ]) {
      assert.equal(PROTECTED_ACTIONS[action].mandatory, true);
    }

    const index = read("src/platform/otp/index.js");
    const service = read("src/platform/otp/otpService.js");
    const provider = read("src/platform/otp/otpProviders.js");
    assert.match(index, /bindProduct/);
    assert.doesNotMatch(index, /blessBoardOtp|activeClinicOtp/);
    assert.doesNotMatch(service, /provider\.deliver\(|nodemailer|twilio|infobip/);
    assert.match(provider, /deliveryActivated: false/);
    assert.match(provider, /delivery_not_activated/);

    const startup = read("src/startup/productionStartupChecks.js");
    assert.match(startup, /assertOtpProductionStartup/);

    const design = read("docs/platform/V213_D14A_OTP_FOUNDATION.md");
    assert.match(design, /NOT APPLIED/);
    assert.match(design, /code_hash/);
    assert.equal(fs.existsSync(path.join(ROOT, "db/migrations/platform/048_otp_challenges.sql")), false);
  });

  it("production startup rejects a fixed OTP flag and leaves delivery unconfigured", () => {
    const previous = process.env.NODE_ENV;
    const previousFlag = process.env.GETPRO_OTP_ALLOW_FIXED_CODE;
    process.env.NODE_ENV = "production";
    process.env.GETPRO_OTP_ALLOW_FIXED_CODE = "1";
    try {
      assert.throws(() => runProductionStartupChecks(), /otp_test_config_forbidden/);
    } finally {
      if (previous == null) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previous;
      if (previousFlag == null) delete process.env.GETPRO_OTP_ALLOW_FIXED_CODE;
      else process.env.GETPRO_OTP_ALLOW_FIXED_CODE = previousFlag;
    }
  });
});
