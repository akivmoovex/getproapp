"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createClinicalDocument, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalDocumentService"
);
const { documentMatchesCallerPatient } = require(
  "../../../src/activeclinic/services/documentScope"
);

const PATIENT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("D42 document scope", () => {
  it("rejects a document call with an unusable organization before a query", async () => {
    const result = await createClinicalDocument(
      { async query() { throw new Error("db_not_allowed"); } },
      { organizationId: "not-an-organization", patientId: PATIENT }
    );
    assert.equal(result.code, RESULT.ORGANIZATION_REQUIRED);
  });

  it("does not treat another patient as the document owner", () => {
    const document = { patient_id: PATIENT };
    assert.equal(documentMatchesCallerPatient(document, PATIENT), true);
    assert.equal(documentMatchesCallerPatient(document, OTHER), false);
    assert.equal(documentMatchesCallerPatient(document, ""), true);
    assert.equal(documentMatchesCallerPatient(null, PATIENT), false);
  });
});
