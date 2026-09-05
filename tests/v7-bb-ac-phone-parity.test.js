"use strict";

/**
 * BB + AC phone normalization parity (shared phoneNumberService authority).
 * Proves product wrappers agree on Zambia inputs and national > legacy precedence.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  normalizePhoneNumber,
  extractPhoneFieldsFromBody,
} = require("../src/platform/services/phoneNumberService");
const {
  normalizeBlessBoardPhone,
} = require("../src/blessboard/services/normalizeBlessBoardPhone");
const {
  normalizeRegistrationPhone,
} = require("../src/blessboard/services/normalizeRegistrationPhone");
const {
  normalizeActiveClinicPhone,
} = require("../src/activeclinic/services/normalizeActiveClinicContact");

const ZAMBIA_MATRIX = [
  "0971000001",
  "971000001",
  "+260971000001",
  "260971000001",
  "0971 000 001",
  "0971-000-001",
];

const EXPECTED_E164 = "+260971000001";

function e164FromBb(raw) {
  const r = normalizeBlessBoardPhone(raw, { phoneCountry: "ZM" });
  assert.equal(r.ok, true, `BB failed for ${raw}: ${r.error || ""}`);
  return r.normalized;
}

function e164FromReg(raw) {
  const r = normalizeRegistrationPhone(raw, { phoneCountry: "ZM" });
  assert.equal(r.ok, true, `BB registration failed for ${raw}: ${r.error || ""}`);
  return r.normalized;
}

function e164FromAc(raw) {
  const r = normalizeActiveClinicPhone(raw, { country: "ZM" });
  assert.equal(r.ok, true, `AC failed for ${raw}: ${r.code || r.error || ""}`);
  return r.normalized || r.e164;
}

function e164FromShared(raw) {
  const r = normalizePhoneNumber({ phone: raw, phoneCountry: "ZM" });
  assert.equal(r.ok, true, `shared failed for ${raw}: ${r.error || ""}`);
  return r.e164;
}

describe("V7 BB/AC phone parity", () => {
  it("Zambia input matrix normalizes identically across shared + BB + AC wrappers", () => {
    for (const raw of ZAMBIA_MATRIX) {
      const shared = e164FromShared(raw);
      const bb = e164FromBb(raw);
      const reg = e164FromReg(raw);
      const ac = e164FromAc(raw);
      assert.equal(shared, EXPECTED_E164, `shared ${raw}`);
      assert.equal(bb, EXPECTED_E164, `BB ${raw}`);
      assert.equal(reg, EXPECTED_E164, `registration ${raw}`);
      assert.equal(ac, EXPECTED_E164, `AC ${raw}`);
    }
  });

  it("rejects empty / too short / malformed consistently", () => {
    const invalid = ["", "12", "abcdefghij", "+999999999999999999"];
    for (const raw of invalid) {
      const shared = normalizePhoneNumber({ phone: raw, phoneCountry: "ZM" });
      const bb = normalizeBlessBoardPhone(raw, { phoneCountry: "ZM" });
      const ac = normalizeActiveClinicPhone(raw, { country: "ZM" });
      assert.equal(shared.ok, false, `shared should reject ${JSON.stringify(raw)}`);
      assert.equal(bb.ok, false, `BB should reject ${JSON.stringify(raw)}`);
      assert.equal(ac.ok, false, `AC should reject ${JSON.stringify(raw)}`);
    }
  });

  it("empty legacy phone cannot override valid phone_national", () => {
    const body = {
      phone: "",
      phone_country: "ZM",
      phone_national: "977198697",
    };
    const fields = extractPhoneFieldsFromBody(body);
    const shared = normalizePhoneNumber({
      phone: fields.phone,
      phoneCountry: fields.phoneCountry,
      phoneNational: fields.phoneNational,
    });
    const bb = normalizeBlessBoardPhone(fields.phone, {
      phoneCountry: fields.phoneCountry,
      phoneNational: fields.phoneNational,
    });
    const ac = normalizeActiveClinicPhone({
      phone: fields.phone,
      phoneCountry: fields.phoneCountry,
      phoneNational: fields.phoneNational,
    });
    assert.equal(shared.ok, true);
    assert.equal(shared.e164, "+260977198697");
    assert.equal(bb.ok, true);
    assert.equal(bb.normalized, "+260977198697");
    assert.equal(ac.ok, true);
    assert.equal(ac.normalized || ac.e164, "+260977198697");
  });

  it("phone_national takes precedence over conflicting legacy phone", () => {
    const shared = normalizePhoneNumber({
      phone: "+260971000001",
      phoneCountry: "ZM",
      phoneNational: "977198697",
    });
    assert.equal(shared.ok, true);
    assert.equal(shared.e164, "+260977198697");
  });

  it("register-church no longer emits hidden legacy phone by default", () => {
    const registerChurch = fs.readFileSync(
      path.join(__dirname, "../views/blessboard/v5/apex/register-church.ejs"),
      "utf8"
    );
    assert.match(registerChurch, /showLegacyHidden:\s*false/);
    assert.doesNotMatch(registerChurch, /showLegacyHidden:\s*true/);
  });

  it("register-clinic keeps split fields without legacy emit", () => {
    const registerClinic = fs.readFileSync(
      path.join(__dirname, "../views/activeclinic/public/register-clinic.ejs"),
      "utf8"
    );
    assert.match(registerClinic, /showLegacyHidden:\s*false/);
    assert.match(registerClinic, /phone_country|phoneCountry/);
  });
});
