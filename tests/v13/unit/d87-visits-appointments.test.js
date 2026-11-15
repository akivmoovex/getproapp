"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyIdempotentRetry,
  evaluateSlotCapacity,
  intervalsOverlap,
} = require("../../../src/activeclinic/services/appointmentSchedulingRules");

describe("D87 appointment and visit rules", () => {
  it("treats a missing idempotency row as a new request", () => {
    const retry = classifyIdempotentRetry(null);
    assert.equal(retry.duplicate, false);
    assert.equal(retry.capacity, null);
  });

  it("does not assign a slot capacity", () => {
    const capacity = evaluateSlotCapacity();
    assert.equal(capacity.ok, false);
    assert.equal(capacity.code, "BLOCKED_APPROVAL_REQUIRED");
    assert.equal(capacity.capacity, null);
  });

  it("treats touching appointment intervals as free", () => {
    assert.equal(
      intervalsOverlap(
        "2026-12-01T09:00:00.000Z",
        "2026-12-01T09:30:00.000Z",
        "2026-12-01T09:30:00.000Z",
        "2026-12-01T10:00:00.000Z"
      ),
      false
    );
  });
});
