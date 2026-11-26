"use strict";

/**
 * ActiveClinic V2.13.1 deltas only. Does not claim pre-existing clinical features.
 * AC-05 live lower-privilege denial remains unproven.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { getOtpWorkflow } = require("../../../src/platform/otp/otpWorkflows");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("D16 ActiveClinic V2.13.1 contracts", () => {
  it("hooks staff, patient, recovery, and role changes to the shared OTP gate", () => {
    const staff = read("src/activeclinic/http/activeClinicAuthRoutes.js");
    const patient = read("src/activeclinic/http/activeClinicPatientPortalRoutes.js");
    const recovery = read("src/activeclinic/http/activeClinicLifecycleRoutes.js");
    const registration = read("src/activeclinic/http/activeClinicPublicRoutes.js");
    const roles = read("src/activeclinic/services/activeClinicAuthorizationService.js");

    assert.match(staff, /activeclinic\.staff_login/);
    assert.match(patient, /activeclinic\.patient_login/);
    assert.match(patient, /activeclinic\.patient_forgot_password/);
    assert.match(recovery, /activeclinic\.forgot_password/);
    assert.match(registration, /activeclinic\.clinic_administrator_login/);
    assert.match(roles, /activeclinic\.staff_role_change/);
    assert.equal(getOtpWorkflow("activeclinic.patient_portal_activation").independentOfBooking, true);
    assert.equal(getOtpWorkflow("activeclinic.public_booking"), null);
    assert.doesNotMatch(registration, /patient_portal_activation/);

    const csrf = recovery.indexOf("validateCsrf");
    const hold = Math.max(
      recovery.indexOf("holdIfOtpRequired"),
      recovery.indexOf("holdPasswordRecoveryIfOtpRequired"),
      recovery.indexOf("beginEligibleRecoveryOtp")
    );
    assert.ok(csrf > 0 && hold > csrf);
    const patientCsrf = patient.indexOf("validateCsrf");
    const patientHold = Math.max(
      patient.indexOf("holdIfOtpRequired"),
      patient.indexOf("holdPasswordRecoveryIfOtpRequired")
    );
    assert.ok(patientCsrf > 0 && patientHold > patientCsrf);
  });

  it("does not treat AC-05 live authorization denial as proven by these source hooks", () => {
    const roles = read("src/activeclinic/services/activeClinicAuthorizationService.js");
    assert.match(roles, /otp_required/);
    assert.doesNotMatch(roles, /AC-05 closed|lower_privilege_denial_proven/);
  });
});
