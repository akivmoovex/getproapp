"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const { getProtectedAction } = require("../../../src/platform/otp/otpProtectedActions");
const { SENDERS } = require("../../../src/platform/email/resendSenderCatalog");

const root = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

describe("G141 OTP and Resend contracts", () => {
  it("keeps BlessBoard recovery on the shared Resend adapter and the shared OTP purpose", () => {
    const delivery = read("src/blessboard/services/passwordResetEmailDelivery.js");
    assert.match(delivery, /createResendAdapter/);
    assert.match(delivery, /approvedSenderOptions/);
    assert.equal(getProtectedAction("auth.password_recovery").purpose, "password_recovery");
    assert.equal(SENDERS.blessboard.email, "security@notify.blessboard.com");
  });

  it("keeps ActiveClinic patient and staff recovery off a second OTP engine", () => {
    const patient = read("src/activeclinic/http/activeClinicPatientPortalRoutes.js");
    const staff = read("src/activeclinic/http/activeClinicLifecycleRoutes.js");
    assert.match(patient, /patient\/forgot-password/);
    assert.match(patient, /Email\/SMS delivery is currently unavailable/);
    assert.match(staff, /activeclinic\.forgot_password/);
    assert.match(read("src/activeclinic/services/activeClinicEmailDelivery.js"), /approvedSenderOptions/);
    assert.equal(SENDERS.activeclinic.email, "security@notify.activeclinic.org");
    assert.doesNotMatch(read("src/platform/otp/index.js"), /blessBoardOtp|activeClinicOtp/);
  });

  it("routes a product sender only after that domain is verified and keeps production OTP blocked", () => {
    const providers = read("src/platform/otp/otpProviders.js");
    assert.match(providers, /createResendOtpEmailTransport/);
    assert.match(providers, /name !== "resend"/);
    assert.equal(resolveOtpActivation({
      NODE_ENV: "production",
      DEPLOYMENT_ENV: "production",
      GETPRO_OTP_PROVIDER: "resend",
      RESEND_API_KEY: "present",
    }).status, "BLOCKED");
    assert.match(read("src/platform/otp/otpChallengeStore.js"), /Persistence is specified/);
    assert.doesNotMatch(read("src/platform/email/resendEmailAdapter.js"), /require\(["']resend["']\)/);
    assert.equal(SENDERS.pronline.domain, "notify.pronline.org");
  });
});
