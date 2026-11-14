"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { OTP_POLICY, PRODUCTS } = require("../../../src/platform/otp/otpPolicy");
const { WORKFLOWS, getOtpWorkflow } = require("../../../src/platform/otp/otpWorkflows");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");

const ROOT = path.join(__dirname, "../../..");

describe("D26 OTP contract", () => {
  it("keeps one engine for both products and does not grant clinical permissions", () => {
    assert.deepEqual(PRODUCTS, ["blessboard", "activeclinic"]);
    const ids = Object.keys(WORKFLOWS);
    assert.ok(ids.some((id) => id.startsWith("blessboard.")));
    assert.ok(ids.some((id) => id.startsWith("activeclinic.")));
    assert.equal(getOtpWorkflow("blessboard.member_login").productCode, "blessboard");
    assert.equal(getOtpWorkflow("activeclinic.patient_login").productCode, "activeclinic");
    assert.equal(getOtpWorkflow("activeclinic.patient_portal_activation").independentOfBooking, true);
    assert.equal(getOtpWorkflow("activeclinic.public_booking"), null);
    for (const workflow of Object.values(WORKFLOWS)) {
      assert.equal(workflow.action.startsWith("activeclinic."), false);
      assert.equal(workflow.action.startsWith("blessboard."), false);
    }
  });

  it("does not ship an OTP challenge migration or a production bypass", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "db/migrations/platform/048_otp_challenges.sql")),
      false
    );
    const activation = fs.readFileSync(path.join(ROOT, "src/platform/otp/otpActivation.js"), "utf8");
    assert.match(activation, /migration_not_applied/);
    assert.match(activation, /provider_not_configured/);
    assert.match(activation, /release_not_verified/);
    const production = resolveOtpActivation(
      { NODE_ENV: "production", DEPLOYMENT_ENV: "production" },
      "ACTIVE"
    );
    assert.equal(production.status, "BLOCKED");
    assert.equal(OTP_POLICY.testingCode, "1234");
    assert.equal(OTP_POLICY.maxAttempts, 5);
    assert.equal(OTP_POLICY.ttlSeconds, 300);
  });

  it("leaves CSRF on the product login path and keeps the OTP gate from completing a session while blocked", () => {
    const gate = fs.readFileSync(path.join(ROOT, "src/platform/otp/otpSessionGate.js"), "utf8");
    const patientLogin = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/http/activeClinicPatientPortalRoutes.js"),
      "utf8"
    );
    assert.doesNotMatch(gate, /skipCsrf|csrfBypass/);
    assert.match(patientLogin, /validateCsrf/);
    assert.match(gate, /sessionAllowed: true/);
    assert.match(gate, /otpRequired: false/);
  });
});
