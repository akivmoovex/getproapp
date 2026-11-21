"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { closeEncounter, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const { reviewMigrationPatientMatch } = require(
  "../../../src/activeclinic/services/activeClinicRecordMigrationService"
);

describe("G09–G12 journey integrity", () => {
  it("refuses encounter closeout before a query when the actor or scope is missing", async () => {
    const db = {
      async query() {
        throw new Error("closeout must not query");
      },
    };
    const result = await closeEncounter(db, { closureNote: "done" });
    assert.equal(result.ok, false);
    assert.equal(result.code, RESULT.INVALID_INPUT);
    assert.equal(result.encounter, null);
  });

  it("does not choose a patient when two strong matches are present", () => {
    const review = reviewMigrationPatientMatch([
      { strength: "strong", patientId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
      { strength: "strong", patientId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
    ]);
    assert.equal(review.status, "review_required");
    assert.equal(review.patientId, null);
    assert.equal(review.merged, false);
  });
});
