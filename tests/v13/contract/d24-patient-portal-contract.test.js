"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const {
  ACTIVECLINIC_DUPLICATE_POLICY,
} = require("../../../src/platform/person/duplicate/duplicatePolicies");
const { PERSON_MATCH_CODE } = require("../../../src/platform/person/duplicate");

const routes = fs.readFileSync(
  path.join(__dirname, "../../../src/activeclinic/http/activeClinicPatientPortalRoutes.js"),
  "utf8"
);
const registerStart = routes.indexOf('app.post(\n    "/clinics/:clinicKey/patient/register"');
const registerEnd = routes.indexOf('app.get("/clinics/:clinicKey/patient/forgot-password"');
const registerHandler = routes.slice(registerStart, registerEnd);
const loginStart = routes.indexOf('app.post(\n    "/clinics/:clinicKey/patient/login"');
const loginEnd = routes.indexOf('app.post("/clinics/:clinicKey/patient/logout"');
const loginHandler = routes.slice(loginStart, loginEnd);

describe("D24 patient portal contract", () => {
  it("keeps staff-created patients independent of portal activation and public booking", () => {
    const domain = fs.readFileSync(
      path.join(__dirname, "../../../src/activeclinic/services/patientDomainConstants.js"),
      "utf8"
    );
    const booking = fs.readFileSync(
      path.join(__dirname, "../../../src/activeclinic/services/activeClinicPublicBookingService.js"),
      "utf8"
    );
    assert.match(domain, /portal activation is not required/);
    assert.match(booking, /patientId: null/);
    assert.match(registerHandler, /registerPatientWithPhoneMatch/);
    assert.match(registerHandler, /\/patient\/login/);
    assert.doesNotMatch(registerHandler, /issueAuthenticatedSessionCookie/);
  });

  it("uses one login failure message and separate registration outcomes", () => {
    assert.match(loginHandler, /Invalid credentials or access unavailable/);
    assert.match(registerHandler, /An account with this phone number already exists/);
    assert.match(registerHandler, /No matching patient record found/);
    assert.match(registerHandler, /Multiple patient records found/);
  });

  it("blocks an exact national identifier duplicate and does not auto-merge", () => {
    const decision = ACTIVECLINIC_DUPLICATE_POLICY.decide({
      matchCode: PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH,
      reasons: ["national_id"],
    });
    assert.equal(decision.blocking, true);
    assert.equal(decision.action, "BLOCK");
    assert.equal(JSON.stringify(ACTIVECLINIC_DUPLICATE_POLICY).includes("auto_merge"), false);
  });

  it("keeps production OTP blocked for patient login", () => {
    const activation = resolveOtpActivation(
      { NODE_ENV: "production", DEPLOYMENT_ENV: "production" },
      "ACTIVE"
    );
    assert.equal(activation.status, "BLOCKED");
    assert.match(loginHandler, /activeclinic\.patient_login/);
  });
});
