"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("G272 email OTP contracts", () => {
  it("does not promote migration 048 and keeps deliveryActivated false in providers", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "db/migrations/platform/048_otp_challenges.sql")),
      false
    );
    const providers = read("src/platform/otp/otpProviders.js");
    assert.match(providers, /deliveryActivated: false/);
    assert.doesNotMatch(providers, /deliveryActivated:\s*true/);
    const service = read("src/platform/otp/otpService.js");
    assert.match(service, /otp_delivery_activation_forbidden/);
  });

  it("wires AC and BB password recovery through the OTP recovery bridge", () => {
    const ac = read("src/activeclinic/http/activeClinicLifecycleRoutes.js");
    const bb = read("src/blessboard/http/passwordResetRoutes.js");
    const patient = read("src/activeclinic/http/activeClinicPatientPortalRoutes.js");
    assert.match(ac, /holdPasswordRecoveryIfOtpRequired/);
    assert.match(bb, /holdPasswordRecoveryIfOtpRequired/);
    assert.match(patient, /holdPasswordRecoveryIfOtpRequired/);
    assert.match(ac, /activeclinic\.forgot_password/);
    assert.match(bb, /blessboard\.forgot_password/);
  });

  it("exposes readiness diagnostics without writing secrets into the module", () => {
    const diagnostics = read("src/platform/otp/otpReadinessDiagnostics.js");
    assert.match(diagnostics, /diagnoseOtpReadiness/);
    assert.match(diagnostics, /emailOtpQaGoNoGo/);
    assert.doesNotMatch(diagnostics, /\bre_[A-Za-z0-9]{10,}/);
    assert.doesNotMatch(diagnostics, /RESEND_API_KEY\s*=\s*["'][^"']+/);
  });
});
