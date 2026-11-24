"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { classifyVitalHistory } = require("../../../src/activeclinic/services/activeClinicClinicalService");

describe("G125 vitals correction history", () => {
  it("keeps the original row and marks only the latest correction as current", () => {
    const rows = classifyVitalHistory([
      {
        id: "original",
        valueNumeric: 80,
        correctsObservationId: null,
        recordedByStaffId: "nurse-a",
        createdAt: "2026-11-23T08:00:00.000Z",
      },
      {
        id: "correction",
        valueNumeric: 72,
        correctsObservationId: "original",
        correctionReason: "entry error",
        recordedByStaffId: "nurse-b",
        createdAt: "2026-11-23T08:05:00.000Z",
      },
    ]);
    const original = rows.find((row) => row.id === "original");
    const correction = rows.find((row) => row.id === "correction");
    assert.equal(original.valueNumeric, 80);
    assert.equal(original.superseded, true);
    assert.equal(original.current, false);
    assert.equal(correction.valueNumeric, 72);
    assert.equal(correction.current, true);
    assert.equal(correction.correctionReason, "entry error");
    assert.equal(correction.recordedByStaffId, "nurse-b");
  });
});
