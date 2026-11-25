"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { uniqueFixturePhone } = require("../fixtures/v13SyntheticFixtures");

describe("G146 HTTP fixture phones", () => {
  it("keeps a Zambia length and does not reuse a 3-digit tail across clinics", () => {
    const source = "+260977100001";
    const first = uniqueFixturePhone(source, 1_700_000_000_000, 1, 1);
    const second = uniqueFixturePhone(source, 1_700_000_000_000, 2, 1);
    assert.match(first, /^\+260977\d{6}$/);
    assert.match(second, /^\+260977\d{6}$/);
    assert.notEqual(first, second);
    assert.notEqual(first.slice(-6), source.slice(-3));
    assert.equal(uniqueFixturePhone(source, 1_700_000_000_000, 1, 1), first);
  });
});
