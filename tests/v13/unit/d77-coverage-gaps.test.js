"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { finalizeClinicalDocument, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalDocumentService"
);

const ORG = "11111111-1111-4111-8111-111111111111";
const FACILITY = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const PATIENT = "44444444-4444-4444-8444-444444444444";
const STAFF = "55555555-5555-4555-8555-555555555555";
const DOC = "66666666-6666-4666-8666-666666666666";

function documentDb(row) {
  const calls = [];
  return {
    calls,
    async query(sql) {
      const text = String(sql);
      calls.push(text);
      if (text.includes("UPDATE")) throw new Error("finalize_not_allowed");
      return { rows: [row] };
    },
  };
}

describe("D77 document finalization coverage", () => {
  it("does not finalize a document stored at another facility", async () => {
    const db = documentDb({
      id: DOC,
      organization_id: ORG,
      facility_id: FACILITY,
      patient_id: PATIENT,
      status: "draft",
      body_text: "SECRET-BODY",
    });
    const result = await finalizeClinicalDocument(db, {
      organizationId: ORG,
      documentId: DOC,
      facilityId: OTHER,
      patientId: PATIENT,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, RESULT.NOT_FOUND);
    assert.equal(JSON.stringify(result).includes("SECRET-BODY"), false);
    assert.equal(db.calls.some((sql) => sql.includes("UPDATE")), false);
  });

  it("does not finalize a document that is already final", async () => {
    const db = documentDb({
      id: DOC,
      organization_id: ORG,
      facility_id: FACILITY,
      patient_id: PATIENT,
      status: "final",
      body_text: "SECRET-BODY",
    });
    const result = await finalizeClinicalDocument(db, {
      organizationId: ORG,
      documentId: DOC,
      facilityId: FACILITY,
      patientId: PATIENT,
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, RESULT.NOT_DRAFT);
    assert.equal(db.calls.some((sql) => sql.includes("UPDATE")), false);
  });
});
