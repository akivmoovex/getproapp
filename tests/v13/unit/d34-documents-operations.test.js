"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  grantPatientConsent,
  mapConsent,
  CONSENT_TYPES,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicPatientConsentService");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";

function closedDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

describe("D34 documents and consent", () => {
  it("rejects a forged organization on consent before any query", async () => {
    const result = await grantPatientConsent(closedDb(), {
      organizationId: ORG,
      healthcareOrganizationId: ORG,
      patientId: OTHER,
      consentType: "treatment",
      captureMethod: "written",
      actor: { staffMemberId: OTHER },
      body: { organizationId: OTHER },
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.FORGED_TENANT);
  });

  it("maps a consent row without a representative or a retention period", () => {
    const mapped = mapConsent({
      id: ORG,
      organization_id: ORG,
      healthcare_organization_id: ORG,
      patient_id: OTHER,
      consent_type: "treatment",
      status: "granted",
      capture_method: "written",
      consent_version: "1.0",
    });
    assert.equal(mapped.representativeId, undefined);
    assert.equal(mapped.legalHold, undefined);
    assert.equal(CONSENT_TYPES.includes("treatment"), true);
    assert.equal(CONSENT_TYPES.includes("research_use_of_images"), false);
  });
});
