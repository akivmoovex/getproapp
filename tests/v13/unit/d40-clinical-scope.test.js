"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { recordTriageAssessment, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const {
  rowBelongsToOrganization,
  isStoredPainLevel,
  isStoredTriageCategory,
  isStoredEncounterStatus,
} = require("../../../src/activeclinic/services/clinicalScope");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function throwingDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

describe("D40 clinical scope", () => {
  it("rejects a pain level or triage category outside the stored check before a query", async () => {
    const pain = await recordTriageAssessment(throwingDb(), { painLevel: 11 });
    assert.equal(pain.code, RESULT.INVALID_INPUT);
    const category = await recordTriageAssessment(throwingDb(), { triageCategory: "critical" });
    assert.equal(category.code, RESULT.INVALID_INPUT);
    assert.equal(isStoredPainLevel(0), true);
    assert.equal(isStoredPainLevel(10), true);
    assert.equal(isStoredPainLevel(null), true);
    assert.equal(isStoredPainLevel(4.5), false);
  });

  it("does not treat another organization or an unstored encounter state as in scope", () => {
    assert.equal(rowBelongsToOrganization({ organization_id: ORG }, ORG), true);
    assert.equal(rowBelongsToOrganization({ organization_id: OTHER }, ORG), false);
    assert.equal(rowBelongsToOrganization(null, ORG), false);
    assert.equal(isStoredEncounterStatus("open"), true);
    assert.equal(isStoredEncounterStatus("completed"), true);
    assert.equal(isStoredEncounterStatus("cancelled"), true);
    assert.equal(isStoredEncounterStatus("REGISTERED"), false);
    assert.equal(isStoredTriageCategory("urgent"), true);
    assert.equal(isStoredTriageCategory("stat"), false);
  });
});
