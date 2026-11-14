"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { getPatientReleasedResult, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicPatientPortalClinicalReadService"
);

const ORG = "11111111-1111-4111-8111-111111111111";
const PATIENT = "22222222-2222-4222-8222-222222222222";
const RESULT_ID = "33333333-3333-4333-8333-333333333333";

describe("D51 released document scope", () => {
  it("does not query when the modality is not a released result", async () => {
    const result = await getPatientReleasedResult(
      { async query() { throw new Error("db_not_allowed"); } },
      { organizationId: ORG, patientId: PATIENT, resultId: RESULT_ID, modality: "note" }
    );
    assert.equal(result.code, RESULT.INVALID_INPUT);
  });

  it("reads a laboratory result only with its organization and released status", async () => {
    const queries = [];
    const result = await getPatientReleasedResult(
      {
        async query(sql) {
          queries.push(sql);
          return { rows: [] };
        },
      },
      {
        organizationId: ORG,
        patientId: PATIENT,
        resultId: RESULT_ID,
        modality: "laboratory",
      }
    );
    assert.equal(result.code, RESULT.NOT_FOUND);
    assert.match(queries[0], /req\.organization_id = lr\.organization_id/);
    assert.match(queries[0], /f\.organization_id = lr\.organization_id/);
    assert.match(queries[0], /lr\.status = 'released'/);
  });
});
