"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { isFixedOtpPermitted } = require("../../../src/platform/otp/otpEnvironment");
const { createOtpService } = require("../../../src/platform/otp/otpService");

describe("D90 OTP stays out of production", () => {
  it("refuses the fixed testing code when the process is production", () => {
    assert.equal(
      isFixedOtpPermitted({
        NODE_ENV: "production",
        GETPRO_OTP_ALLOW_FIXED_CODE: "1",
        DEPLOYMENT_ENV: "testing",
        DATABASE_IDENTITY_ENV: "testing",
      }),
      false
    );
  });

  it("refuses a provider that has delivery activated", () => {
    assert.throws(
      () => createOtpService({ provider: { deliveryActivated: true }, store: { appendAudit() {} } }),
      /otp_delivery_activation_forbidden/
    );
  });
});
