"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  cityNamesAll,
  mergeCityNamesForLanding,
  pickExploreCityNames,
  isWhitelistedService,
  isWhitelistedCity,
  buildEmptyStateSuggestions,
} = require("../src/lib/tenantOptionLists");

test("cityNamesAll dedupes case-insensitively", () => {
  const out = cityNamesAll([{ name: "Lusaka" }, { name: "lusaka" }, { name: "Ndola" }]);
  assert.deepEqual(out, ["Lusaka", "Ndola"]);
});

test("mergeCityNamesForLanding keeps enabled only", () => {
  const out = mergeCityNamesForLanding([
    { name: "A", enabled: true },
    { name: "B", enabled: 0 },
    { name: "C", enabled: 1 },
  ]);
  assert.deepEqual(out, ["A", "C"]);
});

test("pickExploreCityNames prefers big_city among enabled", () => {
  const out = pickExploreCityNames([
    { name: "Small", enabled: true, big_city: false },
    { name: "Big1", enabled: true, big_city: true },
    { name: "Big2", enabled: true, big_city: true },
  ]);
  assert.deepEqual(out, ["Big1", "Big2"]);
});

test("isWhitelistedService matches tenant category names only", () => {
  assert.equal(isWhitelistedService("Plumber", ["Plumber"]), true);
  assert.equal(isWhitelistedService("Nope", ["Plumber"]), false);
});

test("isWhitelistedCity matches tenant city list", () => {
  assert.equal(isWhitelistedCity("Lusaka", ["Lusaka", "Ndola"]), true);
  assert.equal(isWhitelistedCity("Paris", ["Lusaka"]), false);
});

test("buildEmptyStateSuggestions uses city options from args", () => {
  const { emptyAltCities } = buildEmptyStateSuggestions(
    [{ slug: "a", name: "A" }],
    "b",
    "",
    ["Lusaka", "Ndola"]
  );
  assert.ok(emptyAltCities.includes("Lusaka"));
});
