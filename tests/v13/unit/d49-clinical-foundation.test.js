"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { startEncounter, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const { isStoredEncounterType } = require(
  "../../../src/activeclinic/services/clinicalScope"
);

describe("D49 encounter scope", () => {
  it("rejects an encounter type outside the stored check before a query", async () => {
    const result = await startEncounter(
      { async query() { throw new Error("db_not_allowed"); } },
      { encounterType: "inpatient", actor: { staffMemberId: "staff" } }
    );
    assert.equal(result.code, RESULT.INVALID_INPUT);
    assert.equal(isStoredEncounterType("outpatient"), true);
    assert.equal(isStoredEncounterType(""), true);
    assert.equal(isStoredEncounterType("inpatient"), false);
  });
});
