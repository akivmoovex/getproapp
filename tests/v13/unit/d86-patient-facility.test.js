"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  RESULT,
  assertPatientNumberPolicy,
  assertPatientDoesNotRequirePortal,
} = require("../../../src/activeclinic/services/activeClinicPatientDomainService");

describe("D86 patient and facility safeguards", () => {
  it("accepts a blank patient number so staff can create the record", () => {
    const result = assertPatientNumberPolicy("");
    assert.equal(result.ok, true);
    assert.equal(result.allocated, true);
  });

  it("accepts the existing patient-number format", () => {
    const result = assertPatientNumberPolicy("AC-2026-000001");
    assert.equal(result.ok, true);
    assert.equal(result.patientNumber, "AC-2026-000001");
    assert.equal(result.allocated, false);
  });

  it("rejects a patient number outside the existing format", () => {
    const result = assertPatientNumberPolicy("NATIONAL-1");
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.INVALID_INPUT);
    assert.equal(result.detail, "patient_number_format");
  });

  it("does not require a portal for a staff-created patient", () => {
    const result = assertPatientDoesNotRequirePortal({ id: "patient" });
    assert.equal(result.ok, true);
    assert.equal(result.requiresPortal, false);
    assert.equal(result.code, RESULT.PORTAL_NOT_REQUIRED);
  });
});
