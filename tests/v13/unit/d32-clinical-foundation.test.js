"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTIVECLINIC_DUPLICATE_POLICY,
} = require("../../../src/platform/person/duplicate/duplicatePolicies");
const { PERSON_MATCH_CODE, PERSON_MATCH_ACTION } = require("../../../src/platform/person/duplicate/matchCodes");

describe("D32 patient identity", () => {
  it("ID-01-02 blocks an exact identifier and does not merge", () => {
    const decision = ACTIVECLINIC_DUPLICATE_POLICY.decide({
      matchCode: PERSON_MATCH_CODE.EXACT_IDENTIFIER_MATCH,
      reasons: ["nrc"],
    });
    assert.equal(decision.action, PERSON_MATCH_ACTION.BLOCK);
    assert.equal(decision.blocking, true);
    assert.equal(decision.overrideAllowed, false);
    assert.equal(decision.action, "BLOCK");
  });

  it("ID-01-02 keeps a name-only match as a warning", () => {
    const decision = ACTIVECLINIC_DUPLICATE_POLICY.decide({
      matchCode: PERSON_MATCH_CODE.POSSIBLE_MATCH,
      reasons: ["name_only"],
    });
    assert.equal(decision.action, PERSON_MATCH_ACTION.WARN);
    assert.equal(decision.blocking, false);
  });

  it("ID-01-02 holds a stronger duplicate for review instead of merging", () => {
    const decision = ACTIVECLINIC_DUPLICATE_POLICY.decide({
      matchCode: PERSON_MATCH_CODE.STRONG_POSSIBLE_MATCH,
      reasons: ["phone"],
    });
    assert.equal(decision.action, PERSON_MATCH_ACTION.WARN_REVIEW);
    assert.equal(decision.blocking, true);
    assert.equal(decision.reason, "duplicate_override_required");
  });

  it("ID-01-01 allows a clear non-match to continue", () => {
    const decision = ACTIVECLINIC_DUPLICATE_POLICY.decide({
      matchCode: PERSON_MATCH_CODE.NO_MATCH,
      reasons: [],
    });
    assert.equal(decision.action, PERSON_MATCH_ACTION.ALLOW);
    assert.equal(decision.blocking, false);
  });
});
