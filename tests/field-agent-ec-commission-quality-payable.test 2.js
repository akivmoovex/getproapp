"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeEcCommissionQualityPayableHoldbackOnly,
} = require("../src/fieldAgent/fieldAgentEcCommissionQualityPayable");

test("EC holdback payable: no rating → payable = earned, no withheld", () => {
  const r = computeEcCommissionQualityPayableHoldbackOnly({
    earnedEcCommission30: 42.5,
    avgRating30: null,
    lowThreshold: 3,
  });
  assert.equal(r.earnedEcCommission30, 42.5);
  assert.equal(r.payableEcCommission30, 42.5);
  assert.equal(r.withheldEcCommission30, 0);
  assert.equal(r.qualityEligibilityLabel, "No quality adjustment this period");
});

test("EC holdback payable: rating < low → payable = 0, withheld = earned", () => {
  const r = computeEcCommissionQualityPayableHoldbackOnly({
    earnedEcCommission30: 100,
    avgRating30: 2.9,
    lowThreshold: 3,
  });
  assert.equal(r.earnedEcCommission30, 100);
  assert.equal(r.payableEcCommission30, 0);
  assert.equal(r.withheldEcCommission30, 100);
  assert.equal(r.qualityEligibilityLabel, "Withheld pending quality");
});

test("EC holdback payable: rating >= low → payable = earned", () => {
  const r = computeEcCommissionQualityPayableHoldbackOnly({
    earnedEcCommission30: 80,
    avgRating30: 3,
    lowThreshold: 3,
  });
  assert.equal(r.payableEcCommission30, 80);
  assert.equal(r.withheldEcCommission30, 0);
  assert.equal(r.qualityEligibilityLabel, "Eligible this period");
});

test("EC holdback payable: high threshold does not add bonus (rating at high)", () => {
  const r = computeEcCommissionQualityPayableHoldbackOnly({
    earnedEcCommission30: 50,
    avgRating30: 5,
    lowThreshold: 3,
  });
  assert.equal(r.payableEcCommission30, 50);
  assert.equal(r.withheldEcCommission30, 0);
});

test("EC holdback payable: uses default low when lowThreshold omitted", () => {
  const r = computeEcCommissionQualityPayableHoldbackOnly({
    earnedEcCommission30: 10,
    avgRating30: 2.4,
  });
  assert.equal(r.payableEcCommission30, 0);
  assert.equal(r.withheldEcCommission30, 10);
});

test("EC holdback payable: same low threshold semantics as normalized tenant (explicit)", () => {
  const low = 3.1;
  const a = computeEcCommissionQualityPayableHoldbackOnly({
    earnedEcCommission30: 1,
    avgRating30: 3.09,
    lowThreshold: low,
  });
  const b = computeEcCommissionQualityPayableHoldbackOnly({
    earnedEcCommission30: 1,
    avgRating30: 3.1,
    lowThreshold: low,
  });
  assert.equal(a.withheldEcCommission30, 1);
  assert.equal(b.withheldEcCommission30, 0);
});
