"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");
const { getProtectedAction } = require("../../../src/platform/otp/otpProtectedActions");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("D16 shared platform contracts", () => {
  it("keeps one OTP policy for both products and pins version 2.13", () => {
    assert.equal(OTP_POLICY.codeLength, 6);
    assert.equal(OTP_POLICY.ttlSeconds, 300);
    assert.equal(OTP_POLICY.maxAttempts, 5);
    assert.equal(OTP_POLICY.resendCooldownSeconds, 60);
    assert.equal(getProtectedAction("auth.login").mandatory, true);
    assert.match(read("src/platform/otp/index.js"), /bindProduct/);
    assert.doesNotMatch(read("src/platform/otp/index.js"), /blessBoardOtp|activeClinicOtp/);
    assert.match(read("src/startup/productionStartupChecks.js"), /assertOtpProductionStartup/);
    assert.match(read("src/platform/session/sharedSessionSecurity.js"), /evaluateOtpSessionGate/);
    assert.match(read("src/blessboard/http/hqAdminShellLocals.js"), /delete extra\.csrfToken/);
    assert.match(read("src/blessboard/http/branchAdminShellLocals.js"), /delete extra\.csrfToken/);
    const version = read("tests/v13/contract/v13-previously-passing-sanity-coverage.test.js");
    assert.match(version, /2\.13/);
  });

  it("keeps BlessBoard and ActiveClinic on the same session gate", () => {
    const server = read("src/platform/http/v5FoundationServer.js");
    assert.match(server, /blessboard\.unified_staff_login/);
    const logout = server.slice(server.indexOf('app.post("/logout"'), server.indexOf('app.get("/account"'));
    assert.match(logout, /validateCsrf/);
    assert.doesNotMatch(logout, /otpWorkflow/);
    assert.match(read("src/activeclinic/http/activeClinicAuthRoutes.js"), /activeclinic\.staff_login/);
    assert.match(read("src/platform/otp/otpPhone.js"), /normalizePhoneNumber/);
    assert.match(read("src/platform/otp/otpProviders.js"), /provider_not_selected/);
    assert.doesNotMatch(read("src/platform/otp/otpProviders.js"), /require\(["']twilio|require\(["']nodemailer/);
  });
});
