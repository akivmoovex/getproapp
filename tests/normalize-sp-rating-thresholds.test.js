"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeCommerceRow } = require("../src/tenants/tenantCommerceSettings");
const {
  DEFAULT_SP_RATING_LOW_THRESHOLD,
  DEFAULT_SP_RATING_HIGH_THRESHOLD,
  normalizeSpRatingThresholdsForTenant,
} = require("../src/fieldAgent/normalizeSpRatingThresholds");

test("defaults when both null: 2.5 / 4.0", () => {
  const r = normalizeSpRatingThresholdsForTenant({
    field_agent_sp_rating_low_threshold: null,
    field_agent_sp_rating_high_threshold: null,
  });
  assert.equal(r.low, 2.5);
  assert.equal(r.high, 4.0);
});

test("defaults when commerce empty", () => {
  const r = normalizeSpRatingThresholdsForTenant({});
  assert.equal(r.low, DEFAULT_SP_RATING_LOW_THRESHOLD);
  assert.equal(r.high, DEFAULT_SP_RATING_HIGH_THRESHOLD);
});

test("valid custom thresholds", () => {
  const r = normalizeSpRatingThresholdsForTenant({
    field_agent_sp_rating_low_threshold: 3,
    field_agent_sp_rating_high_threshold: 4.5,
  });
  assert.equal(r.low, 3);
  assert.equal(r.high, 4.5);
});

test("values clamped to [0, 5]", () => {
  const r = normalizeSpRatingThresholdsForTenant({
    field_agent_sp_rating_low_threshold: -1,
    field_agent_sp_rating_high_threshold: 6,
  });
  assert.equal(r.low, 0);
  assert.equal(r.high, 5);
  assert.ok(r.high >= r.low);
});

test("high < low after values: fallback to defaults", () => {
  const r = normalizeSpRatingThresholdsForTenant({
    field_agent_sp_rating_low_threshold: 4,
    field_agent_sp_rating_high_threshold: 3,
  });
  assert.equal(r.low, DEFAULT_SP_RATING_LOW_THRESHOLD);
  assert.equal(r.high, DEFAULT_SP_RATING_HIGH_THRESHOLD);
});

test("invalid raw strings use defaults for that side", () => {
  const r = normalizeSpRatingThresholdsForTenant(
    normalizeCommerceRow({ field_agent_sp_rating_low_threshold: "x", field_agent_sp_rating_high_threshold: 4 })
  );
  assert.equal(r.low, DEFAULT_SP_RATING_LOW_THRESHOLD);
  assert.equal(r.high, 4);
});
