"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  validateTargetSha,
  assertCheckoutMatches,
  buildChildDispatchInputs,
} = require("../dailyShaContract");

const SHA = "a8fdd24926899934700d4e1898a22db93ef174fe";

test("accepts exactly 40 hexadecimal target SHAs", () => {
  assert.equal(validateTargetSha(SHA), SHA);
  assert.equal(validateTargetSha(SHA.toUpperCase()), SHA);
});

test("rejects missing, malformed, and branch target values", () => {
  for (const value of ["", "V12", "main", `${SHA}0`, "g".repeat(40)]) {
    assert.throws(() => validateTargetSha(value), /40 hexadecimal/);
  }
});

test("requires checkout SHA to equal the approved target", () => {
  assert.equal(assertCheckoutMatches(SHA, SHA), true);
  assert.throws(
    () => assertCheckoutMatches(SHA, "b".repeat(40)),
    /checkout SHA mismatch/
  );
});

test("passes one validated target SHA to every child dispatch", () => {
  const inputs = buildChildDispatchInputs(SHA);
  assert.deepEqual(inputs, { target_sha: SHA });
});

test("rejects child dispatch pass-through when the target is absent", () => {
  assert.throws(() => buildChildDispatchInputs(""), /40 hexadecimal/);
});
