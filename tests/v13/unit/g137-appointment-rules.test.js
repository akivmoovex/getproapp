"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateSlotCapacity,
  intervalsOverlap,
  classifyIdempotentRetry,
  staffOverlapApplies,
} = require("../../../src/activeclinic/services/appointmentSchedulingRules");

const START = "2026-12-02T09:00:00.000Z";
const MID = "2026-12-02T09:30:00.000Z";
const END = "2026-12-02T10:00:00.000Z";

describe("G137 appointment rules", () => {
  it("keeps slot capacity unapproved and unwired from a capacity number", () => {
    const result = evaluateSlotCapacity();
    assert.equal(result.ok, false);
    assert.equal(result.code, "BLOCKED_APPROVAL_REQUIRED");
    assert.equal(result.capacity, null);
    assert.equal(result.reason, "slot_capacity_not_approved");
  });

  it("treats a touching interval as free and an intersecting interval as overlap", () => {
    assert.equal(intervalsOverlap(START, MID, MID, END), false);
    assert.equal(intervalsOverlap(START, MID, "2026-12-02T09:15:00.000Z", "2026-12-02T09:45:00.000Z"), true);
    assert.equal(intervalsOverlap(START, MID, END, "2026-12-02T10:30:00.000Z"), false);
  });

  it("applies staff overlap only when a staff member is assigned", () => {
    assert.equal(staffOverlapApplies(null), false);
    assert.equal(staffOverlapApplies(""), false);
    assert.equal(staffOverlapApplies("abababab-abab-4aba-8aba-abababababab"), true);
  });

  it("classifies a repeated request separately from a slot lock", () => {
    assert.deepEqual(classifyIdempotentRetry(null), { duplicate: false, capacity: null });
    const again = classifyIdempotentRetry({ id: "existing" });
    assert.equal(again.duplicate, true);
    assert.equal(again.capacity, null);
    assert.equal(again.protection, "request_dedup_not_slot_lock");
  });
});
