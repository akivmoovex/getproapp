"use strict";

/**
 * Architectural: BB form phone resolution + shared normalizer parity.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveBlessBoardFormPhone,
} = require("../src/blessboard/services/resolveBlessBoardFormPhone");
const {
  normalizeBlessBoardPhone,
} = require("../src/blessboard/services/normalizeBlessBoardPhone");
const {
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");
const {
  normalizePhoneNumber,
} = require("../src/platform/services/phoneNumberService");

describe("v7 BB form phone split", () => {
  it("ZM + 977198697 → +260977198697 via resolveBlessBoardFormPhone", () => {
    const resolved = resolveBlessBoardFormPhone(
      { phone_country: "ZM", phone_national: "977198697" },
      { required: true, allowLegacyPhone: false, env: { DEPLOYMENT_ENV: "testing" } }
    );
    assert.equal(resolved.result.ok, true);
    assert.equal(resolved.e164, "+260977198697");
  });

  it("rejects legacy body.phone when allowLegacyPhone is false", () => {
    const resolved = resolveBlessBoardFormPhone(
      { phone: "+260977198697" },
      { required: true, allowLegacyPhone: false, env: { DEPLOYMENT_ENV: "testing" } }
    );
    assert.equal(resolved.result.ok, false);
  });

  it("accepts legacy body.phone only when allowLegacyPhone is true", () => {
    const resolved = resolveBlessBoardFormPhone(
      { phone: "+260977198697" },
      { required: true, allowLegacyPhone: true, env: { DEPLOYMENT_ENV: "testing" } }
    );
    assert.equal(resolved.result.ok, true);
    assert.equal(resolved.e164, "+260977198697");
  });

  it("normalizeBlessBoardPhone and normalizeRegistrationPhone match phoneNumberService", () => {
    const shared = normalizePhoneNumber({
      phoneNational: "977198697",
      phoneCountry: "ZM",
      defaultCountry: "ZM",
      required: true,
      env: { DEPLOYMENT_ENV: "testing" },
    });
    const bb = normalizeBlessBoardPhone("977198697", {
      phoneCountry: "ZM",
      phoneNational: "977198697",
      defaultCountry: "ZM",
      env: { DEPLOYMENT_ENV: "testing" },
    });
    const reg = normalizeRegistrationPhone("977198697", {
      phoneCountry: "ZM",
      phoneNational: "977198697",
      env: { DEPLOYMENT_ENV: "testing" },
    });
    assert.equal(shared.ok, true);
    assert.equal(bb.ok, true);
    assert.equal(reg.ok, true);
    assert.equal(shared.e164, "+260977198697");
    assert.equal(bb.normalized, shared.e164);
    assert.equal(reg.normalized, shared.e164);
  });

  it("optional empty national yields null e164 when required:false", () => {
    const resolved = resolveBlessBoardFormPhone(
      { phone_country: "ZM", phone_national: "" },
      { required: false, allowLegacyPhone: false }
    );
    assert.equal(resolved.result.ok, true);
    assert.equal(resolved.e164, null);
  });
});
