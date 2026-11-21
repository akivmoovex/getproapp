"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  mergeActiveClinicPatients,
} = require("../../../src/activeclinic/services/activeClinicPatientService");
const {
  recordVitalSignObservation,
  VITAL_OBSERVATION_TYPES,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicClinicalService");

describe("G02 patient journey contracts", () => {
  it("does not merge uncertain patient matches", async () => {
    const result = await mergeActiveClinicPatients();
    assert.equal(result.ok, false);
    assert.equal(result.code, "merge_deferred");
  });

  it("accepts only the stored vital types and rejects an unknown measurement before any query", async () => {
    for (const type of [
      "blood_pressure",
      "heart_rate",
      "temperature",
      "respiratory_rate",
      "oxygen_saturation",
      "height",
      "weight",
    ]) {
      assert.equal(VITAL_OBSERVATION_TYPES.includes(type), true);
    }

    const db = {
      async query() {
        throw new Error("vital validation must not query");
      },
    };
    const rejected = await recordVitalSignObservation(db, {
      observationType: "auto_diagnosis",
      actor: { staffMemberId: "11111111-1111-4111-8111-111111111111" },
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.code, RESULT.INVALID_INPUT);

    const incomplete = await recordVitalSignObservation(db, {
      observationType: "heart_rate",
      valueNumeric: 72,
      unit: "bpm",
    });
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.code, RESULT.INVALID_INPUT);
  });
});
