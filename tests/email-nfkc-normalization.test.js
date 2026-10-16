"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { normalizeEmail } = require("../src/platform/services/platformIdentityService");
const {
  normalizeActiveClinicEmail,
} = require("../src/activeclinic/services/normalizeActiveClinicContact");

describe("V209 email NFKC normalization", () => {
  it("canonicalizes Unicode-equivalent identity emails", () => {
    const composed = normalizeEmail("user@ｅxample.com");
    assert.equal(composed, "user@example.com");
    assert.equal(normalizeEmail(" USER@EXAMPLE.COM "), composed);
    assert.equal(normalizeActiveClinicEmail("user@ｅxample.com").normalized, composed);
  });

  it("preserves invalid-email rejection and ASCII behavior", () => {
    assert.equal(normalizeEmail(""), null);
    assert.equal(normalizeEmail(null), null);
    assert.equal(normalizeActiveClinicEmail("not-an-email").ok, false);
    assert.deepEqual(normalizeActiveClinicEmail(" User@Example.COM "), {
      ok: true,
      normalized: "user@example.com",
      display: "User@Example.COM",
    });
  });
});
