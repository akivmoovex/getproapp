"use strict";

/**
 * Read-only SP commission quality-adjusted payable (derived layer; no repo changes).
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  HIGH_RATING_THRESHOLD,
  LOW_RATING_THRESHOLD,
  computeSpCommissionQualityPayable,
  formatFieldAgentMoneyAmount,
} = require("../src/fieldAgent/fieldAgentSpCommissionQualityPayable");

const T = { low: LOW_RATING_THRESHOLD, high: HIGH_RATING_THRESHOLD };

test("threshold constants match runtime defaults", () => {
  assert.equal(HIGH_RATING_THRESHOLD, 4.0);
  assert.equal(LOW_RATING_THRESHOLD, 2.5);
});

test("no rating: payable equals earned, no withholding, bonus 0", () => {
  const r = computeSpCommissionQualityPayable({
    earnedSpCommission30: 123.45,
    avgRating30: null,
    bonusPercent: 10,
    lowThreshold: T.low,
    highThreshold: T.high,
  });
  assert.equal(r.earnedSpCommission30, 123.45);
  assert.equal(r.highRatingBonusSpCommission30, 0);
  assert.equal(r.payableSpCommission30, 123.45);
  assert.equal(r.qualityAdjustmentSpCommission30, 0);
  assert.equal(r.withheldSpCommission30, 0);
  assert.equal(r.qualityEligibilityLabel, "No quality adjustment this period");
});

test("null bonus percent: high rating still yields bonus 0", () => {
  const r = computeSpCommissionQualityPayable({
    earnedSpCommission30: 100,
    avgRating30: 4.5,
    bonusPercent: null,
    lowThreshold: T.low,
    highThreshold: T.high,
  });
  assert.equal(r.highRatingBonusSpCommission30, 0);
  assert.equal(r.payableSpCommission30, 100);
});

test("rating < low: bonus 0, payable 0, withheld equals earned", () => {
  const r = computeSpCommissionQualityPayable({
    earnedSpCommission30: 100,
    avgRating30: 2.49,
    bonusPercent: 25,
    lowThreshold: T.low,
    highThreshold: T.high,
  });
  assert.equal(r.earnedSpCommission30, 100);
  assert.equal(r.highRatingBonusSpCommission30, 0);
  assert.equal(r.payableSpCommission30, 0);
  assert.equal(r.qualityAdjustmentSpCommission30, -100);
  assert.equal(r.withheldSpCommission30, 100);
  assert.equal(r.qualityEligibilityLabel, "Withheld pending quality");
});

test("custom low threshold: holdback uses tenant low", () => {
  const r = computeSpCommissionQualityPayable({
    earnedSpCommission30: 50,
    avgRating30: 2.9,
    bonusPercent: 0,
    lowThreshold: 3.0,
    highThreshold: 4.5,
  });
  assert.equal(r.payableSpCommission30, 0);
  assert.equal(r.withheldSpCommission30, 50);
});

test("rating between low and high: bonus 0, payable equals earned", () => {
  const a = computeSpCommissionQualityPayable({
    earnedSpCommission30: 80,
    avgRating30: 2.5,
    bonusPercent: 10,
    lowThreshold: T.low,
    highThreshold: T.high,
  });
  assert.equal(a.highRatingBonusSpCommission30, 0);
  assert.equal(a.payableSpCommission30, 80);

  const b = computeSpCommissionQualityPayable({
    earnedSpCommission30: 80,
    avgRating30: 3.9,
    bonusPercent: 10,
    lowThreshold: T.low,
    highThreshold: T.high,
  });
  assert.equal(b.highRatingBonusSpCommission30, 0);
  assert.equal(b.payableSpCommission30, 80);
});

test("rating >= high with bonus percent: bonus and payable", () => {
  const r = computeSpCommissionQualityPayable({
    earnedSpCommission30: 100,
    avgRating30: 4.0,
    bonusPercent: 10,
    lowThreshold: T.low,
    highThreshold: T.high,
  });
  assert.equal(r.highRatingBonusSpCommission30, 10);
  assert.equal(r.payableSpCommission30, 110);
});

test("custom high threshold: bonus only at or above high", () => {
  const r = computeSpCommissionQualityPayable({
    earnedSpCommission30: 100,
    avgRating30: 4.2,
    bonusPercent: 10,
    lowThreshold: 3.0,
    highThreshold: 4.5,
  });
  assert.equal(r.highRatingBonusSpCommission30, 0);
  assert.equal(r.payableSpCommission30, 100);
});

test("rating >= high: payable formula earned + bonus - withheld", () => {
  const r = computeSpCommissionQualityPayable({
    earnedSpCommission30: 50,
    avgRating30: 4.5,
    bonusPercent: 20,
    lowThreshold: T.low,
    highThreshold: T.high,
  });
  assert.equal(r.highRatingBonusSpCommission30, 10);
  assert.equal(r.payableSpCommission30, 60);
});

test("earned input unchanged: matches raw SP_Commission tile input", () => {
  const earned = 42.12;
  const r = computeSpCommissionQualityPayable({
    earnedSpCommission30: earned,
    avgRating30: 4.5,
    bonusPercent: 0,
    lowThreshold: T.low,
    highThreshold: T.high,
  });
  assert.equal(r.earnedSpCommission30, earned);
});

test("formatFieldAgentMoneyAmount uses tenant symbol and handles negatives", () => {
  assert.equal(formatFieldAgentMoneyAmount(10, "K", "ZMW"), "K 10.00");
  assert.equal(formatFieldAgentMoneyAmount(-10, "K", "ZMW"), "-K 10.00");
  assert.equal(formatFieldAgentMoneyAmount(10, "", "ZMW"), "ZMW 10.00");
});
