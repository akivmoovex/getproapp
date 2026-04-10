"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhoneDigits } = require("../src/fieldAgent/fieldAgentPhone");

test("normalizePhoneDigits strips non-digits", () => {
  assert.equal(normalizePhoneDigits("+260 97 7123456"), "260977123456");
  assert.equal(normalizePhoneDigits("0977-123-456"), "0977123456");
});

test("normalizePhoneDigits caps length", () => {
  const long = "1".repeat(30);
  assert.equal(normalizePhoneDigits(long).length, 20);
});

test("normalizePhoneDigits handles empty input", () => {
  assert.equal(normalizePhoneDigits(""), "");
  assert.equal(normalizePhoneDigits(null), "");
});
