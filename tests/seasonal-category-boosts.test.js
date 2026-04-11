"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  applySeasonalTrendingBoost,
  seasonalBoostForCategory,
  globalSeasonalCategoryBoosts,
  getGeoRulesForRequest,
} = require("../src/config/seasonalCategoryBoosts");

test("seasonalBoostForCategory: June boosts air-conditioning", () => {
  const b = seasonalBoostForCategory(6, "air-conditioning", globalSeasonalCategoryBoosts);
  assert.equal(b, 3);
});

test("seasonalBoostForCategory: January boosts tax-services", () => {
  const b = seasonalBoostForCategory(1, "tax-services", globalSeasonalCategoryBoosts);
  assert.equal(b, 3);
});

test("seasonalBoostForCategory: unknown slug gets 0", () => {
  assert.equal(seasonalBoostForCategory(6, "plumbing", globalSeasonalCategoryBoosts), 0);
});

test("applySeasonalTrendingBoost: boosted category can outrank higher base when season matches", () => {
  const rows = [
    { slug: "widgets", name: "Widgets", listing_count: 9 },
    { slug: "air-conditioning", name: "AC", listing_count: 8 },
  ];
  const out = applySeasonalTrendingBoost(rows, { month: 7 });
  assert.equal(out[0].slug, "air-conditioning");
  assert.equal(out[0].final_score, 11);
  assert.equal(out[1].slug, "widgets");
});

test("applySeasonalTrendingBoost: tie-breaker by name when final_score equal", () => {
  const rows = [
    { slug: "a", name: "Zebra", listing_count: 5 },
    { slug: "b", name: "Alpha", listing_count: 5 },
  ];
  const out = applySeasonalTrendingBoost(rows, { month: 13 });
  assert.equal(out[0].name, "Alpha");
  assert.equal(out[1].name, "Zebra");
});

test("getGeoRulesForRequest: IL returns IL rule set", () => {
  const r = getGeoRulesForRequest(undefined, "IL");
  assert.ok(Array.isArray(r));
  assert.ok(r.some((x) => x.category === "air-conditioning"));
});

test("getGeoRulesForRequest: empty country falls back to DEFAULT", () => {
  const r = getGeoRulesForRequest(undefined, "");
  assert.ok(r.some((x) => x.category === "tax-services"));
});

test("geo IL: June applies air-conditioning boost from geo rules", () => {
  const rows = [{ slug: "air-conditioning", name: "AC", listing_count: 1 }];
  const out = applySeasonalTrendingBoost(rows, { month: 6, countryCode: "IL" });
  assert.equal(out[0].geo_seasonal_boost, 3);
  assert.equal(out[0].seasonal_boost, 3);
});

test("geo ZM: June boosts heating", () => {
  const rows = [{ slug: "heating", name: "H", listing_count: 1 }];
  const out = applySeasonalTrendingBoost(rows, { month: 6, countryCode: "ZM" });
  assert.equal(out[0].geo_seasonal_boost, 3);
});

test("geo ZM: October boosts tutor", () => {
  const rows = [{ slug: "tutor", name: "T", listing_count: 1 }];
  const out = applySeasonalTrendingBoost(rows, { month: 10, countryCode: "ZM" });
  assert.equal(out[0].geo_seasonal_boost, 2);
});

test("max(geo, global) avoids double-count when both match", () => {
  const rows = [{ slug: "air-conditioning", name: "AC", listing_count: 10 }];
  const out = applySeasonalTrendingBoost(rows, { month: 7, countryCode: "IL" });
  assert.equal(out[0].geo_seasonal_boost, 3);
  assert.equal(out[0].fallback_seasonal_boost, 3);
  assert.equal(out[0].seasonal_boost, 3);
  assert.equal(out[0].final_score, 13);
});
