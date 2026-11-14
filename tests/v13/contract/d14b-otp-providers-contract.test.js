"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { assertOtpProductionStartup } = require("../../../src/platform/otp/otpEnvironment");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D14B OTP provider contracts", () => {
  it("keeps adapters off the network and documents the unpaid provider decision", () => {
    const files = [
      "src/platform/otp/otpProviders.js",
      "src/platform/otp/otpDelivery.js",
      "src/platform/otp/otpPhone.js",
      "src/platform/otp/otpService.js",
    ];
    const blob = files.map(read).join("\n");
    assert.doesNotMatch(blob, /require\(["']nodemailer|require\(["']twilio|require\(["']node-fetch|https\.request|http\.request/);
    assert.doesNotMatch(blob, /router\.(get|post)|app\.(get|post)/);
    assert.match(blob, /provider_not_selected/);
    assert.match(blob, /fake_forbidden/);
    assert.match(read("src/platform/otp/otpPhone.js"), /normalizePhoneNumber/);
    const doc = read("docs/platform/V213_D14B_OTP_PROVIDERS.md");
    assert.match(doc, /Zambia/);
    assert.match(doc, /No commercial email or SMS provider has been approved/);
    assert.match(doc, /no bypass endpoint/);
  });

  it("production startup rejects the fake provider name", () => {
    assert.throws(
      () =>
        assertOtpProductionStartup({
          NODE_ENV: "production",
          DEPLOYMENT_ENV: "production",
          DATABASE_IDENTITY_ENV: "production",
          PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
          DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
          GETPRO_OTP_PROVIDER: "fake",
        }),
      /otp_test_config_forbidden/
    );
  });
});
