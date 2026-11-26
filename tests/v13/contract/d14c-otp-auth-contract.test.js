"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("D14C OTP auth contracts", () => {
  it("wires the shared gate without enabling production or a second engine", () => {
    const cookie = read("src/platform/session/sharedSessionSecurity.js");
    assert.match(cookie, /otpWorkflow/);
    assert.match(cookie, /evaluateOtpSessionGate/);
    assert.match(cookie, /regenerates browser session identity/i);

    const login = read("src/platform/http/v5FoundationServer.js");
    assert.match(login, /blessboard\.unified_staff_login/);
    const member = read("src/blessboard/http/memberPortalAuthRoutes.js");
    assert.match(member, /blessboard\.member_login/);
    const clinic = read("src/activeclinic/http/activeClinicAuthRoutes.js");
    assert.match(clinic, /activeclinic\.staff_login/);
    const patient = read("src/activeclinic/http/activeClinicPatientPortalRoutes.js");
    assert.match(patient, /activeclinic\.patient_login/);
    assert.match(patient, /activeclinic\.patient_forgot_password/);

    const reset = read("src/blessboard/http/passwordResetRoutes.js");
    const csrfAt = reset.indexOf("validateCsrf");
    const holdAt = Math.max(
      reset.indexOf("holdIfOtpRequired"),
      reset.indexOf("holdPasswordRecoveryIfOtpRequired")
    );
    assert.ok(csrfAt > 0 && holdAt > csrfAt);

    const booking = read("src/activeclinic/http/activeClinicPublicRoutes.js");
    assert.doesNotMatch(booking, /patient_portal_activation/);
    assert.match(read("src/platform/otp/otpWorkflows.js"), /independentOfBooking: true/);
    assert.doesNotMatch(read("src/platform/otp/otpSessionGate.js"), /nodemailer|twilio/);
    assert.match(read("src/platform/otp/otpActivation.js"), /BLOCKED/);
  });
});
